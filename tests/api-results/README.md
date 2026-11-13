# P02 focused checks

All records, sessions and transports in these tests are synthetic. No Amplify
configuration, AWS credentials, live endpoints, sends or reset codes are used.

Use the checked-in dependency lock with `npm ci --no-audit --no-fund`.

Boundary/pagination/persistence/import fixtures:

```powershell
node --import tsx --test tests/api-results/apiResults.test.ts
```

The DOM suite uses a separately installed test-only jsdom (no package/lock changes).
Set `P02_JSDOM` to its absolute `node_modules/jsdom/lib/api.js` path. P02 used
jsdom 24.1.3 with Node 22.11.0. Install it in an ignored/local tools directory:

```powershell
npm install --prefix node_modules/.p02-test-tools --no-save --package-lock=false jsdom@24.1.3
$env:P02_JSDOM = (Resolve-Path node_modules/.p02-test-tools/node_modules/jsdom/lib/api.js).Path
node_modules/.bin/esbuild tests/api-results/ui.test.tsx --bundle --platform=node --format=esm --packages=external --jsx=automatic --alias:aws-amplify/data=./tests/api-results/mockClient.ts --alias:aws-amplify/auth=./tests/api-results/mockAuth.ts --alias:@aws-amplify/ui-react=./tests/api-results/mockAuth.ts --outfile=node_modules/.cache/api-results-ui-tests.mjs
node --import ./tests/api-results/setup-dom.mjs --test node_modules/.cache/api-results-ui-tests.mjs
npm run build
npm run lint
```

Build needs an ignored `amplify_outputs.json`. P02 used `{}` as a compile-only
fixture, never a runnable production configuration. No sandbox was deployed.

Changed call sites: App initial/live list refresh and create; SheetEditor save;
AdminSheetsPanel paginated list/retry; DataManagementPanel export/import/retry.
`apiResults.ts` rejects any nonempty upstream errors and missing required data,
checks record ID/requested fields and validates every list page. Successful null
get is the sole intentional absence boundary. All displayed failures are bounded
messages, without raw upstream payloads. Retry is user initiated.

Creation keeps an ID in memory and reconciles it before retrying. Imports keep
row IDs/outcomes and skip confirmed rows, including reselecting the same JSON in
the current panel. An existing different record is a conflict, never overwritten.
Keep the page open for safe retry of ID-less imports; reload is not a persisted
import journal. Future participant/year server uniqueness is outside P02.
