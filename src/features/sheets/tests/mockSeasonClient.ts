// Synthetic transport only. No Amplify configuration, credentials or endpoints.
import { service, Rejected, type Sheet, type Store, type Season, type ActiveSeason, progressOf } from "../../../../amplify/seasonal/service";
import type { UpstreamResult } from "../../../lib/apiResults";
import type { SeasonalTransport } from "../seasonal";

const legacyFixture = () => [{ id: "legacy-alice", owner: "alice::old-login", year: 2025, displayName: "Historical Alice",
  favoriteCandySnack: ["synthetic history"], additionalNotes: "untouched history", createdAt: "2025-01-01", updatedAt: "2025-12-01" },
  { id: "legacy-bob", owner: "bob::old-login", year: 2025, displayName: "Historical Bob", additionalNotes: "bob history",
    createdAt: "2025-01-02", updatedAt: "2025-12-02" }];
export const fixture = {
  active: { activeYear: 2026, revision: 0 } as ActiveSeason, seasons: new Map<number, Season>(),
  subject: "alice", admin: false, loginId: "synthetic@example.invalid", expired: false,
  sessionClaims: null as Record<string, unknown> | null,
  sheets: new Map<string, Sheet>(), legacy: legacyFixture(), calls: [] as { field: string; args: Record<string, unknown> }[],
  intercept: null as null | ((field: string, result: UpstreamResult<unknown>) => Promise<UpstreamResult<unknown>>),
};
export function resetFixture() {
  fixture.subject = "alice"; fixture.admin = false; fixture.loginId = "synthetic@example.invalid"; fixture.expired = false;
  fixture.sessionClaims = null; fixture.active = { activeYear: 2026, revision: 0 }; fixture.seasons.clear();
  fixture.sheets.clear(); fixture.legacy = legacyFixture(); fixture.calls = []; fixture.intercept = null;
}
const store: Store = {
  active: async () => fixture.active,
  seasons: async () => [...fixture.seasons.values()],
  activate: async next => { fixture.active = next; },
  legacyCount: async () => fixture.legacy.length,
  season: async year => fixture.seasons.get(year) ?? null,
  configure: async season => { fixture.seasons.set(season.year, season); },
  get: async (subject, year) => structuredClone(fixture.sheets.get(`${subject}:${year}`) ?? null),
  create: async sheet => {
    if (fixture.sheets.has(sheet.sheetId)) throw new Rejected("conflict");
    fixture.sheets.set(sheet.sheetId, structuredClone(sheet));
  },
  save: async (sheet, revision) => {
    if (fixture.sheets.get(sheet.sheetId)?.revision !== revision) throw new Rejected("conflict");
    fixture.sheets.set(sheet.sheetId, structuredClone(sheet));
  },
  legacy: async () => structuredClone(fixture.legacy),
  progress: async year => ({ items: [...fixture.sheets.values()].filter(s => s.year === year).map(progressOf), nextToken: null }),
};
const run = service(store, () => "2026-11-13T23:00:00.000Z");
async function call(field: string, args: Record<string, unknown>): Promise<UpstreamResult<unknown>> {
  fixture.calls.push({ field, args: structuredClone(args) });
  if (fixture.expired) throw new Error("UserUnauthenticated session expired PRIVATE_MARKER");
  const result = { data: JSON.stringify(await run({ field, arguments: args, identity: { sub: fixture.subject,
    claims: { sub: fixture.subject, "cognito:groups": fixture.admin ? ["admin"] : [] } } })) };
  return fixture.intercept ? fixture.intercept(field, result) : result;
}
export function generateClient() {
  return {
    queries: {
      seasonState: (args: { year: number }) => call('seasonState', args),
      seasonAdmin: (args: { year: number }) => call('seasonAdmin', args),
      directoryList: async () => ({ data: { ok: true, data: { revision: 0, contacts: [] } } }),
      seasonSheet: (args: { year: number; subject?: string }) => call("seasonSheet", args) },
    mutations: {
      ensureSeasonSheet: (args: { year: number }) => call("ensureSeasonSheet", args),
      // Match AppSync's AWSJSON parsing before the resolver receives arguments.
      saveSeasonSheet: (args: Parameters<SeasonalTransport['mutations']['saveSeasonSheet']>[0]) =>
        call("saveSeasonSheet", { ...args, answers: JSON.parse(args.answers) }),
    },
    models: { SantasSheet: {
      list: async () => ({ data: structuredClone(fixture.legacy) }),
      get: async () => { throw new Error("Unexpected legacy get"); },
      create: async () => { throw new Error("Unexpected legacy mutation"); },
      update: async () => { throw new Error("Unexpected legacy mutation"); },
    } },
  };
}
export function useAuthenticator() {
  return { user: { userId: fixture.subject, signInDetails: { loginId: fixture.loginId } }, signOut: () => {} };
}
export async function fetchUserAttributes() { return { given_name: "Synthetic", family_name: "Profile" }; }
export async function fetchAuthSession() {
  if (fixture.expired) throw new Error("Session expired");
  return { tokens: { accessToken: { payload: fixture.sessionClaims ?? { sub: fixture.subject, "cognito:groups": fixture.admin ? ["admin"] : [] } } } };
}
