# Generic 2026 sharing

`NativeSeasonShare` is mounted beside the current sheet, outside its editor. It
never saves answers, changes routes, reads contacts or maps recipients. The URL
is current origin + pathname + `#/sheets/2026`; search and historical fragments
are discarded. The native phone interface owns contact selection, review and
Send. A fulfilled share promise is not a delivery receipt. Cancellation is
retryable; unsupported/failed share and clipboard calls expose a labeled,
read-only link that selects on focus. Errors never display raw exception text.

Styles are local to this control, wrap the buttons, constrain the input to its
container, and retain the existing green button treatment. Print/capture excludes
the control. Physical phone sharing/composer and narrow-screen layout still need
owner verification after an authorized release. This generic link is not a
personal invitation and grants no access by itself.

From the repository root with `npm ci` complete, reuse P05's already-installed
synthetic DOM (no new dependency or package changes):

```powershell
$env:P02_JSDOM = (Resolve-Path ../../P05-01/repo/node_modules/.p05-test-tools/node_modules/jsdom/lib/api.js).Path
node_modules/.bin/esbuild src/features/invitations/native-share/native-share.test.tsx --bundle --platform=node --format=esm --packages=external --jsx=automatic --loader:.css=empty --alias:aws-amplify/data=./src/features/sheets/tests/mockSeasonClient.ts --outfile=node_modules/.cache/p13-native-share-tests.mjs
node --import ./tests/api-results/setup-dom.mjs --test node_modules/.cache/p13-native-share-tests.mjs
node_modules/.bin/esbuild src/features/sheets/tests/seasonal.test.tsx --bundle --platform=node --format=esm --packages=external --jsx=automatic --loader:.css=empty --alias:aws-amplify/data=./src/features/sheets/tests/mockSeasonClient.ts --alias:aws-amplify/auth=./src/features/sheets/tests/mockSeasonClient.ts --alias:@aws-amplify/ui-react=./src/features/sheets/tests/mockSeasonClient.ts --outfile=node_modules/.cache/p13-seasonal-regression.mjs
node --import ./tests/api-results/setup-dom.mjs --test node_modules/.cache/p13-seasonal-regression.mjs
npm run build
npm run lint
```

For a compile-only build, ignored `amplify_outputs.json` may contain `{}`. Never
use this fixture for a release. The tests use only synthetic DOM/transport/share/
clipboard data; no real users or sends. Current API behavior follows the
[Web Share specification](https://www.w3.org/TR/web-share/): call from user
activation, treat `AbortError` as cancellation/no available target, and avoid
interpreting resolution as confirmed recipient delivery.

Rollback: revert this frontend commit only; retain all rows and identities.
Integration/release waits for P06 implementation acceptance under the release
operator's lease. Full P13 directory/personal invitation work remains separate.
