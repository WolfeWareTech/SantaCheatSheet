import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AdminSheetsPanel } from './AdminSheetsPanel';
import { browseApi, type BrowseRow, type BrowseTransport } from './browseApi';
import { MaintenancePanel } from '../maintenance/MaintenancePanel';
import { dryRun } from '../maintenance/dryRun';
import { fixture, resetFixture } from './testClient';
import App from '../../App';
import type { HistoryTarget } from '../sheets/seasonal';

let host: HTMLDivElement; let root: Root;
test.beforeEach(() => { resetFixture(); window.history.replaceState(null, '', '#/admin'); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
test.afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(node: React.ReactNode) { await act(async () => root.render(node)); }
async function click(label: string) { const button = [...host.querySelectorAll('button')].find(b => b.textContent === label); assert.ok(button, label); await act(async () => button.click()); }
async function input(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')!.set!.call(element, value); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
const row = (id: string, name: string, status: BrowseRow['status'] = 'legacy_saved', updatedAt: string | null = '2025-11-01T12:30:00Z'): BrowseRow => ({ id, name, status, subject: id, year: 2025, updatedAt });
const props = (rows: BrowseRow[]) => ({ isAdmin: true, sessionKey: 'admin', year: 2025, activeYear: 2026, people: null, api: { load: async () => rows }, onMySheet: () => {}, onHistory: (target: HistoryTarget) => { void target; } });
test('search, status, name/date sorting and long names use accessible native controls and explicit person/year', async () => {
  const longName = 'Very long synthetic family name '.repeat(9);
  const p = props([row('z', 'Zed'), row('a', 'Alice', 'legacy_saved', '2025-12-03T15:04:00Z'), row('long', longName)]);
  let selected: HistoryTarget | null = null; p.onHistory = target => { selected = target; };
  await render(<AdminSheetsPanel {...p} />);
  assert.deepEqual([...host.querySelectorAll('h4')].map(h => h.textContent), ['Alice', longName, 'Zed']);
  assert.ok(host.querySelector('time')?.textContent?.includes('Dec 3, 2025')); assert.ok(host.querySelector('time')?.textContent?.includes('UTC'));
  const search = host.querySelector<HTMLInputElement>('input[type=search]')!; search.focus(); assert.equal(document.activeElement, search);
  await input(search, '  ALICE '); assert.equal(host.querySelectorAll('li').length, 1); await click('View sheet'); assert.deepEqual(selected, { year: 2025, subject: 'a', name: 'Alice' });
  await input(search, ''); const selects = host.querySelectorAll<HTMLSelectElement>('select');
  await input(selects[1], 'name-desc'); assert.equal(host.querySelector('h4')?.textContent, 'Zed');
  await input(selects[1], 'updated'); assert.equal(host.querySelector('h4')?.textContent, 'Alice');
  await input(selects[0], 'submitted'); assert.ok(host.textContent?.includes('No people match')); assert.equal(host.querySelectorAll('li').length, 0);
  assert.ok(!host.textContent?.includes('0 submitted')); assert.equal(host.querySelectorAll('label').length, 3);
});
test('other drafts remain metadata only; submitted rows and own current sheet have distinct actions', async () => {
  let own = 0; let selected: HistoryTarget | null = null;
  const p = { ...props([row('other', 'Private', 'draft_saved'), row('admin', 'My name', 'draft_blank', null), row('done', 'Submitted', 'submitted')].map(r => ({ ...r, year: 2026 }))), year: 2026,
    onMySheet: () => { own++; }, onHistory: (target: HistoryTarget) => { selected = target; } };
  await render(<AdminSheetsPanel {...p} />); const cards = [...host.querySelectorAll('li')];
  assert.equal(cards.find(li => li.textContent?.includes('Private'))?.querySelector('button'), null);
  await act(async () => cards.find(li => li.textContent?.includes('My name'))!.querySelector('button')!.click()); assert.equal(own, 1); assert.equal(selected, null);
  await act(async () => cards.find(li => li.textContent?.startsWith('Submitted'))!.querySelector('button')!.click()); assert.deepEqual(selected, { year: 2026, subject: 'done', name: 'Submitted' });
});
test('empty, filtered, delayed, failed refresh and account/year transitions never show stale rows as complete', async () => {
  let fail = false; let resolve: ((r: BrowseRow[]) => void) | null = null;
  const p = props([]); p.api.load = () => fail ? Promise.reject(Error('Network PRIVATE_MARKER')) : new Promise(done => { resolve = done; });
  await render(<AdminSheetsPanel {...p} />); assert.ok(host.textContent?.includes('Loading 2025'));
  await act(async () => resolve!([row('a', 'Private prior account name')]));
  fail = true; await click('Refresh sheet list'); assert.ok(host.querySelector('[role=alert]')); assert.equal(host.querySelectorAll('li').length, 0); assert.ok(!host.textContent?.includes('PRIVATE_MARKER'));
  await render(<AdminSheetsPanel {...props([])} sessionKey="another-admin" />); assert.ok(host.textContent?.includes('No sheet records for 2025')); assert.ok(!host.textContent?.includes('Private prior account'));
  await render(<AdminSheetsPanel {...props([])} year={2027} />); assert.ok(host.textContent?.includes('No sheet records for 2027'));
  let calls = 0; await render(<AdminSheetsPanel {...props([])} isAdmin={false} api={{ load: async () => { calls++; return []; } }} />); assert.equal(calls, 0); assert.equal(host.textContent, '');
});
const progress = (id = 'a') => ({ participantId: id, year: 2026, state: 'draft', revision: 1, savedAt: '2026-11-01T00:00:00Z', submittedAt: null, revisedAt: null });
test('progress pagination projects metadata and rejects partial errors, loops, duplicates, malformed state and wrong year', async () => {
  const pages = [{ items: [progress()], nextToken: 'p2' }, { items: [{ ...progress('b'), state: 'submitted', submittedAt: '2026-11-02T00:00:00Z' }], nextToken: null }];
  let calls = 0;
  const client: BrowseTransport = { queries: { seasonProgress: async () => ({ data: { ok: true, data: pages[calls++] } }) }, models: { SantasSheet: { list: async () => ({ data: [] }) } } };
  const api = browseApi(client); const result = await api.load(2026); assert.equal(result.length, 2); assert.deepEqual(result.map(r => r.status), ['draft_saved', 'submitted']); assert.ok(result.every(r => !('answers' in r)));
  for (const data of [{ items: [progress()], nextToken: 'repeat' }, { items: [progress(), progress()], nextToken: null }, { items: [{ ...progress(), year: 2027 }], nextToken: null }, { items: [{ ...progress(), state: 'submitted' }], nextToken: null }, { items: [{ ...progress(), savedAt: 'bad' }], nextToken: null }]) {
    client.queries.seasonProgress = async () => ({ data: { ok: true, data } }); await assert.rejects(api.load(2026));
  }
  client.queries.seasonProgress = async () => ({ data: { ok: true, data: pages[0] }, errors: [{ message: 'PRIVATE' }] }); await assert.rejects(api.load(2026));
});
test('legacy pagination is always legacy saved and rejects ambiguous owner/year; no answer values enter browser rows', async () => {
  let calls = 0; const value = { id: 'old', year: 2025, owner: 'a::old-login', displayName: 'Synthetic', updatedAt: '2025-11-01T00:00:00Z', additionalNotes: 'PRIVATE_ANSWER' };
  const client: BrowseTransport = { queries: { seasonProgress: async () => { throw Error('Not legacy'); } }, models: { SantasSheet: { list: async () => ++calls === 1 ? ({ data: [value], nextToken: 'p2' }) : ({ data: [], nextToken: null }) } } };
  const api = browseApi(client); const result = await api.load(2025); assert.equal(calls, 2); assert.equal(result[0].status, 'legacy_saved'); assert.ok(!JSON.stringify(result).includes('PRIVATE_ANSWER'));
  client.models.SantasSheet.list = async () => ({ data: [value, { ...value, id: 'other' }] }); await assert.rejects(api.load(2025));
});
const legacy = (id = 'original-a', owner = 'a::old-login', year = 2025) => ({ id, owner, year, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-12-01T00:00:00Z', additionalNotes: 'synthetic answer' });
test('dry run reports mixed validation, duplicate identity/year and preserved original fields without mutating input', () => {
  const input = [legacy(), { ...legacy('b'), owner: 'a::other-login' }, legacy('c', 'c'), null, { ...legacy('d', 'd'), unknown: 'PRIVATE_MARKER' }, legacy('e', 'a', 2026)];
  const before = JSON.stringify(input); const report = dryRun(before); assert.equal(report.valid, 2); assert.equal(report.invalid, 4); assert.deepEqual(report.rows.map(r => r.state), ['invalid', 'invalid', 'valid', 'invalid', 'invalid', 'valid']);
  assert.ok(report.rows[0].issues.some(s => s.includes('Duplicate owner'))); assert.equal(JSON.stringify(input), before); assert.ok(!JSON.stringify(report).includes('PRIVATE_MARKER')); assert.ok(!JSON.stringify(report).includes('synthetic answer'));
});
test('dry run rejects schema/type/date/identity loss and oversized/invalid documents; no fabricated IDs or false imported success', () => {
  const valid = legacy(); for (const bad of [{ ...valid, owner: null }, { ...valid, id: '' }, { ...valid, year: '2025' }, { ...valid, favoriteStores: [1] }, { ...valid, additionalNotes: {} }, { ...valid, createdAt: '2025-02-30T00:00:00Z' }, { ...valid, updatedAt: '2024-01-01T00:00:00Z' }]) assert.equal(dryRun(JSON.stringify([bad])).invalid, 1);
  for (const bad of ['{', '{}', '{"data":[]}', JSON.stringify(Array(501).fill(valid)), ' '.repeat(2_000_001)]) assert.throws(() => dryRun(bad));
  assert.deepEqual(dryRun('[]'), { rows: [], valid: 0, invalid: 0 }); assert.equal(dryRun(JSON.stringify({ items: [valid] })).valid, 1);
  assert.equal(dryRun(JSON.stringify([valid, { ...valid, owner: 'b' }])).invalid, 2);
});
test('maintenance is admin-only local validation, mixed failures are explicit, edits and session changes clear results; Apply stays disabled', async () => {
  await render(<MaintenancePanel isAdmin={false} sessionKey="a" />); assert.equal(host.querySelector('textarea'), null); assert.ok(host.querySelector('[role=alert]'));
  await render(<MaintenancePanel isAdmin sessionKey="a" />); const textarea = host.querySelector('textarea')!;
  await input(textarea, JSON.stringify([legacy(), { year: 2025 }])); await click('Validate dry run'); assert.ok(host.textContent?.includes('1 valid for local schema checks; 1 invalid')); assert.ok(host.textContent?.includes('0 imported')); assert.ok(host.textContent?.includes('Row 2'));
  assert.ok([...host.querySelectorAll('button')].find(b => b.textContent?.includes('Apply import'))?.disabled);
  await input(textarea, '{'); assert.ok(!host.textContent?.includes('1 valid')); await click('Validate dry run'); assert.ok(host.textContent?.includes('Invalid JSON'));
  await render(<MaintenancePanel isAdmin sessionKey="b" />); assert.equal(host.querySelector('textarea')?.value, ''); assert.ok(!host.textContent?.includes('Invalid JSON'));
  assert.ok(!host.textContent?.includes('sandbox')); assert.ok(!host.textContent?.includes('Delete'));
});
test('unauthorized maintenance deep link and mismatched subject claim expose no tools or admin API calls', async () => {
  window.history.replaceState(null, '', '#/admin/maintenance'); await render(<App />);
  assert.ok(host.textContent?.includes('Administrator access required')); assert.equal(host.querySelector('.maintenance-panel'), null);
  fixture.admin = true; fixture.sessionClaims = { sub: 'different-subject', 'cognito:groups': ['admin'] };
  await render(<div />); await render(<App />); assert.equal(host.querySelector('.maintenance-panel'), null);
  assert.ok(!fixture.calls.some(c => ['seasonAdmin', 'seasonProgress', 'directoryList'].includes(c.field)));
});
test('admin maintenance deep link stays separate from annual home, and revocation clears local samples', async () => {
  fixture.admin = true; window.history.replaceState(null, '', '#/admin/maintenance'); await render(<App />);
  assert.ok(host.querySelector('.maintenance-panel')); assert.equal(host.querySelector('.annual-admin'), null);
  await input(host.querySelector('.maintenance-panel textarea')!, 'private synthetic sample');
  await click('Annual dashboard'); assert.equal(window.location.hash, '#/admin'); assert.ok(host.querySelector('.annual-admin')); assert.equal(host.querySelector('.maintenance-panel'), null);
  assert.ok(!host.textContent?.includes('Validate dry run')); assert.ok(!host.textContent?.includes('Legacy history and data tools'));
  fixture.subject = 'regular-b'; fixture.admin = false; await render(<App />); assert.equal(host.querySelector('.annual-admin'), null); assert.ok(!host.textContent?.includes('private synthetic sample'));
});
test('App year filter drives the list, selected person/year remain visible and returning restores the viewed year without activation', async () => {
  fixture.admin = true; const before = JSON.stringify(fixture.legacy); await render(<App />);
  const year = host.querySelector<HTMLInputElement>('.annual-admin input[type=number]')!;
  await input(year, '2025'); await act(async () => year.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.ok(host.querySelector('.sheet-browser')?.textContent?.includes('Historical Bob'));
  const button = host.querySelector<HTMLButtonElement>('[aria-label="View Historical Bob, 2025"]')!; await act(async () => button.click());
  assert.equal(window.location.hash, '#/sheets/2025/bob'); assert.ok(host.textContent?.includes('Historical Bob — 2025 history'));
  await click('Annual dashboard'); assert.equal(host.querySelector<HTMLInputElement>('.annual-admin input[type=number]')?.value, '2025');
  assert.ok(host.textContent?.includes('Active season: 2026')); assert.ok(!fixture.calls.some(c => ['configureSeason', 'activateSeason'].includes(c.field)));
  assert.equal(JSON.stringify(fixture.legacy), before);
});
