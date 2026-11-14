import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AnnualAdmin } from './AnnualAdmin';
import { seasonAdminApi, type Dashboard, type Configure } from './seasonAdminApi';
const initial = (): Dashboard => ({ activeYear: 2026, revision: 0, seasons: [
  { year: 2026, state: 'open', revision: 0, deadline: null }, { year: 2025, state: 'closed', revision: 0, deadline: null },
], selected: { year: 2026, state: 'open', revision: 0, deadline: null }, totals: { initialized: 3, saved: 2, unsaved: 1, legacySaved: 0 } });
function fixture() {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  let loads = 0; let writes = 0; let fail = false; let selected = 2026; let ready = false; let last: Configure | null = null;
  const directory = { list: async () => ({ revision: 0, contacts: [], preview: [] }), create: async () => { throw Error(); }, update: async () => { throw Error(); } };
  const api = { async load(year: number) { loads++; selected = year; if (fail) throw Error('PRIVATE PROVIDER DATA');
    const value = initial(); if (ready) { value.seasons[0].state = 'closed'; value.seasons.push({ year: 2027, state: 'open', revision: 1, deadline: null }); } return { ...value, selected: value.seasons.find(s => s.year === year) ?? null, totals: year === 2026 ? value.totals : year === 2025 ? { initialized: 0, saved: 0, unsaved: 0, legacySaved: 2 } : null }; },
    async configure(args: Configure) { writes++; last = args; if (fail) throw Error('PRIVATE PROVIDER DATA'); return { year: args.year, state: args.state, revision: args.expectedRevision + 1, deadline: args.deadline }; },
    async activate() { writes++; if (fail) throw Error('PRIVATE PROVIDER DATA'); },
  };
  async function render(isAdmin = true, sessionKey = 'admin-a') {
    await act(async () => root.render(<AnnualAdmin isAdmin={isAdmin} sessionKey={sessionKey} api={api} directory={directory} onMySheet={() => {}} onHistory={() => {}} onSeasonChanged={() => {}} />));
  }
  async function click(text: string) { const b = [...host.querySelectorAll('button')].find(b => b.textContent === text); assert.ok(b, text); await act(async () => b.click()); }
  async function year(value: string) {
    const input = host.querySelector<HTMLInputElement>('input[type=number]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  }
  return { host, render, click, year, counts: () => ({ loads, writes, selected, last }), fail: () => { fail = true; }, ready: () => { ready = true; }, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
test('regular user cannot mount admin requests; exact truthful totals and no automatic mutations', async () => {
  const f = fixture(); await f.render(false); assert.equal(f.counts().loads, 0); assert.equal(f.host.textContent, '');
  await f.render(); assert.equal(f.counts().writes, 0);
  const values = [...f.host.querySelectorAll('dd')].map(d => d.textContent); assert.deepEqual(values, ['3', '2', '1', '0']);
  assert.ok(f.host.textContent?.includes('Submission tracking is pending')); assert.ok(f.host.textContent?.includes('Share 2026 link'));
  await f.close();
});
test('viewing history or future year never changes active season; start requires separate reviewed confirmation', async () => {
  const f = fixture(); await f.render(); await f.year('2025'); assert.equal(f.counts().writes, 0);
  assert.ok(!f.host.textContent?.includes('Close 2025')); assert.ok(f.host.textContent?.includes('Active season: 2026'));
  await f.year('2027'); await f.click('Start 2027 closed'); assert.equal(f.counts().writes, 0);
  assert.ok(f.host.querySelector('[role=dialog]')?.textContent?.includes('Deadline: none'));
  await f.click('Cancel'); assert.equal(f.counts().writes, 0);
  await f.click('Start 2027 closed'); await f.click('Confirm season change');
  assert.equal(f.counts().writes, 1); assert.deepEqual(f.counts().last, { year: 2027, state: 'closed', expectedRevision: 0, deadline: null, confirmed: true });
  await f.close();
});
test('failed refresh discards stale totals, never presents zero success and sanitizes provider errors', async () => {
  const f = fixture(); await f.render(); assert.equal(f.host.querySelectorAll('dd').length, 4);
  f.fail(); await f.click('Refresh dashboard');
  assert.equal(f.host.querySelectorAll('dd').length, 0); assert.ok(f.host.querySelector('[role=alert]'));
  assert.ok(!f.host.textContent?.includes('PRIVATE')); assert.ok(!f.host.textContent?.includes('Close 2026'));
  await f.close();
});
test('account switch and revoked admin clear confirmation and private form synchronously', async () => {
  const f = fixture(); await f.render(); await f.click('Close 2026'); assert.ok(f.host.querySelector('[role=dialog]'));
  await f.render(true, 'admin-b'); assert.equal(f.host.querySelector('[role=dialog]'), null); assert.equal(f.counts().writes, 0);
  await f.render(false, 'regular'); assert.equal(f.host.textContent, ''); await f.close();
});
test('client rejects partial totals, upstream GraphQL failures and unconfirmed mutation envelopes', async () => {
  const client = { queries: { seasonAdmin: async () => ({ data: { ok: true, data: initial() } }) }, mutations: {
    configureSeason: async () => ({ data: { ok: true, data: null } }), activateSeason: async () => ({ data: { ok: true, data: null } }),
  } };
  const api = seasonAdminApi(client); assert.deepEqual(await api.load(2026), initial());
  client.queries.seasonAdmin = async () => ({ data: { ok: true, data: { ...initial(), totals: { initialized: 3, saved: 2, unsaved: 5, legacySaved: 0 } } } });
  await assert.rejects(api.load(2026));
  client.queries.seasonAdmin = async () => ({ data: { ok: true, data: initial() }, errors: [{ message: 'Network PRIVATE' }] });
  await assert.rejects(api.load(2026));
  await assert.rejects(api.configure({ year: 2026, state: 'closed', expectedRevision: 0, confirmed: true, deadline: null }));
  await assert.rejects(api.activate({ year: 2027, expectedRevision: 1, expectedActiveRevision: 0, confirmed: true }));
});

test('activation has a separate confirmation; failed writes show no success or stale controls', async () => {
  const f = fixture(); f.ready(); await f.render(); await f.year('2027');
  await f.click('Activate 2027'); assert.equal(f.counts().writes, 0);
  assert.ok(f.host.querySelector('[role=dialog]')?.textContent?.includes('Previous years become administrator-only history'));
  f.fail(); await f.click('Confirm season change');
  assert.ok(!f.host.textContent?.includes('Season change saved'));
  assert.equal(f.host.querySelector('[role=dialog]'), null); assert.equal(f.host.querySelectorAll('dd').length, 0);
  assert.ok(f.host.querySelector('[role=alert]')); await f.close();
});
