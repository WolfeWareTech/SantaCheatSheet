import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AnnualParticipationPanel } from './AnnualParticipationPanel';
import { participationApi, type ParticipationRequest } from './participationApi';
import { participationFor, previewDirectory, type Contact } from '../../../amplify/directory/contract';
import type { Snapshot } from './api';
const contact = (): Contact => ({ id: 'synthetic', subject: 'synthetic-sub', registeredEmail: 'synthetic@example.invalid',
  displayName: 'Synthetic', contactEmail: 'synthetic@example.invalid', phone: null, preferredChannel: 'email', archived: false,
  excluded: false, emailOptOut: false, phoneOptOut: false, participation: { year: 2026, state: 'active' }, mapping: 'verified',
  provenance: { source: 'synthetic', observedAt: '2026-11-13T00:00:00Z', review: 'reviewed' }, revision: 1, updatedAt: '2026-11-13T00:00:00Z' });
function fixture() {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const c = contact(); let snapshot: Snapshot = { revision: 1, contacts: [c], preview: previewDirectory({ revision: 1, contacts: [c] }) };
  let loads = 0; let writes = 0; let fail = false; let saved: Snapshot | null = null;
  const api = { list: async () => { loads++; return snapshot; }, save: async (value: Contact, args: ParticipationRequest) => {
    writes++; if (fail) throw Error('PRIVATE');
    const updated: Contact = { ...value, annualParticipation: { ...value.annualParticipation, [String(args.year)]: { state: args.state, excluded: args.excluded, review: args.reviewed ? 'reviewed' : 'pending', updatedAt: '2027-01-01T00:00:00Z' } }, revision: value.revision + 1 };
    const next = { revision: snapshot.revision + 1, contacts: [updated] }; snapshot = { ...next, preview: previewDirectory(next) }; return snapshot;
  } };
  async function render(year = 2027, isAdmin = true, sessionKey = 'admin') { await act(async () => root.render(<AnnualParticipationPanel year={year} isAdmin={isAdmin} sessionKey={sessionKey} api={api} onSaved={value => { saved = value; }} />)); }
  async function click(text: string) { const b = [...host.querySelectorAll('button')].find(b => b.textContent === text); assert.ok(b, text); await act(async () => b.click()); }
  return { host, render, click, counts: () => ({ loads, writes, saved }), fail: () => { fail = true; }, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
test('future-year UI explicitly approves selected year only, counts real membership and leaves next year unknown/excluded', async () => {
  const f = fixture(); await f.render(2027, false); assert.equal(f.counts().loads, 0);
  await f.render(); assert.ok(f.host.textContent?.includes('0 active directory participants in 2027'));
  await f.click('Edit 2027 participation for Synthetic');
  const select = f.host.querySelector('select')!; const boxes = [...f.host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  assert.equal(select.value, 'unknown'); assert.equal(boxes[0].checked, true); assert.equal(boxes[1].checked, false);
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!.call(select, 'active'); select.dispatchEvent(new Event('change', { bubbles: true })); boxes[0].click(); boxes[1].click(); });
  await act(async () => f.host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(f.counts().writes, 1); assert.ok(f.host.textContent?.includes('1 active directory participants in 2027'));
  assert.deepEqual(f.counts().saved?.contacts[0].participation, { year: 2026, state: 'active' });
  await f.render(2028); assert.ok(f.host.textContent?.includes('0 active directory participants in 2028'));
  await f.click('Edit 2028 participation for Synthetic'); assert.equal(f.host.querySelector('select')!.value, 'unknown');
  assert.equal(f.host.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked, true); await f.close();
});
test('failed edits retain fields, sanitize errors; year/account switch and role revocation discard private form', async () => {
  const f = fixture(); await f.render(); await f.click('Edit 2027 participation for Synthetic'); f.fail();
  await act(async () => f.host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.ok(f.host.querySelector('form')); assert.ok(f.host.querySelector('[role=alert]')); assert.ok(!f.host.textContent?.includes('PRIVATE'));
  await f.render(2027, true, 'other-admin'); assert.equal(f.host.querySelector('form'), null);
  await f.render(2027, false); assert.equal(f.host.textContent, ''); await f.close();
});
test('checked annual API verifies selected-year persistence and rejects alteration of previous years or 2026 fields', async () => {
  const c = contact(); const args: ParticipationRequest = { id: c.id, year: 2027, state: 'active', excluded: false, reviewed: true, expectedRevision: 1 };
  const updated: Contact = { ...c, revision: 2, annualParticipation: { '2027': { state: 'active', excluded: false, review: 'reviewed', updatedAt: '2027-01-01T00:00:00Z' } } };
  let value: unknown = { ok: true, data: { revision: 2, contacts: [updated] } };
  const api = participationApi({ queries: { directoryList: async () => ({ data: value }) }, mutations: { directoryParticipation: async () => ({ data: value }) } });
  assert.equal(participationFor((await api.save(c, args)).contacts[0], 2027).state, 'active');
  value = { ok: true, data: { revision: 2, contacts: [{ ...updated, participation: { year: 2026, state: 'excluded' } }] } };
  await assert.rejects(api.save(c, args));
  value = { ok: true, data: { revision: 2, contacts: [{ ...updated, annualParticipation: { ...updated.annualParticipation, '2028': updated.annualParticipation!['2027'] } }] } };
  await assert.rejects(api.save(c, args));
  await assert.rejects(api.save(c, { ...args, year: 2026 }));
});
