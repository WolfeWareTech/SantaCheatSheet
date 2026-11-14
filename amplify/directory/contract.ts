/** Private directory v1. No answer fields or authentication write operations. */
export const DIRECTORY_YEAR = 2026;
export type ContactFields = {
  displayName: string;
  contactEmail: string | null;
  phone: string | null;
  preferredChannel: 'email' | 'phone' | 'none';
  archived: boolean;
  excluded: boolean;
  emailOptOut: boolean;
  phoneOptOut: boolean;
  participation: { year: number; state: 'unknown' | 'active' | 'excluded' };
};
export type AnnualParticipation = { state: 'unknown' | 'active' | 'excluded'; excluded: boolean;
  review: 'pending' | 'reviewed'; updatedAt: string };
export type Contact = ContactFields & {
  annualParticipation?: Record<string, AnnualParticipation>;
  id: string;
  subject: string | null;
  registeredEmail: string | null;
  mapping: 'verified' | 'unregistered' | 'unresolved';
  provenance: { source: string; observedAt: string; review: 'pending' | 'reviewed' };
  revision: number;
  updatedAt: string;
};
export type Directory = { revision: number; contacts: Contact[] };
export type Preview = { id: string; account: Contact['mapping']; approvedCurrentRecipient: boolean;
  personalizedEligible: boolean; channel: ContactFields['preferredChannel']; reasons: string[] };
export class DirectoryRejected extends Error {
  constructor(readonly code: 'forbidden' | 'validation' | 'conflict' | 'missing_data' | 'provider') { super(code); }
}
export const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const editableKeys = ['displayName', 'contactEmail', 'phone', 'preferredChannel', 'archived', 'excluded',
  'emailOptOut', 'phoneOptOut', 'participation'] as const;
export function contactFields(value: unknown): ContactFields {
  if (!object(value) || Object.keys(value).length !== editableKeys.length || editableKeys.some(k => !(k in value))) throw new DirectoryRejected('validation');
  const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max && [...v].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127);
  if (!text(value.displayName, 100) || !(value.displayName as string).trim() ||
    (value.contactEmail !== null && (!text(value.contactEmail, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contactEmail as string))) ||
    (value.phone !== null && (typeof value.phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(value.phone))) ||
    !['email', 'phone', 'none'].includes(value.preferredChannel as string) ||
    ['archived', 'excluded', 'emailOptOut', 'phoneOptOut'].some(k => typeof value[k] !== 'boolean') ||
    !object(value.participation) || Object.keys(value.participation).length !== 2 ||
    value.participation.year !== DIRECTORY_YEAR || !['unknown', 'active', 'excluded'].includes(value.participation.state as string)) throw new DirectoryRejected('validation');
  return { ...Object.fromEntries(editableKeys.map(k => [k, value[k]])), displayName: (value.displayName as string).trim(),
    contactEmail: value.contactEmail === null ? null : (value.contactEmail as string).trim().toLowerCase() } as ContactFields;
}
export function fieldsOf(contact: Contact): ContactFields {
  return Object.fromEntries(editableKeys.map(k => [k, contact[k]])) as ContactFields;
}
export const validParticipationYear = (year: unknown): year is number => Number.isInteger(year) && (year as number) >= 2027 && (year as number) <= 2100;
export function validAnnualParticipation(value: unknown): value is AnnualParticipation {
  return object(value) && Object.keys(value).length === 4 && ['unknown', 'active', 'excluded'].includes(value.state as string) &&
    typeof value.excluded === 'boolean' && ['pending', 'reviewed'].includes(value.review as string) &&
    typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt));
}
export function participationFor(contact: Contact, year: number) {
  if (year === DIRECTORY_YEAR) return { state: contact.participation.state, excluded: contact.excluded,
    review: contact.provenance.review, updatedAt: contact.updatedAt };
  return contact.annualParticipation?.[String(year)] ?? { state: 'unknown' as const, excluded: true, review: 'pending' as const, updatedAt: null };
}
export function activeParticipationCount(directory: Directory, year: number) {
  return directory.contacts.filter(c => {
    const p = participationFor(c, year); return !c.archived && !p.excluded && p.state === 'active';
  }).length;
}
export function validDirectory(value: unknown): value is Directory {
  if (!object(value) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.contacts) || value.contacts.length > 200) return false;
  const ids = new Set<string>();
  return value.contacts.every(c => {
    try {
      if (!object(c) || typeof c.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(c.id) || ids.has(c.id) ||
        !Number.isSafeInteger(c.revision) || (c.revision as number) < 1 || typeof c.updatedAt !== 'string' || !Number.isFinite(Date.parse(c.updatedAt)) ||
        !['verified', 'unregistered', 'unresolved'].includes(c.mapping as string) ||
        !object(c.provenance) || typeof c.provenance.source !== 'string' || !c.provenance.source ||
        typeof c.provenance.observedAt !== 'string' || !Number.isFinite(Date.parse(c.provenance.observedAt)) ||
        !['pending', 'reviewed'].includes(c.provenance.review as string) ||
        (c.subject !== null && (typeof c.subject !== 'string' || !c.subject)) ||
        (c.registeredEmail !== null && (typeof c.registeredEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.registeredEmail))) ||
        (c.mapping === 'verified' && (!c.subject || !c.registeredEmail)) ||
        (c.mapping === 'unregistered' && (c.subject !== null || c.registeredEmail !== null))) return false;
      if (c.annualParticipation !== undefined && (!object(c.annualParticipation) ||
        Object.entries(c.annualParticipation).some(([year, observation]) => !/^\d{4}$/.test(year) || !validParticipationYear(Number(year)) || !validAnnualParticipation(observation)))) return false;
      contactFields(fieldsOf(c as Contact)); ids.add(c.id); return true;
    } catch { return false; }
  });
}
/** Recompute against the complete revision before any future personalized send. Never merge records. */
export function previewDirectory(directory: Directory, year = DIRECTORY_YEAR): Preview[] {
  return directory.contacts.map(c => {
    const reasons: string[] = [];
    const participation = participationFor(c, year);
    if (c.archived) reasons.push('archived');
    if (participation.excluded) reasons.push('excluded');
    if (participation.state !== 'active') reasons.push('participation_not_approved');
    if (participation.review !== 'reviewed') reasons.push('review_pending');
    const emails = (r: Contact) => [r.contactEmail, r.registeredEmail].filter((e): e is string => !!e).map(e => e.toLowerCase());
    if (directory.contacts.some(other => other.id !== c.id &&
      ((c.subject && c.subject === other.subject) || (c.phone && c.phone === other.phone) ||
        c.displayName.toLowerCase() === other.displayName.toLowerCase() || emails(c).some(e => emails(other).includes(e))))) reasons.push('duplicate_or_ambiguous');
    if (c.preferredChannel === 'none') reasons.push('no_channel');
    if (c.preferredChannel === 'phone' && (!c.phone || c.phoneOptOut)) reasons.push(c.phoneOptOut ? 'phone_opt_out' : 'missing_phone');
    if (c.preferredChannel === 'email' && (!c.contactEmail || c.emailOptOut)) reasons.push(c.emailOptOut ? 'email_opt_out' : 'missing_email');
    // An admin contact correction is not proof of a new login identity.
    if (c.mapping === 'verified' && c.contactEmail !== c.registeredEmail?.toLowerCase()) reasons.push('email_identity_mismatch');
    const approvedCurrentRecipient = reasons.length === 0;
    if (c.mapping !== 'verified') reasons.push(c.mapping === 'unregistered' ? 'unregistered' : 'mapping_unresolved');
    return { id: c.id, account: c.mapping, approvedCurrentRecipient, personalizedEligible: reasons.length === 0,
      channel: c.preferredChannel, reasons };
  });
}
