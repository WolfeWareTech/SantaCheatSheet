import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table, type ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Runtime, RuntimeFamily } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export function seasonalResources(scope: Construct, legacy: ITable) {
  const table = new Table(scope, 'SeasonalResponses', {
    partitionKey: { name: 'pk', type: AttributeType.STRING }, sortKey: { name: 'sk', type: AttributeType.STRING },
    billingMode: BillingMode.PAY_PER_REQUEST, pointInTimeRecovery: true, removalPolicy: RemovalPolicy.RETAIN,
  });
  const logs = new LogGroup(scope, 'SeasonServiceLogs', {
    retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.RETAIN,
  });
  const handler = new NodejsFunction(scope, 'SeasonService', {
    entry: fileURLToPath(new URL('./handler.ts', import.meta.url)), handler: 'handler',
    runtime: new Runtime('nodejs22.x', RuntimeFamily.NODEJS), timeout: Duration.seconds(20), memorySize: 256,
    logGroup: logs,
    environment: { SEASON_TABLE: table.tableName, LEGACY_TABLE: legacy.tableName,
      SEASON_SERVICE_MAINTENANCE: scope.node.tryGetContext('p04Maintenance') === 'true' ? 'true' : 'false' },
    // Bundle the locked SDK, rather than relying on the Lambda runtime's copy.
    bundling: { externalModules: [], minify: true, sourceMap: false, target: 'node22' },
  });
  handler.addToRolePolicy(new PolicyStatement({ actions: ['dynamodb:GetItem', 'dynamodb:PutItem',
    'dynamodb:Query', 'dynamodb:ConditionCheckItem'], resources: [table.tableArn] }));
  handler.addToRolePolicy(new PolicyStatement({ actions: ['dynamodb:Scan'], resources: [legacy.tableArn] }));
  if (Stack.of(scope).region !== 'us-east-2' && !Stack.of(scope).region.includes('Token')) {
    throw new Error('Seasonal backend must remain in us-east-2');
  }
  return { table, handler };
}
