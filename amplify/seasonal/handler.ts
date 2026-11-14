import { DynamoDBClient, GetItemCommand, QueryCommand, ScanCommand,
  TransactWriteItemsCommand, type AttributeValue, type TransactWriteItem } from '@aws-sdk/client-dynamodb';
import { service, Rejected, progressOf, LAUNCH_YEAR, legacySubject,
  type Event, type Store, type Sheet, type Season, type ActiveSeason } from './service';

const client = new DynamoDBClient({ region: process.env.AWS_REGION, maxAttempts: 3 });
const table = process.env.SEASON_TABLE!;
const key = (pk: string, sk: string) => ({ pk: { S: pk }, sk: { S: sk } });
const sheetKey = (subject: string, year: number) => key(`RESPONSE#${subject}`, `YEAR#${year}`);
const activeKey = () => key('CONFIG', 'ACTIVE');
const activeCheck = (active: ActiveSeason): TransactWriteItem => ({ ConditionCheck: { TableName: table, Key: activeKey(),
  ConditionExpression: active.revision === 0 ? 'attribute_not_exists(pk)' : 'revision = :revision',
  ...(active.revision === 0 ? {} : { ExpressionAttributeValues: { ':revision': { N: String(active.revision) } } }),
} });
const seasonKey = (year: number) => key('CONFIG', `YEAR#${year}`);
async function document<T>(Key: ReturnType<typeof key>): Promise<T | null> {
  const result = await client.send(new GetItemCommand({ TableName: table, Key, ConsistentRead: true }));
  return result.Item?.document?.S ? JSON.parse(result.Item.document.S) as T : null;
}
function seasonCheck(season: Season): TransactWriteItem {
  return { ConditionCheck: { TableName: table, Key: seasonKey(season.year),
    // Only the explicit launch year may use the unconfigured default. The revision
    // condition serializes edits with an admin closing/reopening the season.
    ConditionExpression: season.revision === 0 && season.year === LAUNCH_YEAR
      ? 'attribute_not_exists(pk)' : '#state = :open AND revision = :revision',
    ...(season.revision !== 0 || season.year !== LAUNCH_YEAR ? {
      ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: { ':open': { S: 'open' }, ':revision': { N: String(season.revision) } },
    } : {}),
  } };
}
async function write(sheet: Sheet, season: Season, active: ActiveSeason, expectedRevision?: number) {
  try {
    await client.send(new TransactWriteItemsCommand({ TransactItems: [activeCheck(active), seasonCheck(season),
      { Put: { TableName: table, Item: { ...sheetKey(sheet.ownerSubject, sheet.year),
        revision: { N: String(sheet.revision) }, document: { S: JSON.stringify(sheet) } },
      ConditionExpression: expectedRevision === undefined ? 'attribute_not_exists(pk)' : 'revision = :revision',
      ...(expectedRevision === undefined ? {} : { ExpressionAttributeValues: { ':revision': { N: String(expectedRevision) } } }),
      } },
      { Put: { TableName: table, Item: { ...key(`PROGRESS#${sheet.year}`, `SUBJECT#${sheet.ownerSubject}`),
        document: { S: JSON.stringify(progressOf(sheet)) } } } },
    ] }));
  } catch (error) {
    if (error instanceof Error && error.name === 'TransactionCanceledException') throw new Rejected('conflict');
    throw error;
  }
}
function fromAttribute(value: AttributeValue): unknown {
  if ('S' in value) return value.S;
  if ('N' in value) return Number(value.N);
  if ('BOOL' in value) return value.BOOL;
  if ('NULL' in value) return null;
  if (value.L) return value.L.map(fromAttribute);
  if (value.M) return Object.fromEntries(Object.entries(value.M).map(([k, v]) => [k, fromAttribute(v)]));
  if (value.SS) return value.SS;
  throw new Rejected('validation');
}
export const store: Store = {
  active: async () => await document<ActiveSeason>(activeKey()) ?? { activeYear: LAUNCH_YEAR, revision: 0 },
  async seasons() {
    const result: Season[] = []; let start: Record<string, AttributeValue> | undefined;
    do {
      const page = await client.send(new QueryCommand({ TableName: table, ConsistentRead: true,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': { S: 'CONFIG' }, ':prefix': { S: 'YEAR#' } }, ExclusiveStartKey: start }));
      result.push(...(page.Items ?? []).map(item => JSON.parse(item.document.S!) as Season)); start = page.LastEvaluatedKey;
    } while (start);
    return result;
  },
  async activate(next, expected, target, previous) {
    const check = (season: Season): TransactWriteItem => ({ ConditionCheck: { TableName: table, Key: seasonKey(season.year),
      ConditionExpression: 'revision = :revision AND #state = :state', ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: { ':revision': { N: String(season.revision) }, ':state': { S: season.state } } } });
    try {
      await client.send(new TransactWriteItemsCommand({ TransactItems: [
        { Put: { TableName: table, Item: { ...activeKey(), revision: { N: String(next.revision) }, document: { S: JSON.stringify(next) } },
          ConditionExpression: expected.revision === 0 ? 'attribute_not_exists(pk)' : 'revision = :revision',
          ...(expected.revision === 0 ? {} : { ExpressionAttributeValues: { ':revision': { N: String(expected.revision) } } }),
        } }, check(target), check(previous),
      ] }));
    } catch (error) {
      if (error instanceof Error && error.name === 'TransactionCanceledException') throw new Rejected('conflict');
      throw error;
    }
  },
  async legacyCount() {
    let count = 0; let start: Record<string, AttributeValue> | undefined;
    do {
      const page = await client.send(new ScanCommand({ TableName: process.env.LEGACY_TABLE!, ConsistentRead: true,
        Select: 'COUNT', FilterExpression: '#year = :year', ExpressionAttributeNames: { '#year': 'year' },
        ExpressionAttributeValues: { ':year': { N: '2025' } }, ExclusiveStartKey: start }));
      if (page.Count === undefined) throw new Rejected('missing_data');
      count += page.Count; start = page.LastEvaluatedKey;
    } while (start);
    return count;
  },
  season: year => document<Season>(seasonKey(year)),
  get: (subject, year) => document<Sheet>(sheetKey(subject, year)),
  async configure(season, expectedRevision, active) {
    // Serialize year settings with activation as well as other settings edits.
    // The implicit launch pointer is valid only while CONFIG/ACTIVE is absent.
    const implicit = active.revision === 0 && active.activeYear === LAUNCH_YEAR;
    try {
      await client.send(new TransactWriteItemsCommand({ TransactItems: [
        { ConditionCheck: { TableName: table, Key: activeKey(),
          ConditionExpression: implicit ? 'attribute_not_exists(pk)' : 'revision = :revision AND #document = :active',
          ...(implicit ? {} : { ExpressionAttributeNames: { '#document': 'document' },
            ExpressionAttributeValues: { ':revision': { N: String(active.revision) }, ':active': { S: JSON.stringify(active) } } }),
        } },
        { Put: { TableName: table, Item: { ...seasonKey(season.year),
          state: { S: season.state }, revision: { N: String(season.revision) }, document: { S: JSON.stringify(season) } },
          ConditionExpression: expectedRevision === 0 ? 'attribute_not_exists(pk)' : 'revision = :revision',
          ...(expectedRevision === 0 ? {} : { ExpressionAttributeValues: { ':revision': { N: String(expectedRevision) } } }),
        } },
      ] }));
    } catch (error) {
      if (error instanceof Error && error.name === 'TransactionCanceledException') throw new Rejected('conflict');
      throw error;
    }
  },
  create: (sheet, season, active) => write(sheet, season, active),
  save: (sheet, expectedRevision, season, active) => write(sheet, season, active, expectedRevision),
  async progress(year, token) {
    let start: Record<string, AttributeValue> | undefined;
    if (token) {
      try {
        start = JSON.parse(Buffer.from(token, 'base64url').toString());
        if (start?.pk?.S !== `PROGRESS#${year}` || typeof start?.sk?.S !== 'string') throw new Error();
      } catch { throw new Rejected('validation'); }
    }
    const result = await client.send(new QueryCommand({ TableName: table, ConsistentRead: true,
      KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': { S: `PROGRESS#${year}` } },
      Limit: 100, ExclusiveStartKey: start }));
    return { items: (result.Items ?? []).map(item => JSON.parse(item.document.S!)),
      nextToken: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url') : null };
  },
  async legacy(subject) {
    const rows: Record<string, unknown>[] = [];
    let start: Record<string, AttributeValue> | undefined;
    do {
      const result = await client.send(new ScanCommand({ TableName: process.env.LEGACY_TABLE!,
        ConsistentRead: true, ExclusiveStartKey: start,
        FilterExpression: '#year = :year AND (#owner = :subject OR begins_with(#owner, :prefix))',
        ExpressionAttributeNames: { '#year': 'year', '#owner': 'owner' },
        ExpressionAttributeValues: { ':year': { N: '2025' }, ':subject': { S: subject }, ':prefix': { S: `${subject}::` } },
      }));
      for (const row of result.Items ?? []) {
        const plain = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, fromAttribute(v)]));
        if (legacySubject(plain.owner) === subject) rows.push(plain);
      }
      start = result.LastEvaluatedKey;
    } while (start);
    return rows;
  },
};
export const handler = (event: Event) => process.env.SEASON_SERVICE_MAINTENANCE === 'true'
  ? Promise.resolve({ ok: false, error: { code: 'maintenance', safeMessage: 'Season service is temporarily unavailable.', retryable: true } })
  : service(store)(event);
