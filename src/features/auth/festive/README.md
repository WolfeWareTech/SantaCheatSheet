# Festive sign-in

`FestiveAuthenticator` adds scoped presentation and supported Header/Footer slots
to the existing Amplify Authenticator. The entry point still passes its original
signup fields; all forms, validation, recovery, sessions and children stay with
Amplify. No provider configuration, identities, authorization or sheet state changes.

The wrapper subscribes before sign-in, outside the authenticated children. Only
Amplify's fresh `signedIn` event starts a 2.8-second, nonblocking celebration.
Duplicate events during the celebration do not restart its timer. Later fresh
sign-in events can celebrate again, including reauthentication after expiry.
Reload/session restoration and token refresh do not start it. Unmount/sign-out
cancel the timer; unmount also removes the event listener.
Reduced motion shows the same short welcome with stationary artwork. Nothing
captures focus or pointer input, and no audio or storage is used.

Synthetic checks (test tools installed locally under ignored node_modules only):

```powershell
$env:P02_JSDOM = (Resolve-Path node_modules/.r02-test-tools/node_modules/jsdom/lib/api.js).Path
node_modules/.bin/esbuild src/features/auth/festive/tests/festive.test.tsx --bundle --platform=node --format=esm --packages=external --jsx=automatic --loader:.css=empty --alias:@aws-amplify/ui-react=./src/features/auth/festive/tests/mockAuth.tsx --alias:aws-amplify/utils=./src/features/auth/festive/tests/mockHub.ts --outfile=node_modules/.cache/r02-festive-tests.mjs
node --import ./tests/api-results/setup-dom.mjs --test node_modules/.cache/r02-festive-tests.mjs
```

Run the existing seasonal/native-share/season-service regressions, build and lint.
Use fake auth configuration and blocked external network for visual previews;
never use real credentials, submit signup or request password reset codes.

Official interfaces: [Authenticator customization](https://ui.docs.amplify.aws/react/connected-components/authenticator/customization),
[auth events](https://docs.amplify.aws/react/frontend/auth/listen-to-auth-events/).
Rollback: revert the frontend commit, preserving all data and identities.
