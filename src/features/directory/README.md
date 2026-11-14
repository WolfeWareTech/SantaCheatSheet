# P08 private directory

The exported `DirectoryPanel` and `createDirectoryApi()` are the admin module entry points.
The integrator mounts the panel in the existing admin surface with `isAdmin` from the
existing verified, subject-bound session role and `sessionKey` equal to the signed-in
subject (change the key on account changes). Memoize the API per session after existing
Amplify configuration. P08's lease excludes App/main; this commit intentionally supplies
the module without changing shell navigation. No auth/hero/answers module changes.

Backend access is decisive: all three operations require `admin` in the schema and the
service independently checks subject/group claims before storage. No generated directory
model, public queries, subscriptions, contact logs, export or answer fields exist.

`amplify/directory/contract.ts` is the directory v1 boundary. Directory ID is independent
of the immutable Cognito subject; existing response keys continue to use their existing
subjects. `registeredEmail`, subject, mapping and source provenance cannot be changed by
directory mutations. A contact-email correction never changes a sign-in email or merges
identities. An email mismatch blocks personalized eligibility until a separately authorized
verified identity workflow resolves it. This phase has no linking/enrollment operation.

An invitee starts directory-only, excluded, unknown participation and pending review.
Admin edits can explicitly review and approve participation. Preview distinguishes verified
accounts, approved current recipients and personalized eligibility. Unregistered/unresolved
records cannot receive personalized links; duplicate name, email, phone or subject blocks
personalized eligibility for all affected entries, including archived duplicates. No merge
or arbitrary winner. Archive, exclusion, opt-outs and unknown participation only affect
campaign eligibility; they never lock out a current sheet. No sending operation exists.

The separate encrypted retained table stores one bounded directory snapshot (200 contacts,
280 KB document limit). A whole-directory conditional revision serializes edits and keeps
duplicate checks complete, including concurrent edits; list cannot silently truncate.
Conflicts preserve the local form. Backend returns confirmed persistence only; client
rejects upstream errors, malformed envelopes and wrong revision/contact confirmations.

Run from repo root:

```powershell
node --import tsx --test amplify/directory/service.test.ts amplify/directory/resources.test.ts
npm install --prefix node_modules/.p08-test-tools --no-save --package-lock=false --no-audit --no-fund jsdom@24.1.3
$env:P02_JSDOM=(Resolve-Path node_modules/.p08-test-tools/node_modules/jsdom/lib/api.js).Path
node_modules/.bin/esbuild src/features/directory/directory.test.tsx --bundle --platform=node --format=esm --packages=external --jsx=automatic --outfile=node_modules/.cache/p08-directory-ui.mjs
node --import ./tests/api-results/setup-dom.mjs --test node_modules/.cache/p08-directory-ui.mjs
npm run build
npm run lint
node_modules/.bin/tsc --noEmit -p amplify/tsconfig.json
```

Build-only local outputs use `{}` as in predecessor checks. This is not deployment or
production API proof. Local tests and CDK synthesis use synthetic values and no cloud calls.
Real seed/provenance and release gates remain outside Git in the P08 result/private paths.


P09 adds optional per-contact `annualParticipation` observations for 2027..2100.
The original 2026 participation/exclusion/review and identity provenance are retained.
An absent future entry means unknown/excluded/pending; no approvals are copied.
`AnnualParticipationPanel` and `createParticipationApi()` are mounted from the annual
admin dashboard for its selected year, with the same verified subject/session gate.
A dedicated `directoryParticipation` mutation changes only that year's observation
and normal revision/update timestamps. Generic contact updates preserve all yearly
observations. `previewDirectory(snapshot, year)` evaluates the requested year; its
omitted-year default remains 2026 for predecessor compatibility. Sending for future
years is pending P13 and no personalized link or delivery is claimed here.
