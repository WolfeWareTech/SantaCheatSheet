// Run from the isolated repo. Synthetic data only; credentials never leave RAM.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { Amplify } from 'aws-amplify';
import { signIn, fetchAuthSession, signOut } from 'aws-amplify/auth';

const root = resolve('../../../..');
const out = resolve(root, 'orchestration/results/P04/01');
const stack = 'amplify-santap04-p0401-sandbox-3d7b374560';
const project = '904233126347';
const stage = process.argv[2] ?? 'discover';
const evidence = [];
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const save = (p, value) => writeFileSync(resolve(out, p), JSON.stringify(value, null, 2) + '\n');
function lease(arn) {
  const l = read(resolve(root, 'orchestration/REGISTRY.json')).leases.find(l => l.lease_id === 'P04-01');
  assert.equal(l.state, 'active'); assert.equal(l.thread_id, '01a1d735-b654-71b0-94ad-59039983049f');
  if (arn) assert.ok(l.cloud_write_resources.includes(arn), 'Exact test target must be bound in lease');
  return l;
}
function cli(service, operation, args = [], target) {
  lease(target);
  try {
    return JSON.parse(execFileSync('aws', [service, operation, ...args, '--region', 'us-east-2',
      '--profile', 'mcp-wwrs-deploy', '--output', 'json', '--no-cli-pager'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, AWS_CLI_OUTPUT_ENCODING: 'UTF-8' } }) || '{}');
  } catch { throw new Error(`AWS request failed (${service}:${operation}); private diagnostics suppressed`); }
}
const arn = (service, path) => `arn:aws:${service}:us-east-2:${project}:${path}`;
function discover() {
  const resources = [];
  const walk = name => {
    for (const r of cli('cloudformation', 'list-stack-resources', ['--stack-name', name]).StackResourceSummaries) {
      resources.push(r);
      if (r.ResourceType === 'AWS::CloudFormation::Stack') walk(r.PhysicalResourceId);
    }
  };
  walk(stack);
  const find = (type, logical) => {
    const matches = resources.filter(r => r.ResourceType === type && (!logical || r.LogicalResourceId.startsWith(logical)));
    assert.equal(matches.length, 1, `Expected one ${type} ${logical ?? ''}`);
    return matches[0].PhysicalResourceId;
  };
  const apiId = find('AWS::AppSync::GraphQLApi').split('/').pop();
  const api = cli('appsync', 'get-graphql-api', ['--api-id', apiId]).graphqlApi;
  const binding = { stack, apiId, endpoint: api.uris.GRAPHQL,
    pool: find('AWS::Cognito::UserPool'), client: find('AWS::Cognito::UserPoolClient'),
    seasonal: find('AWS::DynamoDB::Table'), legacy: `SantasSheet-${apiId}-NONE`,
    handler: find('AWS::Lambda::Function', 'SeasonService'),
    stack_resources: resources.map(r => ({ logical_id: r.LogicalResourceId, physical_id: r.PhysicalResourceId, type: r.ResourceType })) };
  binding.test_arns = [arn('cognito-idp', `userpool/${binding.pool}`), arn('appsync', `apis/${apiId}`),
    arn('dynamodb', `table/${binding.seasonal}`), arn('dynamodb', `table/${binding.legacy}`), arn('lambda', `function:${binding.handler}`)];
  assert.notEqual(binding.pool, 'us-east-2_P5kbIPFNP'); assert.notEqual(apiId, 'zzosqpbvzbgndoe5ntrns7634a');
  save('CLOUD_BINDING_REQUEST.json', binding);
  return binding;
}
async function identities(b) {
  const poolArn = arn('cognito-idp', `userpool/${b.pool}`);
  lease(poolArn);
  try { cli('cognito-idp', 'get-group', ['--user-pool-id', b.pool, '--group-name', 'admin']); }
  catch { cli('cognito-idp', 'create-group', ['--user-pool-id', b.pool, '--group-name', 'admin'], poolArn); }
  Amplify.configure({ Auth: { Cognito: { userPoolId: b.pool, userPoolClientId: b.client } } });
  const result = {};
  for (const role of ['owner', 'other', 'admin']) {
    const username = `p04-01-${role}@example.invalid`;
    const password = `S4!${randomBytes(24).toString('hex')}`;
    let user;
    try { user = cli('cognito-idp', 'admin-get-user', ['--user-pool-id', b.pool, '--username', username]); }
    catch {
      user = cli('cognito-idp', 'admin-create-user', ['--user-pool-id', b.pool, '--username', username,
        '--message-action', 'SUPPRESS', '--user-attributes', JSON.stringify([
          { Name: 'email', Value: username }, { Name: 'email_verified', Value: 'true' },
          { Name: 'given_name', Value: 'Synthetic' }, { Name: 'family_name', Value: 'P04Fixture' },
        ])], poolArn).User;
    }
    cli('cognito-idp', 'admin-set-user-password', ['--user-pool-id', b.pool, '--username', username,
      '--password', password, '--permanent'], poolArn);
    if (role === 'admin') cli('cognito-idp', 'admin-add-user-to-group', ['--user-pool-id', b.pool,
      '--username', username, '--group-name', 'admin'], poolArn);
    const login = await signIn({ username, password });
    assert.equal(login.isSignedIn, true);
    const session = await fetchAuthSession();
    result[role] = { token: session.tokens.idToken.toString(), subject: session.tokens.idToken.payload.sub,
      username: user.Username };
    await signOut();
  }
  return result;
}
async function graphql(b, who, document, variables = {}) {
  lease(arn('appsync', `apis/${b.apiId}`));
  const response = await fetch(b.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: who.token },
    body: JSON.stringify({ query: document, variables }) });
  assert.equal(response.status, 200);
  return response.json();
}
function envelope(result, field) {
  assert.ok(!result.errors?.length, `GraphQL operation ${field} failed`);
  const value = result.data?.[field];
  assert.ok(value != null, `Missing ${field} result`);
  return typeof value === 'string' ? JSON.parse(value) : value;
}
const ensureDoc = 'mutation($year:Int!){ensureSeasonSheet(year:$year)}';
const getDoc = 'query($year:Int!,$subject:String){seasonSheet(year:$year,subject:$subject)}';
const configDoc = 'mutation($year:Int!,$state:String!,$revision:Int!){configureSeason(year:$year,state:$state,expectedRevision:$revision)}';
const saveDoc = 'mutation($year:Int!,$answers:AWSJSON!,$revision:Int!,$intent:String!,$id:String!){saveSeasonSheet(year:$year,answers:$answers,expectedRevision:$revision,intent:$intent,idempotencyKey:$id)}';
const check = (name, condition) => { assert.ok(condition, name); evidence.push({ name, passed: true }); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function scan(b, name) {
  return cli('dynamodb', 'scan', ['--table-name', b[name], '--consistent-read']).Items.sort((a, c) => JSON.stringify(a).localeCompare(JSON.stringify(c)));
}
async function verify(b, users) {
  const call = async (who, doc, vars, field) => envelope(await graphql(b, who, doc, vars), field);
  const owner = users.owner, admin = users.admin, other = users.other;
  const ensure = year => call(owner, ensureDoc, { year }, 'ensureSeasonSheet');
  const config = (year, state, revision) => call(admin, configDoc, { year, state, revision }, 'configureSeason');
  const readSheet = (who, year, subject) => call(who, getDoc, { year, subject }, 'seasonSheet');
  const initial = await Promise.all([ensure(2026), ensure(2026)]);
  check('concurrent create same subject/year resolves one record', initial.every(r => r.ok) && digest(initial[0]) === digest(initial[1]));
  const sheet = initial[0].data;
  check('all initial answers blank', Object.values(sheet.answers).every(v => v === '' || Array.isArray(v) && v.length === 0));
  check('create retry returns original', digest(await ensure(2026)) === digest(initial[0]));
  check('unknown year rejected', !(await ensure(2027)).ok);
  check('historical create rejected', !(await ensure(2025)).ok);
  check('regular user admin operation denied', (await graphql(b, owner, configDoc, { year: 2027, state: 'open', revision: 0 })).errors?.length > 0);
  check('admin opens a separate allowed year', (await config(2027, 'open', 0)).ok);
  check('different years independent', (await ensure(2027)).data.sheetId !== sheet.sheetId);
  check('other owner cannot read draft', !(await readSheet(other, 2026, owner.subject)).ok);
  check('admin cannot read draft', !(await readSheet(admin, 2026, owner.subject)).ok);
  const progress = await call(admin, 'query{seasonProgress(year:2026)}', {}, 'seasonProgress');
  check('admin receives metadata without answers', progress.ok && progress.data.items.length === 1 && !JSON.stringify(progress).includes('answers'));
  const update = { year: 2026, answers: JSON.stringify({ ...sheet.answers, additionalNotes: 'Synthetic P04 draft' }), revision: 0, intent: 'save_draft', id: 'p04-cloud-save-01' };
  const saved = await call(owner, saveDoc, update, 'saveSeasonSheet');
  check('save confirmed persisted', saved.ok && saved.data.revision === 1 && saved.data.answers.additionalNotes === 'Synthetic P04 draft');
  check('same-year resume retains saved answers', digest(await ensure(2026)) === digest(saved));
  check('save retry idempotent', digest(await call(owner, saveDoc, update, 'saveSeasonSheet')) === digest(saved));
  check('stale revision rejected', !(await call(owner, saveDoc, { ...update, id: 'p04-stale-01' }, 'saveSeasonSheet')).ok);
  check('forged answer owner rejected', !(await call(owner, saveDoc, { ...update, answers: JSON.stringify({ ...sheet.answers, ownerSubject: other.subject }) }, 'saveSeasonSheet')).ok);
  check('forged mutation subject rejected at schema', (await graphql(b, owner, 'mutation{ensureSeasonSheet(year:2026,subject:"forged")}')).errors?.length > 0);
  const submitted = await call(owner, saveDoc, { ...update, revision: 1, intent: 'submit', id: 'p04-submit-01' }, 'saveSeasonSheet');
  check('submission owner/admin visibility', submitted.ok && (await readSheet(admin, 2026, owner.subject)).ok && !(await readSheet(other, 2026, owner.subject)).ok);
  const revised = await call(owner, saveDoc, { ...update, revision: 2, id: 'p04-revise-01' }, 'saveSeasonSheet');
  check('submitted status and original timestamp retained', revised.ok && revised.data.state === 'submitted' && revised.data.submittedAt === submitted.data.submittedAt && !!revised.data.revisedAt);
  check('admin closes season', (await config(2026, 'closed', 0)).ok);
  check('closed create and save rejected', !(await ensure(2026)).ok && !(await call(owner, saveDoc, { ...update, revision: 3, id: 'p04-closed-01' }, 'saveSeasonSheet')).ok);
  const legacy = { id: { S: 'p04-synthetic-legacy-2025' }, year: { N: '2025' }, owner: { S: `${owner.subject}::${owner.username}` },
    displayName: { S: 'Synthetic history' }, additionalNotes: { S: 'Synthetic historical answer' },
    createdAt: { S: '2025-11-01T12:00:00.000Z' }, updatedAt: { S: '2025-11-01T12:00:00.000Z' },
    unknownPreservedField: { M: { ordered: { L: [{ S: 'first' }, { NULL: true }] } } } };
  cli('dynamodb', 'put-item', ['--table-name', b.legacy, '--item', JSON.stringify(legacy), '--condition-expression', 'attribute_not_exists(id)'], arn('dynamodb', `table/${b.legacy}`));
  const before = scan(b, 'legacy');
  const history = await readSheet(owner, 2025);
  check('legacy lookup deterministic without invented submission', history.ok && history.data.state === 'legacy_saved' && history.data.submittedAt === null && history.data.legacy.id === 'p04-synthetic-legacy-2025');
  check('legacy owner/admin reads preserved', (await readSheet(admin, 2025, owner.subject)).ok && !(await readSheet(other, 2025, owner.subject)).ok);
  const oldSave = await graphql(b, owner, 'mutation{updateSantasSheet(input:{id:"p04-synthetic-legacy-2025",additionalNotes:"attempted overwrite"}){id}}');
  check('old-client owner save denied by deployed resolver', oldSave.errors?.some(e => e.errorType === 'FORBIDDEN'));
  for (const [name, doc] of [['create', 'mutation{createSantasSheet(input:{year:2026}){id}}'], ['delete', 'mutation{deleteSantasSheet(input:{id:"p04-synthetic-legacy-2025"}){id}}']]) {
    check(`old-client ${name} denied`, (await graphql(b, owner, doc)).errors?.some(e => e.errorType === 'FORBIDDEN'));
  }
  check('all synthetic legacy fields unchanged after rejected old writes', digest(scan(b, 'legacy')) === digest(before));
  const existingGet = await graphql(b, owner, 'query{getSantasSheet(id:"p04-synthetic-legacy-2025"){id additionalNotes}}');
  check('existing generated legacy owner read still works', !existingGet.errors && existingGet.data.getSantasSheet.additionalNotes === 'Synthetic historical answer');
  const otherGet = await graphql(b, other, 'query{getSantasSheet(id:"p04-synthetic-legacy-2025"){id additionalNotes}}');
  check('existing generated cross-owner read denied', !otherGet.data?.getSantasSheet);
  save('evidence/isolated-checks.json', { environment: 'isolated AWS us-east-2', checks: evidence, sends: 0, real_enrollments: 0,
    legacy_sha256: digest(before), seasonal_sha256: digest(scan(b, 'seasonal')), production_writes: 0 });
}
async function rollbackCheck(b, users, maintenance) {
  const expected = read(resolve(out, 'evidence/isolated-checks.json'));
  const result = envelope(await graphql(b, users.owner, getDoc, { year: 2026 }), 'seasonSheet');
  check(maintenance ? 'maintenance mode safely unavailable' : 'normal backend restored', maintenance ? result.error?.code === 'maintenance' : result.ok);
  const oldSave = await graphql(b, users.owner, 'mutation{updateSantasSheet(input:{id:"p04-synthetic-legacy-2025",additionalNotes:"rollback overwrite"}){id}}');
  check('legacy guard remains during rollback', oldSave.errors?.some(e => e.errorType === 'FORBIDDEN'));
  check('all legacy rows unchanged', digest(scan(b, 'legacy')) === expected.legacy_sha256);
  check('all seasonal rows unchanged', digest(scan(b, 'seasonal')) === expected.seasonal_sha256);
  save(`evidence/${maintenance ? 'rollback' : 'restored'}-checks.json`, { checks: evidence, production_writes: 0, sends: 0 });
}
try {
  lease();
  if (stage === 'discover') { discover(); console.log(JSON.stringify({ stage, status: 'binding_request_ready' })); }
  else {
    const b = read(resolve(out, 'CLOUD_BINDING_REQUEST.json'));
    for (const target of b.test_arns) lease(target);
    const users = await identities(b);
    if (stage === 'verify') await verify(b, users);
    else if (stage === 'rollback' || stage === 'restored') await rollbackCheck(b, users, stage === 'rollback');
    else throw new Error('Unknown stage');
    console.log(JSON.stringify({ stage, status: 'passed', checks: evidence.length, sends: 0 }));
  }
} catch (error) {
  const encrypted = execFileSync('powershell', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.Security; $p04Input=[Console]::In.ReadToEnd(); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($p04Input),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))'],
  { input: JSON.stringify({ name: error.name, message: error.message, stack: error.stack }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  writeFileSync(resolve(root, `implementation/private/P04/01/${stage}-error.dpapi`), Buffer.from(encrypted.trim(), 'base64'));
  save(`evidence/${stage}-failure.json`, { stage, passed_checks: evidence, status: 'failed', private_diagnostics_suppressed: true });
  console.log(JSON.stringify({ stage, status: 'failed', passed_checks: evidence.length }));
  process.exitCode = 1;
}
