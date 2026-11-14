// Synthetic UI transport extension; never configured with real endpoints.
export { fixture, resetFixture, useAuthenticator, fetchAuthSession, fetchUserAttributes } from '../sheets/tests/mockSeasonClient';
import { generateClient as base, fixture } from '../sheets/tests/mockSeasonClient';
import { progressOf } from '../../../amplify/seasonal/service';
export function generateClient() {
  const client = base();
  return { ...client, queries: { ...client.queries, seasonProgress: async ({ year }: { year: number }) => {
    fixture.calls.push({ field: 'seasonProgress', args: { year } });
    return { data: { ok: true, data: { items: [...fixture.sheets.values()].filter(s => s.year === year).map(progressOf), nextToken: null } } };
  } } };
}
