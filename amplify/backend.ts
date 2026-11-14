import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { Stack } from 'aws-cdk-lib';
import { seasonalResources } from './seasonal/resources';
import { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { directoryResources } from './directory/resources';

const backend = defineBackend({
  auth,
  data,
});

const seasonal = seasonalResources(Stack.of(backend.data.resources.graphqlApi), backend.data.resources.tables['SantasSheet']);
backend.data.addLambdaDataSource('seasonalBackend', seasonal.handler);
const directory = directoryResources(Stack.of(backend.data.resources.graphqlApi));
backend.data.addLambdaDataSource('directoryBackend', directory.handler);

// Preserve the generated model/table and client operation names. A fail-closed
// pipeline entry rejects even an old client before any generated mutation runs.
const legacyMutations = new Set(['createSantasSheet', 'updateSantasSheet', 'deleteSantasSheet']);
let guarded = 0;
let guardedReads = 0;
let guardedSubscriptions = 0;
const historyAdminGuard = `#if($util.authType() != "User Pool Authorization")
  $util.unauthorized()
#end
#set($historyGroups = $util.defaultIfNull($ctx.identity.claims.get("cognito:groups"), []))
#if(!$util.isList($historyGroups))
  $util.unauthorized()
#end
#if(!$historyGroups.contains("admin"))
  $util.unauthorized()
#end
`;
for (const resolver of Object.values(backend.data.resources.cfnResources.cfnResolvers)) {
  if (resolver.typeName === 'Mutation' && legacyMutations.has(resolver.fieldName)) {
    resolver.requestMappingTemplate = '$util.error("Legacy history is read-only", "FORBIDDEN")';
    guarded++;
  }
  // Keep the original model/owner fields and generated pipelines intact. Deny
  // before their owner rules can admit historical reads, including subscriptions
  // and list-based exports from older clients. Claims come from AppSync's pool.
  if ((resolver.typeName === 'Query' || resolver.typeName === 'Subscription') &&
    resolver.fieldName.includes('SantasSheet')) {
    if (!resolver.requestMappingTemplate || resolver.requestMappingTemplateS3Location) {
      throw new Error('Legacy history guard requires an inline generated pipeline');
    }
    resolver.requestMappingTemplate = historyAdminGuard + resolver.requestMappingTemplate;
    if (resolver.typeName === 'Query') guardedReads++;
    else guardedSubscriptions++;
  }
}
if (guarded !== 3) throw new Error('All legacy mutation boundaries must be guarded');
if (guardedReads !== 2 || guardedSubscriptions !== 3) {
  throw new Error('Review every generated legacy read/subscription boundary');
}

// The pinned Amplify/CDK version emits Node 18 table-manager framework
// providers. Keep their code/identity intact while using a supported runtime.
for (const node of Stack.of(backend.data.resources.graphqlApi).node.findAll()) {
  if (node instanceof CfnFunction && node.runtime === 'nodejs18.x') node.runtime = 'nodejs22.x';
}
