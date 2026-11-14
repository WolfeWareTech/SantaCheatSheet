import test from 'node:test';
import assert from 'node:assert/strict';
import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { directoryResources } from './resources';
test('local synthesis retains encrypted directory and limits handler to its own table, without identity/answer/send access', () => {
  const app = new App({ outdir: 'node_modules/.cache/p08-cdk' });
  const stack = new Stack(app, 'SyntheticDirectory', { env: { account: '111111111111', region: 'us-east-2' } });
  directoryResources(stack);
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::DynamoDB::Table', 1);
  template.hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain',
    Properties: Match.objectLike({ BillingMode: 'PAY_PER_REQUEST', SSESpecification: { SSEEnabled: true },
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true } }) });
  template.hasResourceProperties('AWS::Lambda::Function', { Runtime: 'nodejs22.x',
    Environment: { Variables: { DIRECTORY_TABLE: Match.anyValue() } } });
  const policies = template.findResources('AWS::IAM::Policy');
  const statements = Object.values(policies).flatMap(p => p.Properties.PolicyDocument.Statement);
  const data = statements.filter(s => JSON.stringify(s.Action).includes('dynamodb:'));
  assert.equal(data.length, 1); assert.deepEqual(data[0].Action, ['dynamodb:GetItem', 'dynamodb:PutItem']);
  assert.ok(JSON.stringify(data[0].Resource).includes('PrivateDirectory'));
  assert.ok(!/cognito|ses:|sns:|SantasSheet|SeasonalResponses/.test(JSON.stringify(statements)));
});
