import { createHash } from 'node:crypto';

export const LAUNCH_YEAR = 2026;
export const listFields = ['favoriteCandySnack', 'favoriteScents', 'favoriteFastFoodPlaces',
  'favoriteRestaurants', 'favoriteStores', 'favoritePlaces', 'wishlistTopItems'] as const;
export const textFields = ['cellPhoneModel', 'favoriteSaying', 'favoriteSportsTeam',
  'favoriteColorsTheme', 'favoriteLogoEmblem', 'anniversaryDate', 'clothingSizes',
  'otherFavorites', 'familyDetails', 'additionalNotes'] as const;
export type Answers = Record<typeof listFields[number], string[]> & Record<typeof textFields[number], string>;
export type Sheet = { sheetId: string; participantId: string; ownerSubject: string; year: number;
  state: 'draft' | 'submitted'; revision: number; savedAt: string | null; submittedAt: string | null;
  revisedAt: string | null; answers: Answers; lastRequest?: string; lastDigest?: string };
export type Season = { year: number; state: 'open' | 'closed'; revision: number; deadline: string | null };
export type Event = { field: string; arguments: Record<string, unknown>;
  identity?: { sub?: string; claims?: Record<string, unknown> } | null };
export class Rejected extends Error {
  constructor(public code: string) { super(code); }
}
export interface Store {
  season(year: number): Promise<Season | null>;
  configure(season: Season, expectedRevision: number): Promise<void>;
  get(subject: string, year: number): Promise<Sheet | null>;
  create(sheet: Sheet, season: Season): Promise<void>;
  save(sheet: Sheet, expectedRevision: number, season: Season): Promise<void>;
  progress(year: number, nextToken?: string): Promise<{ items: unknown[]; nextToken: string | null }>;
  legacy(subject: string): Promise<Record<string, unknown>[]>;
}
export const blankAnswers = (): Answers => Object.fromEntries([
  ...listFields.map(k => [k, []]), ...textFields.map(k => [k, '']),
]) as Answers;
export const legacySubject = (owner: unknown): string | null =>
  typeof owner === 'string' && owner.length > 0 ? owner.split('::')[0] : null;
export function answers(input: unknown): Answers {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Rejected('validation');
  const value = input as Record<string, unknown>;
  const fields = [...listFields, ...textFields];
  if (Object.keys(value).some(k => !fields.includes(k as typeof fields[number]))) throw new Rejected('validation');
  for (const k of textFields) if (typeof value[k] !== 'string' || value[k].length > 10000) throw new Rejected('validation');
  for (const k of listFields) if (!Array.isArray(value[k]) || value[k].length > 100 ||
    value[k].some(v => typeof v !== 'string' || v.length > 1000)) throw new Rejected('validation');
  // Canonical order also makes retry fingerprints independent of JSON property order.
  return Object.fromEntries(fields.map(k => [k, value[k]])) as Answers;
}
export const progressOf = (sheet: Sheet) => ({ participantId: sheet.participantId, year: sheet.year,
  state: sheet.state, savedAt: sheet.savedAt, submittedAt: sheet.submittedAt,
  revisedAt: sheet.revisedAt, revision: sheet.revision });
const publicSheet = (sheet: Sheet) => {
  return { ...progressOf(sheet), sheetId: sheet.sheetId, ownerSubject: sheet.ownerSubject, answers: sheet.answers };
};
const yearOf = (year: unknown): number => {
  if (!Number.isInteger(year) || (year as number) < 2025 || (year as number) > 2100) throw new Rejected('validation');
  return year as number;
};
const revisionOf = (value: unknown) => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Rejected('validation');
  return value as number;
};
export function service(store: Store, now = () => new Date().toISOString()) {
  return async (event: Event) => {
    try {
      const subject = event.identity?.sub;
      if (!subject || event.identity?.claims?.sub !== subject) throw new Rejected('forbidden');
      const groups = event.identity?.claims?.['cognito:groups'];
      const admin = Array.isArray(groups) && groups.includes('admin');
      const a = event.arguments;
      const year = yearOf(a.year);
      const target = a.subject === undefined || a.subject === null ? subject : a.subject;
      if (typeof target !== 'string' || !target || (target !== subject && !admin)) throw new Rejected('forbidden');
      if ('owner' in a || 'ownerSubject' in a || 'participantId' in a || 'groups' in a) throw new Rejected('forbidden');
      const season = await store.season(year) ?? (year === LAUNCH_YEAR
        ? { year, state: 'open' as const, revision: 0, deadline: null } : null);
      if (event.field === 'seasonState') {
        if (!season && year !== 2025) throw new Rejected('validation');
        return { ok: true, data: { activeYear: LAUNCH_YEAR, season: year === 2025
          ? { year, state: 'closed', revision: 0, deadline: null } : season } };
      }
      if (event.field === 'configureSeason') {
        if (!admin) throw new Rejected('forbidden');
        if (year <= 2025 || !['open', 'closed'].includes(a.state as string)) throw new Rejected('validation');
        const revision = revisionOf(a.expectedRevision);
        if (a.deadline !== null && a.deadline !== undefined &&
          (typeof a.deadline !== 'string' || !Number.isFinite(Date.parse(a.deadline)))) throw new Rejected('validation');
        const next = { year, state: a.state as Season['state'], revision: revision + 1,
          deadline: (a.deadline as string | null) ?? null };
        await store.configure(next, revision);
        return { ok: true, data: next };
      }
      if (event.field === 'seasonProgress') {
        if (!admin) throw new Rejected('forbidden');
        if (!season) throw new Rejected('validation');
        if (a.nextToken != null && typeof a.nextToken !== 'string') throw new Rejected('validation');
        return { ok: true, data: await store.progress(year, a.nextToken as string | undefined) };
      }
      if (event.field === 'seasonSheet' && year === 2025) {
        const rows = (await store.legacy(target)).filter(row => row.year === 2025 && legacySubject(row.owner) === target);
        if (rows.length > 1) throw new Rejected('conflict');
        return { ok: true, data: rows.length ? { state: 'legacy_saved', year, legacy: rows[0], submittedAt: null } : null };
      }
      if (!season || year <= 2025) throw new Rejected('validation');
      let current = await store.get(target, year);
      if (event.field === 'seasonSheet') {
        if (target !== subject && current?.state !== 'submitted') throw new Rejected('forbidden');
        return { ok: true, data: current ? publicSheet(current) : null };
      }
      // Mutations always derive subject from the verified token, including for admins.
      if (target !== subject) throw new Rejected('forbidden');
      if (season.state !== 'open') throw new Rejected('closed_season');
      if (event.field === 'ensureSeasonSheet') {
        if (!current) {
          const sheet: Sheet = { sheetId: `${subject}:${year}`, participantId: subject,
            ownerSubject: subject, year, state: 'draft', revision: 0, savedAt: null,
            submittedAt: null, revisedAt: null, answers: blankAnswers() };
          for (let attempt = 0; !current && attempt < 5; attempt++) {
            try { await store.create(sheet, season); current = sheet; }
            catch (error) {
              if (!(error instanceof Rejected) || error.code !== 'conflict') throw error;
              current = await store.get(subject, year);
              if (!current) {
                if (attempt === 4) throw error;
                // A conflicting transaction may still be committing. Only this
                // conditional blank create is retried; saved content is untouched.
                await new Promise(resolve => setTimeout(resolve, 20 * (2 ** attempt)));
              }
            }
          }
          if (!current) throw new Rejected('conflict');
        }
        return { ok: true, data: publicSheet(current) };
      }
      if (event.field !== 'saveSeasonSheet') throw new Rejected('validation');
      if (!current) throw new Rejected('missing_data');
      const content = answers(a.answers);
      const revision = revisionOf(a.expectedRevision);
      if (!['save_draft', 'submit'].includes(a.intent as string) || typeof a.idempotencyKey !== 'string' ||
        a.idempotencyKey.length < 8 || a.idempotencyKey.length > 128) throw new Rejected('validation');
      const fingerprint = createHash('sha256').update(JSON.stringify({ content, revision, intent: a.intent })).digest('hex');
      if (current.lastRequest === a.idempotencyKey) {
        if (current.lastDigest !== fingerprint) throw new Rejected('conflict');
        return { ok: true, data: publicSheet(current) };
      }
      if (current.revision !== revision) throw new Rejected('conflict');
      const timestamp = now();
      const next: Sheet = { ...current, answers: content, revision: revision + 1,
        state: current.state === 'submitted' || a.intent === 'submit' ? 'submitted' : 'draft',
        savedAt: timestamp, submittedAt: current.submittedAt ?? (a.intent === 'submit' ? timestamp : null),
        revisedAt: current.state === 'submitted' ? timestamp : null,
        lastRequest: a.idempotencyKey, lastDigest: fingerprint };
      await store.save(next, revision, season);
      return { ok: true, data: publicSheet(next) };
    } catch (error) {
      // Never return SDK errors, event contents, keys or answer values.
      return { ok: false, error: { code: error instanceof Rejected ? error.code : 'unknown',
        safeMessage: 'The season request could not be completed.', retryable: !(error instanceof Rejected) } };
    }
  };
}
