import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { Runtime, RuntimeFamily } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Grant } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
export function directoryResources(scope: Construct) {
  if (Stack.of(scope).region !== 'us-east-2' && !Stack.of(scope).region.includes('Token')) throw new Error('Directory must remain in us-east-2');
  const table = new Table(scope, 'PrivateDirectory', {
    partitionKey: { name: 'pk', type: AttributeType.STRING }, billingMode: BillingMode.PAY_PER_REQUEST,
    encryption: TableEncryption.AWS_MANAGED, pointInTimeRecovery: true, removalPolicy: RemovalPolicy.RETAIN,
  });
  const logs = new LogGroup(scope, 'DirectoryServiceLogs', { retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.RETAIN });
  const handler = new NodejsFunction(scope, 'DirectoryService', {
    entry: fileURLToPath(new URL('./handler.ts', import.meta.url)), handler: 'handler',
    runtime: new Runtime('nodejs22.x', RuntimeFamily.NODEJS), timeout: Duration.seconds(10), memorySize: 256,
    logGroup: logs, environment: { DIRECTORY_TABLE: table.tableName },
    bundling: { externalModules: [], minify: true, sourceMap: false, target: 'node22' },
  });
  // Only this new table; no Cognito, answer, campaign, delete or scan permissions.
  Grant.addToPrincipal({ grantee: handler, actions: ['dynamodb:GetItem', 'dynamodb:PutItem'], resourceArns: [table.tableArn] });
  return { table, handler };
}
