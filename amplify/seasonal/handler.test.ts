import assert from 'node:assert/strict';
import test from 'node:test';
import { DynamoDBClient, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { blankAnswers, Rejected, service, type Sheet, type Season, type ActiveSeason } from './service';
const original = DynamoDBClient.prototype.send;
const commands: { name: string; input: Record<string, unknown> }[] = [];
let fail = false;
let responder: ((command: { name: string; input: Record<string, unknown> }) => Promise<unknown>) | null = null;
DynamoDBClient.prototype.send = (async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
  commands.push({ name: command.constructor.name, input: command.input });
  if (fail) { const e = new Error('synthetic'); e.name = 'TransactionCanceledException'; throw e; }
  if (responder) return responder(commands.at(-1)!);
  return { Items: [], Count: 0 };
}) as unknown as typeof original;
process.env.AWS_REGION = 'us-east-2'; process.env.SEASON_TABLE = 'synthetic-season'; process.env.LEGACY_TABLE = 'synthetic-legacy';
const { store } = await import('./handler');
test.after(() => { DynamoDBClient.prototype.send = original; });
const season: Season = { year: 2026, state: 'open', revision: 0, deadline: null };
const sheet: Sheet = { sheetId: 'synthetic:2026', ownerSubject: 'synthetic', participantId: 'synthetic', year: 2026,
  revision: 0, state: 'draft', savedAt: null, submittedAt: null, revisedAt: null, answers: blankAnswers() };
test('sheet transaction atomically guards active revision and season before writing response/progress', async () => {
  await store.create(sheet, season, { activeYear: 2026, revision: 0 });
  const writes = commands.at(-1)!.input.TransactItems as Record<string, Record<string, unknown>>[];
  assert.equal(writes.length, 4);
  assert.deepEqual(writes[0].ConditionCheck.Key, { pk: { S: 'CONFIG' }, sk: { S: 'ACTIVE' } });
  assert.equal(writes[0].ConditionCheck.ConditionExpression, 'attribute_not_exists(pk)');
  assert.equal(writes[1].ConditionCheck.ConditionExpression, 'attribute_not_exists(pk)');
  fail = true; await assert.rejects(store.create(sheet, season, { activeYear: 2026, revision: 0 }), Rejected); fail = false;
});
test('activation transaction guards both observed season revisions/states and active config; config reads and legacy COUNT never create', async () => {
  await store.activate({ activeYear: 2027, revision: 1 }, { activeYear: 2026, revision: 0 }, { year: 2027, state: 'open', revision: 2, deadline: null }, { year: 2026, state: 'closed', revision: 1, deadline: null });
  const writes = commands.at(-1)!.input.TransactItems as Record<string, Record<string, unknown>>[];
  assert.equal(writes.length, 3); assert.ok(writes[0].Put); assert.equal(writes[1].ConditionCheck.ConditionExpression, 'revision = :revision AND #state = :state');
  assert.deepEqual(writes[2].ConditionCheck.ExpressionAttributeValues, { ':revision': { N: '1' }, ':state': { S: 'closed' } });
  const start = commands.length; assert.equal((await store.active()).activeYear, 2026); await store.seasons(); assert.equal(await store.legacyCount(), 0);
  assert.deepEqual(commands.slice(start).map(c => c.name), ['GetItemCommand', 'QueryCommand', 'ScanCommand']);
  assert.equal(commands.at(-1)!.input.Select, 'COUNT');
});


// Evaluate only synthetic CONFIG operations captured at the real SDK send boundary.
// No credentials or endpoint are consulted; every command is intercepted above.
function configurationFixture(active?: ActiveSeason) {
  type Item = Record<string, AttributeValue>;
  type Operation = { Key?: Item; Item?: Item; ConditionExpression?: string; ExpressionAttributeValues?: Item };
  const db = new Map<string, Item>();
  const id = (item: Item) => `${item.pk.S}/${item.sk.S}`;
  const record = (key: string, value: Season | ActiveSeason): Item => ({ pk: { S: 'CONFIG' }, sk: { S: key },
    revision: { N: String(value.revision) }, ...('state' in value ? { state: { S: value.state } } : {}), document: { S: JSON.stringify(value) } });
  const initial2026: Season = { year: 2026, state: 'closed', revision: 1, deadline: null };
  const initial2027: Season = { year: 2027, state: 'open', revision: 1, deadline: null };
  db.set('CONFIG/YEAR#2026', record('YEAR#2026', initial2026));
  db.set('CONFIG/YEAR#2027', record('YEAR#2027', initial2027));
  if (active) db.set('CONFIG/ACTIVE', record('ACTIVE', active));
  let beforeConfigure: (() => Promise<void>) | null = null;
  let beforeActivate: (() => Promise<void>) | null = null;
  let successfulWrites = 0;
  function check(operation: Operation) {
    const current = db.get(id((operation.Key ?? operation.Item)!));
    const condition = operation.ConditionExpression ?? '';
    const values = operation.ExpressionAttributeValues ?? {};
    if (condition.includes('attribute_not_exists')) return !current;
    if (condition.includes('revision = :revision') && current?.revision.N !== values[':revision']?.N) return false;
    if (condition.includes('#state = :state') && current?.state.S !== values[':state']?.S) return false;
    if (condition.includes('#document = :active') && current?.document.S !== values[':active']?.S) return false;
    return true;
  }
  responder = async command => {
    if (command.name === 'GetItemCommand') return { Item: structuredClone(db.get(id(command.input.Key as Item))) };
    const operations = command.name === 'PutItemCommand' ? [{ Put: command.input as Operation }]
      : command.input.TransactItems as { Put?: Operation; ConditionCheck?: Operation }[];
    assert.ok(operations, `Unexpected synthetic SDK command: ${command.name}`);
    const configuration = operations.some(op => op.Put?.Item?.sk.S?.startsWith('YEAR#'));
    const activation = operations.some(op => op.Put?.Item?.sk.S === 'ACTIVE');
    if (configuration && beforeConfigure) { const hook = beforeConfigure; beforeConfigure = null; await hook(); }
    if (activation && beforeActivate) { const hook = beforeActivate; beforeActivate = null; await hook(); }
    if (!operations.every(op => check((op.Put ?? op.ConditionCheck)!))) {
      const error = new Error('synthetic conditional conflict');
      error.name = command.name === 'PutItemCommand' ? 'ConditionalCheckFailedException' : 'TransactionCanceledException'; throw error;
    }
    for (const op of operations) if (op.Put) { db.set(id(op.Put.Item!), structuredClone(op.Put.Item!)); successfulWrites++; }
    return {};
  };
  const identity = { sub: 'synthetic-admin', claims: { sub: 'synthetic-admin', 'cognito:groups': ['admin'] } };
  const run = service(store, () => '2026-11-13T23:00:00Z');
  const configure = (patch = {}) => run({ field: 'configureSeason', arguments: {
    year: 2026, state: 'open', expectedRevision: 1, confirmed: true, ...patch,
  }, identity });
  const activate = () => run({ field: 'activateSeason', arguments: {
    year: 2027, expectedRevision: 1, expectedActiveRevision: 0, confirmed: true,
  }, identity });
  return { configure, activate, db, record, initial2026,
    beforeConfigure: (hook: () => Promise<void>) => { beforeConfigure = hook; },
    beforeActivate: (hook: () => Promise<void>) => { beforeActivate = hook; },
    writes: () => successfulWrites,
    close: () => { responder = null; },
  };
}

test('activation wins race: stale reopen/close/deadline configuration conflicts and leaves history untouched', async () => {
  for (const patch of [{ state: 'open' }, { state: 'closed' }, { state: 'closed', deadline: '2027-01-01T00:00:00Z' }]) {
    const f = configurationFixture();
    try {
      f.beforeConfigure(async () => { assert.equal((await f.activate()).ok, true); });
      const result = await f.configure(patch);
      assert.equal(result.error?.code, 'conflict');
      assert.equal(JSON.parse(f.db.get('CONFIG/ACTIVE')!.document.S!).activeYear, 2027);
      assert.deepEqual(JSON.parse(f.db.get('CONFIG/YEAR#2026')!.document.S!), f.initial2026);
      assert.equal(f.writes(), 1, 'only activation writes; stale configuration writes nothing');
    } finally { f.close(); }
  }
});

test('configuration wins race: delayed activation conflicts on observed previous season revision/state', async () => {
  const f = configurationFixture();
  try {
    f.beforeActivate(async () => { assert.equal((await f.configure()).ok, true); });
    assert.equal((await f.activate()).error?.code, 'conflict');
    assert.equal(f.db.has('CONFIG/ACTIVE'), false); assert.equal(f.writes(), 1);
    assert.equal(JSON.parse(f.db.get('CONFIG/YEAR#2026')!.document.S!).state, 'open');
  } finally { f.close(); }
});

test('initial implicit and unchanged persisted active states configure successfully with atomic SDK guards', async () => {
  for (const active of [undefined, { activeYear: 2027, revision: 2 }]) {
    const f = configurationFixture(active);
    try {
      const year = active?.activeYear ?? 2026;
      if (!active) f.db.delete('CONFIG/YEAR#2026');
      assert.equal((await f.configure({ year, state: 'closed', expectedRevision: active ? 1 : 0 })).ok, true);
      const command = commands.at(-1)!;
      assert.equal(command.name, 'TransactWriteItemsCommand');
      const items = command.input.TransactItems as { ConditionCheck?: Record<string, unknown>; Put?: Record<string, unknown> }[];
      assert.equal(items.length, 2);
      assert.deepEqual(items[0].ConditionCheck?.Key, { pk: { S: 'CONFIG' }, sk: { S: 'ACTIVE' } });
      if (!active) {
        assert.equal(items[0].ConditionCheck?.ConditionExpression, 'attribute_not_exists(pk)');
        assert.equal(f.db.has('CONFIG/ACTIVE'), false, 'implicit state is not blindly written or seeded');
      } else {
        assert.equal(items[0].ConditionCheck?.ConditionExpression, 'revision = :revision AND #document = :active');
        assert.deepEqual(items[0].ConditionCheck?.ExpressionAttributeNames, { '#document': 'document' });
        assert.deepEqual(items[0].ConditionCheck?.ExpressionAttributeValues, { ':revision': { N: '2' }, ':active': { S: JSON.stringify(active) } });
      }
      assert.equal(items[1].Put?.ConditionExpression, active ? 'revision = :revision' : 'attribute_not_exists(pk)');
      assert.equal(f.writes(), 1);
      assert.equal(JSON.parse(f.db.get(`CONFIG/YEAR#${year}`)!.document.S!).revision, active ? 2 : 1);
    } finally { f.close(); }
  }
});


test('persisted pointer mismatch and stale active revision both reject configuration without writes', async () => {
  const f = configurationFixture({ activeYear: 2027, revision: 2 });
  try {
    for (const observed of [{ activeYear: 2026, revision: 2 }, { activeYear: 2027, revision: 1 }]) {
      await assert.rejects(store.configure({ year: 2027, state: 'closed', revision: 2, deadline: null }, 1, observed),
        error => error instanceof Rejected && error.code === 'conflict');
    }
    assert.equal(f.writes(), 0); assert.equal(JSON.parse(f.db.get('CONFIG/YEAR#2027')!.document.S!).state, 'open');
  } finally { f.close(); }
});
