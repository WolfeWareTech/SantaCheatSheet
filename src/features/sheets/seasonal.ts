import type { Answers, Sheet, Season } from "../../../amplify/seasonal/service";
import type { Schema } from "../../../amplify/data/resource";
import { ApiFailure, apiFailure, checkedResult, type UpstreamResult } from "../../lib/apiResults";

export const ACTIVE_YEAR = 2026;
export const HISTORY_YEAR = 2025;
export type SeasonSheet = Omit<Sheet, "lastRequest" | "lastDigest">;
export type LegacySheet = Schema["SantasSheet"]["type"];
export type HistoryTarget = { year: number; subject?: string; name?: string };
export const listFields = ["favoriteCandySnack", "favoriteScents", "favoriteFastFoodPlaces", "favoriteRestaurants",
  "favoriteStores", "favoritePlaces", "wishlistTopItems"] as const;
export const textFields = ["cellPhoneModel", "favoriteSaying", "favoriteSportsTeam", "favoriteColorsTheme",
  "favoriteLogoEmblem", "anniversaryDate", "clothingSizes", "otherFavorites", "familyDetails", "additionalNotes"] as const;

export type FormState = Record<keyof Answers | "displayName" | "year", string>;
export function sheetForm(sheet: Partial<LegacySheet> | null, name: string): FormState {
  return {
    displayName: sheet?.displayName ?? name,
    year: String(sheet?.year ?? ACTIVE_YEAR),
    ...Object.fromEntries(listFields.map(key => [key, (sheet?.[key] ?? []).filter(value => value != null).join("\n")])),
    ...Object.fromEntries(textFields.map(key => [key, sheet?.[key] ?? ""])),
  } as FormState;
}
export function formAnswers(form: FormState): Answers {
  return {
    ...Object.fromEntries(listFields.map(key => [key, form[key].split("\n").map(value => value.trim()).filter(Boolean)])),
    ...Object.fromEntries(textFields.map(key => [key, form[key]])),
  } as Answers;
}
function sameAnswers(left: Answers, right: Answers) {
  return [...listFields, ...textFields].every(key => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}
export function editorSheet(sheet: SeasonSheet): Partial<LegacySheet> & { id: string } {
  return { id: sheet.sheetId, year: sheet.year, ...sheet.answers };
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
// a.json() may arrive as an object or a JSON string. Neither GraphQL errors
// nor an unsuccessful/malformed business envelope may be treated as success.
export async function checkedSeason(operation: () => Promise<UpstreamResult<unknown>>): Promise<unknown> {
  let envelope = await checkedResult(operation);
  if (typeof envelope === "string") {
    try { envelope = JSON.parse(envelope); } catch { throw new ApiFailure("missing_data"); }
  }
  if (!object(envelope) || typeof envelope.ok !== "boolean") throw new ApiFailure("missing_data");
  if (!envelope.ok) {
    if (object(envelope.error) && envelope.error.code === "closed_season") throw new ApiFailure("forbidden");
    throw apiFailure(object(envelope.error) ? { code: envelope.error.code } : undefined);
  }
  if (!("data" in envelope) || envelope.data === undefined) throw new ApiFailure("missing_data");
  return envelope.data;
}
function seasonRecord(value: unknown, subject: string, year: number): SeasonSheet {
  if (!object(value) || value.year !== year || value.ownerSubject !== subject || value.participantId !== subject ||
    value.sheetId !== `${subject}:${year}` || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
    !["draft", "submitted"].includes(value.state as string) || !object(value.answers) ||
    ["savedAt", "submittedAt", "revisedAt"].some(key => value[key] !== null && typeof value[key] !== "string")) throw new ApiFailure("missing_data");
  const answers = value.answers;
  if (Object.keys(answers).length !== listFields.length + textFields.length ||
    listFields.some(key => !Array.isArray(answers[key]) || answers[key].some(item => typeof item !== "string")) ||
    textFields.some(key => typeof answers[key] !== "string")) throw new ApiFailure("missing_data");
  return value as SeasonSheet;
}
export type SaveRequest = { year: number; answers: Answers; expectedRevision: number; intent: string; idempotencyKey: string };
export interface SeasonalTransport {
  queries: { seasonState: (args: { year: number }) => Promise<UpstreamResult<unknown>>; seasonSheet: (args: { year: number; subject?: string }) => Promise<UpstreamResult<unknown>> };
  mutations: {
    ensureSeasonSheet: (args: { year: number }) => Promise<UpstreamResult<unknown>>;
    saveSeasonSheet: (args: Omit<SaveRequest, "answers"> & { answers: string }) => Promise<UpstreamResult<unknown>>;
  };
}
export function seasonApi(client: SeasonalTransport, subject: string, year = ACTIVE_YEAR) {
  return {
    current: async () => {
      const value = await checkedSeason(() => client.queries.seasonState({ year: ACTIVE_YEAR }));
      if (!object(value) || !Number.isInteger(value.activeYear) || (value.activeYear as number) < 2026 || (value.activeYear as number) > 2100 ||
        !object(value.season) || value.season.year !== value.activeYear || !["open", "closed"].includes(value.season.state as string) ||
        (value.season.deadline !== null && (typeof value.season.deadline !== "string" || !Number.isFinite(Date.parse(value.season.deadline))))) throw new ApiFailure("missing_data");
      return value.season as Season;
    },
    read: async () => {
      const value = await checkedSeason(() => client.queries.seasonSheet({ year }));
      return value === null ? null : seasonRecord(value, subject, year);
    },
    ensure: async () => seasonRecord(await checkedSeason(() => client.mutations.ensureSeasonSheet({ year })), subject, year),
    history: async (target: HistoryTarget): Promise<LegacySheet | null> => {
      const value = await checkedSeason(() => client.queries.seasonSheet({ year: target.year, ...(target.subject ? { subject: target.subject } : {}) }));
      if (value === null) return null;
      if (target.year >= 2026) {
        const record = seasonRecord(value, target.subject ?? subject, target.year);
        return { ...editorSheet(record), id: record.sheetId, owner: record.ownerSubject } as LegacySheet;
      }
      if (!object(value) || value.state !== "legacy_saved" || value.year !== HISTORY_YEAR || !object(value.legacy) ||
        value.legacy.year !== HISTORY_YEAR || typeof value.legacy.id !== "string" || typeof value.legacy.owner !== "string" ||
        value.legacy.owner.split("::")[0] !== (target.subject ?? subject)) throw new ApiFailure("missing_data");
      return value.legacy as LegacySheet;
    },
    // Custom-operation AWSJSON arguments are JSON strings on the wire. AppSync
    // parses them into objects before invoking the existing resolver/service.
    save: async (request: SaveRequest) => seasonRecord(await checkedSeason(() => client.mutations.saveSeasonSheet({
      ...request, answers: JSON.stringify(request.answers),
    })), subject, year),
  };
}
export function seasonWriter(api: Pick<ReturnType<typeof seasonApi>, "save">, initial: SeasonSheet, requestId: () => string = () => crypto.randomUUID()) {
  let current = initial;
  let pending: SaveRequest | null = null;
  let busy = false;
  async function confirm() {
    const request = pending!;
    const next = await api.save(request);
    if (next.sheetId !== current.sheetId || next.revision !== request.expectedRevision + 1 ||
      !sameAnswers(next.answers, request.answers)) throw new ApiFailure("missing_data");
    current = next;
    pending = null;
  }
  return async (answers: Answers) => {
    if (busy) throw new ApiFailure("conflict");
    busy = true;
    try {
      // Resolve an uncertain previous write with its original ID, revision and
      // payload before saving later edits. Never silently adopt another tab's revision.
      if (pending) await confirm();
      if (!sameAnswers(current.answers, answers) || current.savedAt === null) {
        pending = { year: current.year, answers: structuredClone(answers), expectedRevision: current.revision,
          intent: "save_draft", idempotencyKey: requestId() };
        await confirm();
      }
      return current;
    } finally { busy = false; }
  };
}
