# P05 focused seasonal checks

Synthetic fixtures only: no AWS configuration, credentials, live reads/writes,
real users, messages or resets. The existing P02 esbuild/jsdom harness is reused;
no package or lockfile changes. The P05 App/SheetEditor cases supersede the P02
UI cases for legacy list-order/device-year creation and generated-model saves.
The P02 API/persistence/import tests and P04 authorization tests remain applicable.

From the repository root, after `npm ci --no-audit --no-fund`:

```powershell
npm install --prefix node_modules/.p05-test-tools --no-save --package-lock=false --no-audit --no-fund jsdom@24.1.3
$env:P02_JSDOM = (Resolve-Path node_modules/.p05-test-tools/node_modules/jsdom/lib/api.js).Path
node_modules/.bin/esbuild src/features/sheets/tests/seasonal.test.tsx --bundle --platform=node --format=esm --packages=external --jsx=automatic --alias:aws-amplify/data=./src/features/sheets/tests/mockSeasonClient.ts --alias:aws-amplify/auth=./src/features/sheets/tests/mockSeasonClient.ts --alias:@aws-amplify/ui-react=./src/features/sheets/tests/mockSeasonClient.ts --outfile=node_modules/.cache/p05-seasonal-tests.mjs
node --import ./tests/api-results/setup-dom.mjs --test node_modules/.cache/p05-seasonal-tests.mjs
node --import tsx --test amplify/seasonal/service.test.ts tests/api-results/apiResults.test.ts
npm run build
npm run lint
```

A local ignored `amplify_outputs.json` containing `{}` is sufficient for a
compile-only build. A release must use its own actual Amplify outputs, preserving
the accepted P04 backend. No deployment or physical-device verification is claimed.

The route defaults explicitly to `#/sheets/2026`; history is
`#/sheets/2025[/<encoded stable subject>]`. Server authorization remains decisive.
R01 (owner decision, November 13, 2026): history controls and these direct history
routes require the existing Cognito `admin` group, bound to the authenticated
subject. Ordinary owners stay on their 2026 sheet without requesting history.
Historical owner reads are denied server-side too. Admin own/other history stays
read-only. Tests cover the retired email allowlist granting no privileges,
missing/malformed/mismatched group claims, and forged own/other historical routes.
The owner's follow-up also restricts Share and Copy link to admins. Ordinary
users have neither sharing control, including through forged historical routes;
admin-claim changes never remount or clear the current unsaved draft.
Display names are separate profile presentation, never saved in seasonal answers.
Uncertain writes reuse the original request ID, revision and payload before later
edits are saved. Stale-tab conflicts retain the local edits for manual review.

Rollback is frontend-only: revert this commit while retaining P04's storage and
legacy write guard. Such a rollback temporarily removes this seasonal UI; never
clear seasonal/legacy rows or reopen historical writes to restore editing.
