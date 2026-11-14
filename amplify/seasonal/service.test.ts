import { test } from 'node:test';
import assert from 'node:assert/strict';
import { service, Rejected, blankAnswers, progressOf, type Store, type Sheet, type Season, type Event, type ActiveSeason } from './service';

function fixture() {
  let active: ActiveSeason = { activeYear: 2026, revision: 0 };
  const sheets = new Map<string, Sheet>();
  const seasons = new Map<number, Season>();
  const legacy = [{ id: 'historical', year: 2025, owner: 'alice::old-name', additionalNotes: 'history' }];
  const k = (s: string, y: number) => `${s}:${y}`;
  const guard = (s: Season, expected?: ActiveSeason) => {
    if (expected && (expected.revision !== active.revision || s.year !== active.activeYear)) throw new Rejected('conflict');
    const live = seasons.get(s.year);
    if (live ? live.state !== 'open' || live.revision !== s.revision : s.year !== 2026 || s.revision !== 0) throw new Rejected('conflict');
  };
  const store: Store = {
    active: async () => active,
    seasons: async () => [...seasons.values()],
    legacyCount: async () => legacy.length,
    activate: async (next, expected, target, previous) => {
      if (active.revision !== expected.revision || seasons.get(target.year)?.revision !== target.revision ||
        seasons.get(previous.year)?.revision !== previous.revision) throw new Rejected('conflict');
      active = next;
    },
    season: async y => seasons.get(y) ?? null,
    configure: async (s, r) => { if ((seasons.get(s.year)?.revision ?? 0) !== r) throw new Rejected('conflict'); seasons.set(s.year, s); },
    get: async (s, y) => structuredClone(sheets.get(k(s, y)) ?? null),
    create: async (s, season, expected) => { guard(season, expected); if (sheets.has(k(s.ownerSubject, s.year))) throw new Rejected('conflict'); sheets.set(k(s.ownerSubject, s.year), structuredClone(s)); },
    save: async (s, r, season, expected) => { guard(season, expected); if (sheets.get(k(s.ownerSubject, s.year))?.revision !== r) throw new Rejected('conflict'); sheets.set(k(s.ownerSubject, s.year), structuredClone(s)); },
    progress: async y => ({ items: [...sheets.values()].filter(s => s.year === y).map(progressOf), nextToken: null }),
    legacy: async () => legacy,
  };
  const run = service(store, () => '2026-11-13T23:00:00.000Z');
  const call = (field: string, args: Record<string, unknown> = {}, sub = 'alice', admin = false) => run({ field,
    arguments: { year: 2026, ...(field === 'configureSeason' ? { confirmed: true } : {}), ...args }, identity: { sub, claims: { sub, 'cognito:groups': admin ? ['admin'] : [] } } });
  return { call, run, store, sheets, seasons, legacy };
}
test('two concurrent creates and retries resolve exactly one blank sheet without copying legacy', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.call('ensureSeasonSheet'), f.call('ensureSeasonSheet')]);
  assert.equal(a.ok, true); assert.deepEqual(a, b); assert.equal(f.sheets.size, 1);
  assert.deepEqual((a.data as Sheet).answers, blankAnswers());
  assert.deepEqual(await f.call('ensureSeasonSheet'), a);
  assert.equal(f.legacy[0].additionalNotes, 'history');
});
test('unknown, forged and historical years are rejected; configured years stay independent', async () => {
  const f = fixture();
  for (const year of [2025, 2027, 2026.5, '2026', 2101]) assert.equal((await f.call('ensureSeasonSheet', { year })).ok, false);
  assert.equal((await f.call('configureSeason', { year: 2027, state: 'open', expectedRevision: 0 }, 'admin', true)).ok, true);
  await f.call('ensureSeasonSheet');
  assert.equal((await f.call('ensureSeasonSheet', { year: 2027 })).error?.code, 'forbidden');
  assert.equal(f.sheets.size, 1);
});
test('in-flight transaction conflict retries the conditional create without reinitializing', async () => {
  const f = fixture(); const create = f.store.create; let attempts = 0;
  f.store.create = async (sheet, season) => { if (++attempts < 3) throw new Rejected('conflict'); await create(sheet, season, { activeYear: 2026, revision: 0 }); };
  assert.equal((await f.call('ensureSeasonSheet')).ok, true);
  assert.equal(attempts, 3); assert.equal(f.sheets.size, 1);
});
test('wrong owner, forged group/owner fields and missing or mismatched claims fail closed', async () => {
  const f = fixture();
  for (const args of [{ subject: 'bob' }, { ownerSubject: 'bob' }, { owner: 'bob' }, { participantId: 'bob' }, { groups: ['admin'] }]) {
    assert.equal((await f.call('ensureSeasonSheet', args)).error?.code, 'forbidden');
  }
  assert.equal((await f.call('configureSeason', { state: 'closed', expectedRevision: 0 })).error?.code, 'forbidden');
  for (const identity of [null, { sub: 'alice', claims: { sub: 'bob' } }]) {
    assert.equal((await f.run({ field: 'ensureSeasonSheet', arguments: { year: 2026 }, identity } as Event)).ok, false);
  }
});
test('save persists same-year draft, retry is idempotent, stale revisions and forged answers fail', async () => {
  const f = fixture(); await f.call('ensureSeasonSheet');
  const args = { answers: { ...blankAnswers(), additionalNotes: 'new draft' }, expectedRevision: 0,
    intent: 'save_draft', idempotencyKey: 'request-0001' };
  const saved = await f.call('saveSeasonSheet', args);
  assert.equal(saved.ok, true); assert.deepEqual(await f.call('saveSeasonSheet', args), saved);
  assert.deepEqual(await f.call('ensureSeasonSheet'), saved);
  assert.equal((await f.call('saveSeasonSheet', { ...args, idempotencyKey: 'request-0002' })).error?.code, 'conflict');
  assert.equal((await f.call('saveSeasonSheet', { ...args, answers: { ...args.answers, additionalNotes: 'changed' } })).error?.code, 'conflict');
  assert.equal((await f.call('saveSeasonSheet', { ...args, answers: { ...args.answers, ownerSubject: 'bob' } })).error?.code, 'validation');
});
test('drafts remain owner-private, admin metadata contains no answers; submitted reads and edits retain status', async () => {
  const f = fixture(); await f.call('ensureSeasonSheet');
  assert.equal((await f.call('seasonSheet', { subject: 'alice' }, 'admin', true)).error?.code, 'forbidden');
  assert.equal((await f.call('seasonProgress')).error?.code, 'forbidden');
  const metadata = await f.call('seasonProgress', {}, 'admin', true);
  assert.equal(JSON.stringify(metadata).includes('answers'), false);
  const args = { answers: blankAnswers(), expectedRevision: 0, intent: 'submit', idempotencyKey: 'submit-0001' };
  const submitted = (await f.call('saveSeasonSheet', args)).data as Sheet;
  assert.equal((await f.call('seasonSheet', { subject: 'alice' }, 'admin', true)).ok, true);
  assert.equal((await f.call('seasonSheet', { subject: 'alice' }, 'bob')).error?.code, 'forbidden');
  const revised = (await f.call('saveSeasonSheet', { ...args, expectedRevision: 1, intent: 'save_draft', idempotencyKey: 'revise-0001' })).data as Sheet;
  assert.equal(revised.state, 'submitted'); assert.equal(revised.submittedAt, submitted.submittedAt); assert.ok(revised.revisedAt);
});
test('closed season rejects create and save; atomic store guard rejects concurrent closure', async () => {
  const f = fixture(); await f.call('ensureSeasonSheet');
  await f.call('configureSeason', { state: 'closed', expectedRevision: 0 }, 'admin', true);
  assert.equal((await f.call('ensureSeasonSheet')).error?.code, 'closed_season');
  assert.equal((await f.call('saveSeasonSheet', { answers: blankAnswers(), expectedRevision: 0, intent: 'save_draft', idempotencyKey: 'closed-0001' })).error?.code, 'closed_season');
  const oldSeason: Season = { year: 2026, state: 'open', revision: 0, deadline: null };
  await assert.rejects(f.store.create([...f.sheets.values()][0], oldSeason, { activeYear: 2026, revision: 0 }), Rejected);
});
test('legacy lookup is deterministic, immutable and never fabricates submittedAt; ambiguity fails', async () => {
  const f = fixture(); const before = structuredClone(f.legacy);
  const legacy = await f.call('seasonSheet', { year: 2025 }, 'alice', true);
  assert.equal(legacy.ok, true); assert.equal((legacy.data as { state: string }).state, 'legacy_saved');
  assert.equal((legacy.data as { submittedAt: unknown }).submittedAt, null);
  assert.deepEqual(f.legacy, before);
  f.legacy.push({ ...f.legacy[0], id: 'ambiguous' });
  assert.equal((await f.call('seasonSheet', { year: 2025 }, 'alice', true)).error?.code, 'conflict');
});

test('history requires trusted admin claims even for its owner; denial never reads storage', async () => {
  const f = fixture(); let reads = 0;
  f.store.legacy = async () => { reads++; return f.legacy; };
  f.store.season = async () => { reads++; return null; };
  for (const args of [{ year: 2025 }, { year: 2025, subject: 'alice' },
    { year: 2025, subject: 'bob' }, { year: 2025, groups: ['admin'] }]) {
    assert.equal((await f.call('seasonSheet', args)).error?.code, 'forbidden');
  }
  for (const groups of [undefined, 'admin', ['Admin'], ['not-admin']]) {
    assert.equal((await f.run({ field: 'seasonSheet', arguments: { year: 2025 },
      identity: { sub: 'alice', claims: { sub: 'alice', 'cognito:groups': groups } } })).error?.code, 'forbidden');
  }
  assert.equal((await f.run({ field: 'seasonSheet', arguments: { year: 2025 },
    identity: { sub: 'alice', claims: { sub: 'bob', 'cognito:groups': ['admin'] } } })).error?.code, 'forbidden');
  assert.equal(reads, 0);
});

test('admin reads own and other history without changing originals; historical writes remain denied', async () => {
  const f = fixture(); const before = structuredClone(f.legacy);
  for (const [sub, args] of [['alice', { year: 2025 }], ['admin', { year: 2025, subject: 'alice' }]] as const) {
    const result = await f.call('seasonSheet', args, sub, true);
    assert.equal(result.ok, true);
    assert.deepEqual((result.data as { legacy: unknown }).legacy, before[0]);
  }
  for (const admin of [false, true]) for (const field of ['ensureSeasonSheet', 'saveSeasonSheet',
    'createSantasSheet', 'updateSantasSheet', 'deleteSantasSheet']) {
    assert.equal((await f.call(field, { year: 2025 }, 'alice', admin)).ok, false);
  }
  assert.deepEqual(f.legacy, before); assert.equal(f.sheets.size, 0);
});
test('SDK failures return sanitized error without values', async () => {
  const f = fixture(); f.store.get = async () => { throw new Error('private-answer-or-token'); };
  const result = await f.call('ensureSeasonSheet');
  assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes('private-answer-or-token'), false);
});


test('annual start/open/close/activate is explicit, confirmed, forward-only and creates no answer rows', async () => {
  const f = fixture();
  const configure = (year: number, state: string, expectedRevision: number, extra = {}) =>
    f.call('configureSeason', { year, state, expectedRevision, ...extra }, 'admin', true);
  const activate = (extra = {}) => f.call('activateSeason', { year: 2027, expectedRevision: 2, expectedActiveRevision: 0, confirmed: true, ...extra }, 'admin', true);
  assert.equal((await configure(2027, 'closed', 0, { confirmed: false })).error?.code, 'confirmation_required');
  assert.equal((await configure(2027, 'closed', 0)).ok, true);
  assert.equal((await configure(2027, 'open', 1)).ok, true);
  assert.equal((await activate()).error?.code, 'validation', 'current active year must be closed');
  await configure(2026, 'closed', 0);
  assert.equal((await activate({ expectedRevision: 1 })).error?.code, 'conflict');
  assert.equal((await activate({ confirmed: false })).error?.code, 'confirmation_required');
  assert.equal((await activate()).ok, true);
  assert.equal(((await f.call('seasonState')).data as ActiveSeason).activeYear, 2027);
  assert.equal(f.sheets.size, 0, 'metadata mutations never seed sheets');
  assert.equal((await configure(2026, 'open', 1)).error?.code, 'validation');
  assert.equal((await f.call('ensureSeasonSheet', { year: 2027 })).ok, true);
  assert.deepEqual(f.sheets.get('alice:2027')?.answers, blankAnswers());
});

test('previous seasonal years become admin-only before any answer reads, current draft remains private', async () => {
  const f = fixture(); await f.call('ensureSeasonSheet');
  await f.call('saveSeasonSheet', { answers: { ...blankAnswers(), additionalNotes: 'synthetic same-season work' }, expectedRevision: 0, intent: 'save_draft', idempotencyKey: 'save-before-switch' });
  const before = structuredClone(f.sheets.get('alice:2026'));
  await f.call('configureSeason', { state: 'closed', expectedRevision: 0 }, 'admin', true);
  await f.call('configureSeason', { year: 2027, state: 'open', expectedRevision: 0 }, 'admin', true);
  await f.call('activateSeason', { year: 2027, expectedRevision: 1, expectedActiveRevision: 0, confirmed: true }, 'admin', true);
  let reads = 0; const get = f.store.get; f.store.get = async (...a) => { reads++; return get(...a); };
  for (const field of ['seasonSheet', 'ensureSeasonSheet', 'saveSeasonSheet']) assert.equal((await f.call(field)).error?.code, 'forbidden');
  assert.equal(reads, 0);
  assert.equal((await f.call('seasonSheet', {}, 'alice', true)).ok, true, 'admin can read own historical draft');
  assert.equal((await f.call('seasonSheet', { subject: 'alice' }, 'admin', true)).error?.code, 'forbidden', 'other drafts remain private');
  assert.deepEqual(f.sheets.get('alice:2026'), before);
  await f.call('ensureSeasonSheet', { year: 2027 });
  assert.deepEqual(f.sheets.get('alice:2027')?.answers, blankAnswers());
  assert.deepEqual(f.sheets.get('alice:2026'), before);
});

test('close/reopen retains saved work, optional deadline defaults to null and server time stops edits', async () => {
  const f = fixture(); await f.call('ensureSeasonSheet');
  const before = structuredClone(f.sheets.get('alice:2026'));
  await f.call('configureSeason', { state: 'closed', expectedRevision: 0 }, 'admin', true);
  assert.equal((await f.call('seasonSheet')).ok, true, 'closed current year remains readable');
  await f.call('configureSeason', { state: 'open', expectedRevision: 1 }, 'admin', true);
  assert.deepEqual(((await f.call('ensureSeasonSheet')).data as Sheet).answers, before?.answers);
  assert.equal(f.seasons.get(2026)?.deadline, null);
  for (const deadline of ['tomorrow', '2026-02-30T00:00:00Z', '2026-11-13T23:00:00']) {
    assert.equal((await f.call('configureSeason', { state: 'open', expectedRevision: 2, deadline }, 'admin', true)).error?.code, 'validation');
  }
  await f.call('configureSeason', { state: 'open', expectedRevision: 2, deadline: '2026-11-13T22:00:00Z' }, 'admin', true);
  assert.equal((await f.call('ensureSeasonSheet')).error?.code, 'closed_season');
  assert.deepEqual(f.sheets.get('alice:2026'), before);
});

test('dashboard has exact complete metadata totals, no answers or invented submissions, failures fail closed', async () => {
  const f = fixture();
  await f.call('ensureSeasonSheet'); await f.call('ensureSeasonSheet', {}, 'bob');
  await f.call('saveSeasonSheet', { answers: blankAnswers(), expectedRevision: 0, intent: 'save_draft', idempotencyKey: 'dashboard-save' });
  const dashboard = await f.call('seasonAdmin', {}, 'admin', true);
  assert.equal(dashboard.ok, true);
  assert.deepEqual((dashboard.data as { totals: unknown }).totals, { initialized: 2, saved: 1, unsaved: 1, legacySaved: 0 });
  assert.equal(JSON.stringify(dashboard).includes('answers'), false);
  assert.equal(JSON.stringify(dashboard).includes('submitted'), false);
  assert.deepEqual(((await f.call('seasonAdmin', { year: 2025 }, 'admin', true)).data as { totals: unknown }).totals, { initialized: 0, saved: 0, unsaved: 0, legacySaved: 1 });
  assert.equal(((await f.call('seasonAdmin', { year: 2028 }, 'admin', true)).data as { totals: unknown }).totals, null);
  f.store.progress = async () => { throw new Error('PRIVATE'); };
  const failed = await f.call('seasonAdmin', {}, 'admin', true);
  assert.equal(failed.ok, false); assert.equal('data' in failed, false); assert.equal(JSON.stringify(failed).includes('PRIVATE'), false);
});

test('dashboard pagination includes every page and rejects duplicates, token loops and malformed rows', async () => {
  const f = fixture(); const a = { participantId: 'a', year: 2026, state: 'draft', savedAt: null };
  f.store.progress = async (_year, token) => token ? { items: [{ ...a, participantId: 'b', savedAt: '2026-11-13T00:00:00Z' }], nextToken: null } : { items: [a], nextToken: 'page-two' };
  assert.deepEqual(((await f.call('seasonAdmin', {}, 'admin', true)).data as { totals: unknown }).totals, { initialized: 2, saved: 1, unsaved: 1, legacySaved: 0 });
  for (const page of [{ items: [a, a], nextToken: null }, { items: [{ ...a, year: 2025 }], nextToken: null }, { items: [a], nextToken: 'loop' }]) {
    f.store.progress = async () => page;
    assert.equal((await f.call('seasonAdmin', {}, 'admin', true)).ok, false);
  }
});

test('all administrator operations deny ordinary and malformed claims before storage; all GETs create nothing', async () => {
  const f = fixture(); let reads = 0; f.store.active = async () => { reads++; return { activeYear: 2026, revision: 0 }; };
  for (const field of ['configureSeason', 'activateSeason', 'seasonAdmin', 'seasonProgress']) {
    assert.equal((await f.call(field, { confirmed: true })).error?.code, 'forbidden');
    for (const groups of ['admin', ['Admin'], []]) assert.equal((await f.run({ field, arguments: { year: 2026 }, identity: { sub: 'alice', claims: { sub: 'alice', 'cognito:groups': groups } } })).error?.code, 'forbidden');
  }
  assert.equal(reads, 0);
  for (const field of ['seasonState', 'seasonSheet', 'seasonAdmin', 'seasonProgress']) await f.call(field, {}, 'admin', true);
  assert.equal(f.sheets.size, 0);
});
