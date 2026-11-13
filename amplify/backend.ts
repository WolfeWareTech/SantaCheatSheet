import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { Stack } from 'aws-cdk-lib';
import { seasonalResources } from './seasonal/resources';
import { CfnFunction } from 'aws-cdk-lib/aws-lambda';

const backend = defineBackend({
  auth,
  data,
});

const seasonal = seasonalResources(Stack.of(backend.data.resources.graphqlApi), backend.data.resources.tables['SantasSheet']);
backend.data.addLambdaDataSource('seasonalBackend', seasonal.handler);

// Preserve the generated model/table and client operation names. A fail-closed
// pipeline entry rejects even an old client before any generated mutation runs.
const legacyMutations = new Set(['createSantasSheet', 'updateSantasSheet', 'deleteSantasSheet']);
let guarded = 0;
for (const resolver of Object.values(backend.data.resources.cfnResources.cfnResolvers)) {
  if (resolver.typeName === 'Mutation' && legacyMutations.has(resolver.fieldName)) {
    resolver.requestMappingTemplate = '$util.error("Legacy history is read-only", "FORBIDDEN")';
    guarded++;
  }
}
if (guarded !== 3) throw new Error('All legacy mutation boundaries must be guarded');

// The pinned Amplify/CDK version emits Node 18 table-manager framework
// providers. Keep their code/identity intact while using a supported runtime.
for (const node of Stack.of(backend.data.resources.graphqlApi).node.findAll()) {
  if (node instanceof CfnFunction && node.runtime === 'nodejs18.x') node.runtime = 'nodejs22.x';
}
