import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { buildSchema, graphql, GraphQLScalarType } from 'graphql';
import type { Schema } from '../../../../amplify/data/resource';
import { blankAnswers, service, type Answers, type Sheet, type Store } from '../../../../amplify/seasonal/service';
import { seasonApi, seasonWriter, type SaveRequest } from '../seasonal';

// Real pinned Amplify client/custom operation/HTTP serializer. Only fetch and
// AppSync's documented AWSJSON scalar/storage/authentication are local fixtures.
const schema = buildSchema(`scalar AWSJSON
  type Query { seasonSheet(year: Int!, subject: String): AWSJSON }
  type Mutation {
    saveSeasonSheet(year: Int!, answers: AWSJSON!, expectedRevision: Int!, intent: String!, idempotencyKey: String!): AWSJSON
  }`);
const json = schema.getType('AWSJSON') as GraphQLScalarType;
json.parseValue = value => {
  if (typeof value !== 'string') throw new Error('AWSJSON requires a JSON string');
  return JSON.parse(value);
};
json.serialize = value => JSON.stringify(value);
type Scalar = 'Int' | 'String' | 'AWSJSON';
const argument = (name: string, type: Scalar, isRequired = true) => ({ name, type, isArray: false, isRequired });
const operation = (name: string, args: Record<string, Scalar>) => ({ name, type: 'AWSJSON' as const, isArray: false, isRequired: false,
  arguments: Object.fromEntries(Object.entries(args).map(([key, type]) => [key, argument(key, type, key !== 'subject')])) });
Amplify.configure({ API: { GraphQL: { endpoint: 'https://synthetic.invalid/graphql', region: 'us-east-2',
  defaultAuthMode: 'apiKey', apiKey: 'synthetic-test-only', modelIntrospection: { version: 1, models: {}, nonModels: {}, enums: {},
    queries: { seasonSheet: operation('seasonSheet', { year: 'Int', subject: 'String' }) },
    mutations: { saveSeasonSheet: operation('saveSeasonSheet', { year: 'Int', answers: 'AWSJSON', expectedRevision: 'Int', intent: 'String', idempotencyKey: 'String' }) },
  } } } });
const client = generateClient<Schema>();
const originalFetch = globalThis.fetch;
const owner = 'synthetic-owner';
const fresh = (subject = owner): Sheet => ({ sheetId: `${subject}:2026`, participantId: subject, ownerSubject: subject,
  year: 2026, revision: 0, state: 'draft', savedAt: null, submittedAt: null, revisedAt: null, answers: blankAnswers() });
let rows: Map<string, Sheet>;
let legacy: object[];
let wires: { query: string; variables: Record<string, unknown> }[];
let writes: number;
let loseResponse: boolean;
test.beforeEach(() => {
  rows = new Map([fresh(), fresh('synthetic-other')].map(row => [row.sheetId, row]));
  legacy = [{ id: 'synthetic-2025', owner: 'synthetic-owner::old-login', year: 2025,
    additionalNotes: 'Synthetic history', createdAt: '2025-01-01', updatedAt: '2025-12-01' }];
  wires = []; writes = 0; loseResponse = false;
  const noAdminWrite = async () => { throw Error('Unexpected administration'); };
  const store: Store = {
    active: async () => ({ activeYear: 2026, revision: 0 }), seasons: async () => [],
    activate: noAdminWrite, configure: noAdminWrite, legacyCount: async () => legacy.length,
    season: async () => null, get: async (subject, year) => structuredClone(rows.get(`${subject}:${year}`) ?? null),
    create: noAdminWrite, progress: async () => ({ items: [], nextToken: null }),
    legacy: async () => structuredClone(legacy) as Record<string, unknown>[],
    save: async (row, revision) => {
      assert.equal(row.ownerSubject, owner); assert.equal(row.year, 2026);
      assert.equal(rows.get(row.sheetId)?.revision, revision);
      writes++; rows.set(row.sheetId, structuredClone(row));
    },
  };
  const run = service(store, () => '2026-11-14T12:00:00.000Z');
  const invoke = (field: string, args: Record<string, unknown>) => run({ field, arguments: args,
    identity: { sub: owner, claims: { sub: owner, 'cognito:groups': [] } } });
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://synthetic.invalid/graphql');
    const wire = JSON.parse(String(init?.body)); wires.push(structuredClone(wire));
    const result = await graphql({ schema, source: wire.query, variableValues: wire.variables, rootValue: {
      saveSeasonSheet: (args: Record<string, unknown>) => invoke('saveSeasonSheet', args),
      seasonSheet: (args: Record<string, unknown>) => invoke('seasonSheet', args),
    } });
    if (loseResponse && wire.query.includes('saveSeasonSheet')) {
      loseResponse = false;
      return new Response(JSON.stringify({ errors: [{ message: 'Network response lost after commit' }] }));
    }
    return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
  };
});
test.after(() => { globalThis.fetch = originalFetch; });

test('installed custom-operation path exposes baseline object defect before backend execution', async () => {
  const resource = readFileSync(new URL('../../../../amplify/data/resource.ts', import.meta.url), 'utf8');
  assert.match(resource, /saveSeasonSheet:[\s\S]*?answers: a\.json\(\)\.required\(\)/);
  const result = await client.mutations.saveSeasonSheet({ year: 2026, answers: { ...blankAnswers(), additionalNotes: 'Synthetic partial' },
    expectedRevision: 0, intent: 'save_draft', idempotencyKey: 'baseline-defect' });
  assert.ok(result.errors?.length);
  assert.match(wires[0].query, /\$answers:\s*AWSJSON!/);
  assert.equal(typeof wires[0].variables.answers, 'object');
  assert.equal(writes, 0);
});

for (const [name, answers] of [
  ['one partially filled answer', { ...blankAnswers(), additionalNotes: 'Synthetic partial' }],
  ['entirely blank answers', blankAnswers()],
  ['mixed empty lists/text and Unicode', { ...blankAnswers(), favoriteCandySnack: ['Synthetic chocolate', '雪 "quoted"'],
    favoriteSaying: 'line one\nline two', familyDetails: 'Synthetic family' }],
] as [string, Answers][]) {
  test(`native wire save/reopen accepts ${name} with exact owner/year/revision and preserves other rows`, async () => {
    const untouched = structuredClone({ other: rows.get('synthetic-other:2026'), legacy });
    const api = seasonApi(client, owner);
    const initial = await api.read(); assert.ok(initial);
    const writer = seasonWriter(api, initial, () => 'synthetic-save-id');
    const saved = await writer(answers);
    assert.equal(saved.ownerSubject, owner); assert.equal(saved.participantId, owner);
    assert.equal(saved.sheetId, `${owner}:2026`); assert.equal(saved.year, 2026); assert.equal(saved.revision, 1);
    assert.equal(saved.state, 'draft'); assert.equal(saved.submittedAt, null);
    assert.deepEqual(saved.answers, answers);
    const reopened = await seasonApi(generateClient<Schema>(), owner).read();
    assert.deepEqual(reopened, saved);
    const wire = wires.find(w => w.query.includes('saveSeasonSheet'))!;
    assert.equal(typeof wire.variables.answers, 'string');
    assert.deepEqual(JSON.parse(wire.variables.answers as string), answers);
    assert.deepEqual({ ...wire.variables, answers }, { year: 2026, answers, expectedRevision: 0, intent: 'save_draft', idempotencyKey: 'synthetic-save-id' });
    assert.deepEqual({ other: rows.get('synthetic-other:2026'), legacy }, untouched);
    assert.equal(writes, 1);
  });
}

test('uncertain real-wire save retries original ID/revision/serialized answers before newer edits', async () => {
  const api = seasonApi(client, owner); const initial = await api.read(); assert.ok(initial);
  let ids = 0; const writer = seasonWriter(api, initial, () => `synthetic-retry-${++ids}`);
  loseResponse = true;
  const partial = { ...blankAnswers(), additionalNotes: 'Synthetic original' };
  await assert.rejects(writer(partial), /Connection interrupted/);
  const later = { ...partial, favoriteSaying: 'Synthetic later' };
  const final = await writer(later);
  const saves = wires.filter(w => w.query.includes('saveSeasonSheet'));
  assert.deepEqual(saves[0].variables, saves[1].variables);
  assert.equal(saves[2].variables.expectedRevision, 1); assert.equal(ids, 2);
  assert.equal(final.revision, 2); assert.deepEqual(final.answers, later); assert.equal(writes, 2);
});

test('serialization preserves revision conflict, historical denial and other-owner rows', async () => {
  const api = seasonApi(client, owner);
  const request: SaveRequest = { year: 2026, answers: blankAnswers(), expectedRevision: 0, intent: 'save_draft', idempotencyKey: 'synthetic-first' };
  await api.save(request);
  await assert.rejects(api.save({ ...request, idempotencyKey: 'synthetic-stale' }), /different data/);
  await assert.rejects(api.save({ ...request, year: 2025, idempotencyKey: 'synthetic-history' }), /permission/);
  assert.equal(writes, 1); assert.equal(rows.get('synthetic-other:2026')?.revision, 0);
});
