# Generic 2026 text draft and sharing

The R01 parent mounts these controls only for admins, for any admin subject/name.
`Text link` is the first action. On iPhone/iPad/iPadOS it uses
`sms:&body=<encoded generic link>`; on Android it uses
`sms:?body=<encoded generic link>`. Both deliberately leave the recipient empty.
The native app owns contact selection, editable body and the final human Send.
There is no provider call, contact API, send handler or delivery status. The
anchor's default action runs directly from the user's click; pending Share/Copy
blocks it. Returning/canceling does not remount or save the sheet editor.

Desktop/unknown platforms use explicit-click Copy instead of attempting a phone
handler (including desktop Macs). iPadOS's desktop-style Macintosh user agent is
recognized by more than one touch point. This is a best-effort platform hint,
not handler detection: mobile browsers can also block external schemes or omit
the body. Copy remains visible, and a Text click exposes the selectable link
with instructions for a missing handler/body. It never claims the app opened.

Primary platform guidance checked November 13, 2026:

- [Apple SMS links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/SMSLinks/SMSLinks.html)
  documents recipient-optional `sms:` opening Messages, but explicitly does not
  document body support. [Current Apple messaging guidance](https://developer.apple.com/documentation/messages/preparing-your-app-to-be-the-default-messaging-app)
  still excludes message text from its documented URL form.
- [Android common intents](https://developer.android.com/guide/components/intents-common#Messaging)
  documents SMS/SMSTO composition and native `sms_body` extras; it does not
  guarantee browser query handling. [RFC 5724](https://www.rfc-editor.org/rfc/rfc5724.html)
  defines percent-encoded `?body=` and user review, but its formal syntax requires
  recipients. The empty-recipient form is a platform extension.
- [Sendblue's own browser-link implementation guide](https://docs.sendblue.com/guides/imessage-link-button/)
  documents the iOS `&body=` versus Android `?body=` conventions and explicitly
  calls iOS prefill undocumented. We use only these URI conventions, no service
  integration or provider requests. Prefill is therefore best effort and remains
  a physical-device acceptance check, not a claim of Apple-guaranteed support.

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
