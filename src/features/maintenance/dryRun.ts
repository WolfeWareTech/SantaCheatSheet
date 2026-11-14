import { listFields, textFields } from '../sheets/seasonal';

export type DryRunRow = { row: number; state: 'valid' | 'invalid'; issues: string[] };
export type DryRunReport = { rows: DryRunRow[]; valid: number; invalid: number };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const instant = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v.replace(/Z$/, v.includes('.') ? 'Z' : '.000Z');
const allowed = new Set<string>(['id', 'owner', 'year', 'displayName', 'createdAt', 'updatedAt', '__typename', ...listFields, ...textFields]);
/** Offline validation only. Never invent IDs, owners, timestamps, or invoke a transport. */
export function dryRun(input: string): DryRunReport {
  if (input.length > 2_000_000) throw Error('Use a JSON sample smaller than 2 MB.');
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { throw Error('Invalid JSON. No rows were validated.'); }
  const records = Array.isArray(parsed) ? parsed : object(parsed) && Object.keys(parsed).length === 1 ? parsed.items : null;
  if (!Array.isArray(records) || records.length > 500) throw Error('Expected an array (or an items array) of at most 500 legacy export records.');
  const identities = new Map<string, number[]>();
  const ids = new Map<string, number[]>();
  const rows: DryRunRow[] = records.map((record, i) => {
    const issues: string[] = [];
    if (!object(record)) return { row: i + 1, state: 'invalid', issues: ['Invalid record schema.'] };
    if (Object.keys(record).some(k => !allowed.has(k)) || (record.__typename !== undefined && record.__typename !== 'SantasSheet')) issues.push('Unknown schema fields or record type.');
    if (typeof record.id !== 'string' || !record.id.trim() || record.id.length > 200) issues.push('Original stable ID is required.');
    else ids.set(record.id, [...(ids.get(record.id) ?? []), i]);
    const subject = typeof record.owner === 'string' ? record.owner.split('::')[0] : '';
    if (!subject || typeof record.owner !== 'string' || !/^[^\s:]+(?:::[^\s]+)?$/.test(record.owner) || record.owner.length > 500) issues.push('Original owner identity is required; contact details cannot establish ownership.');
    if (!Number.isInteger(record.year) || (record.year as number) < 2025 || (record.year as number) > 2100) issues.push('Year must be an integer from 2025 to 2100.');
    else if (subject) { const key = `${subject}:${record.year}`; identities.set(key, [...(identities.get(key) ?? []), i]); }
    if (!instant(record.createdAt) || !instant(record.updatedAt) || Date.parse(record.createdAt as string) > Date.parse(record.updatedAt as string)) issues.push('Original creation and update timestamps must be valid, ordered UTC instants.');
    if (record.displayName != null && (typeof record.displayName !== 'string' || record.displayName.length > 200)) issues.push('Display name has an invalid type or length.');
    if (textFields.some(k => record[k] != null && (typeof record[k] !== 'string' || (record[k] as string).length > 10000)) ||
      listFields.some(k => record[k] != null && (!Array.isArray(record[k]) || record[k].length > 100 || record[k].some(v => v !== null && (typeof v !== 'string' || v.length > 1000))))) issues.push('Answer fields do not match the legacy export schema.');
    return { row: i + 1, state: issues.length ? 'invalid' : 'valid', issues };
  });
  for (const [groups, message] of [[ids, 'Duplicate stable ID in this sample.'], [identities, 'Duplicate owner identity and year in this sample.']] as const) {
    for (const indices of groups.values()) if (indices.length > 1) for (const i of indices) { rows[i].state = 'invalid'; rows[i].issues.push(message); }
  }
  return { rows, valid: rows.filter(r => r.state === 'valid').length, invalid: rows.filter(r => r.state === 'invalid').length };
}
