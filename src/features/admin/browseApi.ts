import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { ApiFailure, checkedList, type UpstreamResult } from '../../lib/apiResults';
import { checkedSeason } from '../sheets/seasonal';

export type BrowseRow = { id: string; subject: string; name: string | null; year: number;
  status: 'legacy_saved' | 'draft_saved' | 'draft_blank' | 'submitted'; updatedAt: string | null };
export interface BrowseTransport {
  queries: { seasonProgress: (args: { year: number; nextToken?: string }) => Promise<UpstreamResult<unknown>> };
  models: { SantasSheet: { list: (args: { limit: number; nextToken?: string }) => Promise<UpstreamResult<{
    id: string; year?: number | null; owner?: string | null; displayName?: string | null; updatedAt: string;
  }[]> & { nextToken?: string | null }> } };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
export function browseApi(client: BrowseTransport) {
  return { async load(year: number): Promise<BrowseRow[]> {
    const rows: BrowseRow[] = [];
    if (year === 2025) {
      const items = await checkedList(nextToken => client.models.SantasSheet.list({ limit: 200, nextToken }));
      for (const item of items.filter(item => item.year === 2025)) {
        const subject = item.owner?.split('::')[0];
        if (!subject || !date(item.updatedAt) || (item.displayName != null && typeof item.displayName !== 'string')) throw new ApiFailure('missing_data');
        rows.push({ id: item.id, subject, year, name: item.displayName || null, status: 'legacy_saved', updatedAt: item.updatedAt });
      }
    } else {
      let nextToken: string | undefined;
      const tokens = new Set<string>();
      do {
        const page = await checkedSeason(() => client.queries.seasonProgress({ year, nextToken }));
        if (!object(page) || !Array.isArray(page.items) || (page.nextToken !== null && typeof page.nextToken !== 'string')) throw new ApiFailure('missing_data');
        for (const item of page.items) {
          if (!object(item) || item.year !== year || typeof item.participantId !== 'string' || !item.participantId ||
            !['draft', 'submitted'].includes(item.state as string) || !Number.isSafeInteger(item.revision) || (item.revision as number) < 0 ||
            ['savedAt', 'submittedAt', 'revisedAt'].some(k => item[k] !== null && !date(item[k])) ||
            (item.state === 'submitted' && (!item.savedAt || !item.submittedAt)) ||
            (item.state === 'draft' && (item.submittedAt !== null || item.revisedAt !== null))) throw new ApiFailure('missing_data');
          rows.push({ id: `${item.participantId}:${year}`, subject: item.participantId, year, name: null,
            status: item.state === 'submitted' ? 'submitted' : item.savedAt ? 'draft_saved' : 'draft_blank',
            updatedAt: (item.revisedAt ?? item.submittedAt ?? item.savedAt) as string | null });
        }
        nextToken = page.nextToken || undefined;
        if (nextToken && tokens.has(nextToken)) throw new ApiFailure('missing_data');
        if (nextToken) tokens.add(nextToken);
      } while (nextToken);
    }
    if (new Set(rows.map(r => r.id)).size !== rows.length || new Set(rows.map(r => r.subject)).size !== rows.length) throw new ApiFailure('missing_data');
    return rows;
  } };
}
export function createBrowseApi() { return browseApi(generateClient<Schema>()); }
