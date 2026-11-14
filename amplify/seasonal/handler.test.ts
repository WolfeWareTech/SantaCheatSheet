import assert from 'node:assert/strict';
import test from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { blankAnswers, Rejected, type Sheet, type Season } from './service';
const original = DynamoDBClient.prototype.send;
const commands: { name: string; input: Record<string, unknown> }[] = [];
let fail = false;
DynamoDBClient.prototype.send = (async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
  commands.push({ name: command.constructor.name, input: command.input });
  if (fail) { const e = new Error('synthetic'); e.name = 'TransactionCanceledException'; throw e; }
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
