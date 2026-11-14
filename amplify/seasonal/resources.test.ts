import test from 'node:test';
import assert from 'node:assert/strict';
import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { seasonalResources } from './resources';
test('annual controls reuse the retained seasonal table and read-only legacy access; no pool or messaging authority', () => {
  const app = new App({ outdir: 'node_modules/.cache/p09-cdk' });
  const stack = new Stack(app, 'SyntheticAnnualSeason', { env: { account: '111111111111', region: 'us-east-2' } });
  const legacy = Table.fromTableArn(stack, 'Legacy', 'arn:aws:dynamodb:us-east-2:111111111111:table/SyntheticLegacy');
  seasonalResources(stack, legacy);
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::DynamoDB::Table', 1);
  template.hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: Match.objectLike({
    BillingMode: 'PAY_PER_REQUEST', PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
  }) });
  template.hasResourceProperties('AWS::Lambda::Function', { Runtime: 'nodejs22.x', Environment: { Variables: Match.objectLike({ LEGACY_TABLE: 'SyntheticLegacy' }) } });
  const policies = template.findResources('AWS::IAM::Policy');
  const statements = Object.values(policies).flatMap(p => p.Properties.PolicyDocument.Statement);
  const data = statements.filter(s => JSON.stringify(s.Action).includes('dynamodb:'));
  assert.equal(data.length, 2);
  assert.deepEqual(data.find(s => s.Resource === 'arn:aws:dynamodb:us-east-2:111111111111:table/SyntheticLegacy')?.Action, 'dynamodb:Scan');
  assert.ok(!/cognito|ses:|sns:/.test(JSON.stringify(statements)));
});
