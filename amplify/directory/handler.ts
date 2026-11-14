import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { directoryService, type Store } from './service';
import { DirectoryRejected } from './contract';
const client = new DynamoDBClient({ region: process.env.AWS_REGION, maxAttempts: 3 });
const table = process.env.DIRECTORY_TABLE!;
const key = { pk: { S: 'DIRECTORY' } };
export const store: Store = {
  async read() {
    const result = await client.send(new GetItemCommand({ TableName: table, Key: key, ConsistentRead: true }));
    if (!result.Item) return { revision: 0, contacts: [] };
    if (!result.Item.document?.S) throw new DirectoryRejected('missing_data');
    try { return JSON.parse(result.Item.document.S); } catch { throw new DirectoryRejected('missing_data'); }
  },
  async write(next, expectedRevision) {
    try {
      await client.send(new PutItemCommand({ TableName: table, Item: { ...key,
        revision: { N: String(next.revision) }, document: { S: JSON.stringify(next) } },
      ConditionExpression: expectedRevision === 0 ? 'attribute_not_exists(pk)' : 'revision = :revision',
      ...(expectedRevision === 0 ? {} : { ExpressionAttributeValues: { ':revision': { N: String(expectedRevision) } } }),
      }));
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') throw new DirectoryRejected('conflict');
      throw error;
    }
  },
};
export const handler = directoryService(store);
