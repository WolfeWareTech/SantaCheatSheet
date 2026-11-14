import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryService, type Event, type Store } from './service';
import { contactFields, DirectoryRejected, fieldsOf, previewDirectory, participationFor, activeParticipationCount, validDirectory, type Contact, type Directory } from './contract';
import { directoryApi, type DirectoryTransport } from '../../src/features/directory/api';
export const synthetic = (id = 'synthetic-a'): Contact => ({ id, subject: id, registeredEmail: `${id}@example.invalid`,
  displayName: id, contactEmail: `${id}@example.invalid`, phone: null, preferredChannel: 'email', archived: false,
  excluded: false, emailOptOut: false, phoneOptOut: false, participation: { year: 2026, state: 'active' }, mapping: 'verified',
  provenance: { source: 'synthetic', observedAt: '2026-11-13T00:00:00Z', review: 'reviewed' }, revision: 1, updatedAt: '2026-11-13T00:00:00Z' });
const admin = { sub: 'admin-sub', claims: { sub: 'admin-sub', 'cognito:groups': ['admin'] } };
function fixture(contacts = [synthetic()]) {
  let db: Directory = { revision: 1, contacts: structuredClone(contacts) }; let reads = 0; let writes = 0;
  const store: Store = { async read() { reads++; return structuredClone(db); }, async write(next, revision) {
    if (db.revision !== revision) throw new DirectoryRejected('conflict'); db = structuredClone(next); writes++;
  } };
  const service = directoryService(store, () => '2026-11-14T00:00:00Z', () => 'synthetic-invitee');
  const call = (field: string, args: Record<string, unknown> = {}, identity: Event['identity'] = admin) => service({ field, arguments: args, identity });
  return { call, store, db: () => db, counts: () => ({ reads, writes }) };
}
test('regular, anonymous, mismatched and forged group claims cannot read or mutate, before any storage access', async () => {
  const f = fixture();
  for (const identity of [null, { sub: 'user', claims: { sub: 'user' } }, { sub: 'user', claims: { sub: 'other', 'cognito:groups': ['admin'] } },
    { sub: 'user', claims: { sub: 'user', 'cognito:groups': 'admin' } }]) {
    for (const field of ['directoryList', 'directoryUpdate', 'directoryCreateInvitee', 'directoryParticipation']) {
      assert.equal((await f.call(field, {}, identity)).error?.code, 'forbidden');
    }
  }
  assert.deepEqual(f.counts(), { reads: 0, writes: 0 });
});
test('admin edits confirm persistence; immutable mappings and unrelated fields cannot be submitted', async () => {
  const f = fixture(); const original = structuredClone(f.db().contacts[0]);
  const fields = { ...fieldsOf(original), displayName: 'Corrected name', phone: '+12025550123' };
  assert.equal((await f.call('directoryUpdate', { id: original.id, fields, reviewed: true, expectedRevision: 1 })).ok, true);
  const c = f.db().contacts[0]; assert.equal(c.displayName, fields.displayName); assert.equal(c.subject, original.subject);
  assert.equal(c.registeredEmail, original.registeredEmail); assert.equal(c.revision, 2);
  for (const key of ['subject', 'registeredEmail', 'mapping', 'owner', 'answers', 'groups']) {
    assert.equal((await f.call('directoryUpdate', { id: c.id, fields: { ...fields, [key]: 'forged' }, reviewed: true, expectedRevision: 2 })).error?.code, 'validation');
    assert.equal((await f.call('directoryUpdate', { id: c.id, fields, reviewed: true, expectedRevision: 2, [key]: 'forged' })).error?.code, 'validation');
  }
  assert.equal(f.counts().writes, 1);
});
test('archive/exclusion/unknown participation/opt-outs/missing destinations/pending review all fail closed', () => {
  const c = synthetic();
  for (const patch of [{ archived: true }, { excluded: true }, { participation: { year: 2026, state: 'unknown' as const } },
    { emailOptOut: true }, { contactEmail: null }, { phone: null, preferredChannel: 'phone' as const },
    { preferredChannel: 'none' as const }, { provenance: { ...c.provenance, review: 'pending' as const } }]) {
    const p = previewDirectory({ revision: 1, contacts: [{ ...c, ...patch }] })[0];
    assert.equal(p.personalizedEligible, false); assert.equal(p.approvedCurrentRecipient, false);
  }
  assert.equal(previewDirectory({ revision: 1, contacts: [c] })[0].personalizedEligible, true);
});
test('duplicate email/phone/name/subject, even archived contacts, block both records without merging', () => {
  const c = { ...synthetic(), phone: '+12025550123' };
  for (const patch of [{ contactEmail: c.contactEmail!.toUpperCase() }, { registeredEmail: c.registeredEmail!.toUpperCase() },
    { phone: c.phone }, { displayName: c.displayName.toUpperCase() }, { subject: c.subject }]) {
    const other = { ...synthetic('synthetic-b'), ...patch, archived: true };
    const preview = previewDirectory({ revision: 1, contacts: [c, other] });
    assert.ok(preview.every(p => !p.personalizedEligible && p.reasons.includes('duplicate_or_ambiguous')));
  }
});
test('unregistered creation is directory-only and excluded; reviewed invitees stay unlinked', async () => {
  const f = fixture(); const fields = fieldsOf(synthetic('synthetic-invitee'));
  assert.equal((await f.call('directoryCreateInvitee', { fields, expectedRevision: 1 })).ok, true);
  const c = f.db().contacts.find(c => c.id === 'synthetic-invitee')!;
  assert.equal(c.subject, null); assert.equal(c.registeredEmail, null); assert.equal(c.excluded, true);
  assert.equal(c.participation.state, 'unknown');
  assert.equal((await f.call('directoryUpdate', { id: c.id, fields: { ...fieldsOf(c), excluded: false, participation: { year: 2026, state: 'active' } }, reviewed: true, expectedRevision: 2 })).ok, true);
  const preview = previewDirectory(f.db()).find(p => p.id === c.id)!;
  assert.equal(preview.approvedCurrentRecipient, true); assert.equal(preview.personalizedEligible, false);
  assert.ok(preview.reasons.includes('unregistered')); assert.equal(f.db().contacts.find(row => row.id === c.id)!.subject, null);
});
test('contact corrections never change registered identity; email mismatch blocks personalized eligibility', async () => {
  const f = fixture(); const c = f.db().contacts[0];
  await f.call('directoryUpdate', { id: c.id, fields: { ...fieldsOf(c), contactEmail: 'correction@example.invalid' }, reviewed: true, expectedRevision: 1 });
  assert.equal(f.db().contacts[0].subject, c.subject); assert.equal(f.db().contacts[0].registeredEmail, c.registeredEmail);
  assert.ok(previewDirectory(f.db())[0].reasons.includes('email_identity_mismatch'));
});
test('E164/email/required booleans/season/unknown fields validate; stale revisions and concurrent writes conflict', async () => {
  const f = fixture(); const fields = fieldsOf(synthetic());
  for (const patch of [{ phone: '2025550123' }, { phone: '+0123456789' }, { contactEmail: 'not-email' }, { displayName: ' ' },
    { archived: 'false' }, { participation: { year: 2027, state: 'active' } }, { extra: true }]) assert.throws(() => contactFields({ ...fields, ...patch }));
  const args = { id: 'synthetic-a', fields, reviewed: true, expectedRevision: 1 };
  const results = await Promise.all([f.call('directoryUpdate', args), f.call('directoryUpdate', args)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.error?.code === 'conflict').length, 1);
});
test('storage errors and malformed data return safe failure envelopes without values', async () => {
  const f = fixture(); f.store.read = async () => { throw new Error('PRIVATE PAYLOAD'); };
  assert.ok(!JSON.stringify(await f.call('directoryList')).includes('PRIVATE PAYLOAD'));
  f.store.read = async () => ({ revision: 1, contacts: [{}] }) as Directory;
  assert.equal((await f.call('directoryList')).error?.code, 'missing_data');
});
test('checked API rejects mixed errors, missing/malformed data and unconfirmed persistence', async () => {
  let value: unknown = { ok: true, data: { revision: 1, contacts: [synthetic()] } }; let errors: unknown[] = [];
  const response = async () => ({ data: value, errors });
  const transport: DirectoryTransport = { queries: { directoryList: response }, mutations: { directoryUpdate: response, directoryCreateInvitee: response } };
  const api = directoryApi(transport); assert.equal((await api.list()).contacts.length, 1);
  errors = [{ message: 'forbidden PRIVATE' }]; await assert.rejects(api.list()); errors = [];
  for (const v of [null, {}, { ok: true }, { ok: true, data: {} }, { ok: false, error: { code: 'forbidden' } }]) { value = v; await assert.rejects(api.list()); }
  value = JSON.stringify({ ok: true, data: { revision: 1, contacts: [synthetic()] } }); assert.equal((await api.list()).revision, 1);
  await assert.rejects(api.update(synthetic(), fieldsOf(synthetic()), 1, true));
});

test('future participation starts unknown/excluded with no approval carryover and preserves every 2026 identity/choice/provenance', async () => {
  const f = fixture(); const original = structuredClone(f.db().contacts[0]);
  assert.equal(previewDirectory(f.db(), 2026)[0].approvedCurrentRecipient, true);
  assert.deepEqual(participationFor(original, 2027), { state: 'unknown', excluded: true, review: 'pending', updatedAt: null });
  assert.equal(activeParticipationCount(f.db(), 2027), 0); assert.equal(previewDirectory(f.db(), 2027)[0].approvedCurrentRecipient, false);
  assert.equal((await f.call('directoryParticipation', { id: original.id, year: 2027, state: 'active', excluded: false, reviewed: true, expectedRevision: 1 })).ok, true);
  const after = f.db().contacts[0];
  for (const field of ['subject', 'registeredEmail', 'mapping', 'provenance', ...Object.keys(fieldsOf(original))] as (keyof Contact)[]) assert.deepEqual(after[field], original[field]);
  assert.equal(activeParticipationCount(f.db(), 2027), 1); assert.equal(previewDirectory(f.db(), 2027)[0].approvedCurrentRecipient, true);
  assert.equal(previewDirectory(f.db(), 2026)[0].approvedCurrentRecipient, true);
  assert.equal(activeParticipationCount(f.db(), 2028), 0);
  await f.call('directoryParticipation', { id: original.id, year: 2028, state: 'excluded', excluded: true, reviewed: false, expectedRevision: 2 });
  assert.deepEqual(f.db().contacts[0].annualParticipation?.['2027'], after.annualParticipation?.['2027']);
  assert.equal(activeParticipationCount(f.db(), 2027), 1); assert.equal(activeParticipationCount(f.db(), 2028), 0);
  const generic = { ...fieldsOf(f.db().contacts[0]), phoneOptOut: true };
  await f.call('directoryUpdate', { id: original.id, fields: generic, reviewed: true, expectedRevision: 3 });
  assert.deepEqual(f.db().contacts[0].annualParticipation?.['2027'], after.annualParticipation?.['2027']);
});
test('annual participation validates exact year/fields, conflicts fail closed and opt-outs/archive/duplicates still block previews', async () => {
  const f = fixture(); const args = { id: 'synthetic-a', year: 2027, state: 'active', excluded: false, reviewed: true, expectedRevision: 1 };
  for (const patch of [{ year: 2026 }, { year: 2025 }, { year: 2101 }, { year: 2027.5 }, { state: 'submitted' }, { excluded: 'false' }, { reviewed: 1 }, { subject: 'forged' }, { fields: {} }]) {
    assert.equal((await f.call('directoryParticipation', { ...args, ...patch })).error?.code, 'validation');
  }
  const responses = await Promise.all([f.call('directoryParticipation', args), f.call('directoryParticipation', args)]);
  assert.equal(responses.filter(r => r.ok).length, 1); assert.equal(responses.filter(r => r.error?.code === 'conflict').length, 1);
  const c = f.db().contacts[0];
  for (const patch of [{ archived: true }, { emailOptOut: true }, { annualParticipation: { '2027': { ...c.annualParticipation!['2027'], review: 'pending' as const } } }]) {
    assert.equal(previewDirectory({ revision: 1, contacts: [{ ...c, ...patch }] }, 2027)[0].approvedCurrentRecipient, false);
  }
  assert.ok(previewDirectory({ revision: 1, contacts: [c, { ...synthetic('duplicate'), contactEmail: c.contactEmail }] }, 2027).every(p => !p.approvedCurrentRecipient));
  assert.equal(validDirectory({ ...f.db(), contacts: [{ ...c, annualParticipation: { '2026': c.annualParticipation!['2027'] } }] }), false);
  assert.equal(validDirectory({ ...f.db(), contacts: [{ ...c, annualParticipation: { '2027': { state: 'active' } } }] }), false);
});
