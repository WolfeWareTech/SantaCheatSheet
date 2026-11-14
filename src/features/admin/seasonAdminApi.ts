import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import type { Season, ActiveSeason, Totals } from '../../../amplify/seasonal/service';
import { checkedSeason } from '../sheets/seasonal';
import { ApiFailure, type UpstreamResult } from '../../lib/apiResults';
export type Dashboard = ActiveSeason & { seasons: Season[]; selected: Season | null; totals: Totals | null };
export type Configure = { year: number; state: 'open' | 'closed'; expectedRevision: number; deadline: string | null; confirmed: boolean };
export type Activate = { year: number; expectedRevision: number; expectedActiveRevision: number; confirmed: boolean };
export interface AdminTransport {
  queries: { seasonAdmin: (args: { year: number }) => Promise<UpstreamResult<unknown>> };
  mutations: { configureSeason: (args: Configure) => Promise<UpstreamResult<unknown>>; activateSeason: (args: Activate) => Promise<UpstreamResult<unknown>> };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
function validSeason(v: unknown): v is Season {
  return object(v) && integer(v.year) && (v.year as number) >= 2025 && (v.year as number) <= 2100 && integer(v.revision) &&
    ['open', 'closed'].includes(v.state as string) && (v.deadline === null || typeof v.deadline === 'string' && Number.isFinite(Date.parse(v.deadline)));
}
export function seasonAdminApi(client: AdminTransport) {
  return {
    async load(year: number): Promise<Dashboard> {
      const v = await checkedSeason(() => client.queries.seasonAdmin({ year }));
      if (!object(v) || !integer(v.activeYear) || (v.activeYear as number) < 2026 || (v.activeYear as number) > 2100 || !integer(v.revision) ||
        !Array.isArray(v.seasons) || !v.seasons.every(validSeason) || new Set(v.seasons.map(s => s.year)).size !== v.seasons.length ||
        !v.seasons.some(s => s.year === v.activeYear) || (v.selected !== null && (!validSeason(v.selected) || v.selected.year !== year)) ||
        (v.selected === null ? v.totals !== null : !object(v.totals) || !['initialized', 'saved', 'unsaved', 'legacySaved'].every(k => integer((v.totals as Record<string, unknown>)[k])) ||
          v.totals.initialized !== Number(v.totals.saved) + Number(v.totals.unsaved))) throw new ApiFailure('missing_data');
      return v as Dashboard;
    },
    async configure(args: Configure) {
      const next = await checkedSeason(() => client.mutations.configureSeason(args));
      if (!validSeason(next) || next.year !== args.year || next.state !== args.state || next.deadline !== args.deadline || next.revision !== args.expectedRevision + 1) throw new ApiFailure('missing_data');
      return next;
    },
    async activate(args: Activate) {
      const next = await checkedSeason(() => client.mutations.activateSeason(args));
      if (!object(next) || next.activeYear !== args.year || next.revision !== args.expectedActiveRevision + 1) throw new ApiFailure('missing_data');
    },
  };
}
export function createSeasonAdminApi() { return seasonAdminApi(generateClient<Schema>()); }
