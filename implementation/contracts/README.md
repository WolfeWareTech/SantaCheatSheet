# Implementation contract v1 — P00

Authority: orchestration/SCOPE.md; coordinator acceptance is separate from worker readiness.
Selected application baseline: `17fce432369c5405d3b5e72eaf0d5054c27cdd6a` on canonical `main`.
This contract describes required future behavior, not features already deployed. Types in
`interfaces.ts` are logical boundaries, not authorization or permission to replace live models.

## Seasons and preservation

- Explicit active launch season 2026. Never derive it from a participant device clock. Admins open/close seasons; deadlines are optional and do not silently close a season.
- Keep the existing SantasSheet model, primary keys, pool and subjects. All original 2025 fields, owners, IDs, timestamps and answers remain byte-equivalent in the typed-value comparison. Additive migration must not rewrite legacy rows merely to attach status.
- Resolve one participant/season response on the server with retry/concurrency-safe uniqueness. Existing rows have deterministic mappings; ambiguity fails closed for review. Never select the first arbitrary row.
- New-season answer fields start empty: empty strings/arrays as appropriate, with no history copy or prefill action. Profile identity/display name is separate from answer fields. Same-season return resolves saved draft/submitted work and never reinitializes it.
- 2025 is `legacy_saved`, without fabricated submittedAt. History/closed seasons are server read-only, including requests from old clients. Opening a year does not make legacy history writable.
- Open-season edits after submission retain `submitted`, preserve the original submittedAt and set revisedAt only after a successful change. Saving a draft cannot demote an already submitted response. Closing the season rejects edits.
- Use server timestamps and optimistic revision checks. Conflict preserves local content and requires explicit reconciliation; subscription/identity refresh must not silently erase drafts.

## Identity, participation and authorization

- Participant ID is stable and independent of email/phone. A registered participant binds to the existing Cognito subject only through verified backend mapping. Unregistered directory entries have no subject until an explicit secure linking flow completes.
- Preserve the existing administrator set. Backend-verified Cognito `admin` group is authoritative; never trust an email allowlist, editable attribute, request flag or frontend route for privileges.
- Owners read/write only their own current/open-season responses. Owner/subject/year bindings cannot be reassigned through ordinary writes. Regular users cannot enumerate directory contacts, read another owner's response or invoke admin operations.
- Owner decision (November 13, 2026): previous-year sheets, including all 2025 legacy/saved history, are visible only to existing backend-verified `admin` group members, including the admin's own history and other participants' history. Ordinary owners cannot read even their own previous-year sheet through UI, routes, direct get/list/query, exports or subscriptions. Preserve every original historical model field, owner, ID, date and answer; all legacy writes remain denied. This supersedes the earlier owner-readable history default.
- Current-year submitted answers retain owner/admin visibility. New drafts remain owner-private. Admins receive only progress metadata (participant/year/status/times), not draft answers through lists, get, subscriptions, exports, logs or maintenance shortcuts. Field hiding in a component is insufficient; use a distinct metadata boundary or equivalent backend enforcement.
- Admins retain My sheet as the owner. No family-wide answer sharing. Admin progress metadata never includes a sample answer, and contact records are admin-only. Public season landing data contains only year/open state/optional deadline and welcome text.
- Annual participation is separate from directory membership: active/excluded, archived and channel opt-out flags drive recipient eligibility. Directory seeding does not authorize sending and does not invent recipients.

## Invitations and phone sharing

- Invitations guide authenticated identity/year resolution; they do not grant answer access. Personal links use opaque revocable credentials with expiry; persist a verifier, not the bearer token. No raw email, phone, password or subject in URLs/logs. Forwarded links cannot bypass ownership, and mismatched sessions offer explicit account switching.
- Link/scanner GET has no sheet-create, progress-start, reset-code, enrollment or send side effect. Retain intended year through sign-in/recovery without persisting invitation credentials in logs.
- Admin preview is required before explicit batch send. Per-recipient/idempotency keys bind season, participant, purpose and approved batch. Retry must not duplicate delivery; persist accepted/failed outcomes honestly. Reminders exclude submitted, excluded, archived and opted-out participants.
- Provider accepted != delivered; delivered != submitted. Native share/composer opened/cancelled and manually reported sent remain separate from provider delivery.
- Phone sharing is manual: wife chooses contacts/reviews/sends in native Messages/share UI. Provide Copy link; no full address-book upload, phone-only identity inference or automatic SMS product. General season links support multiple recipients; personal links are shared individually.
- Owner follow-up (November 13, 2026): Share and Copy link controls are exposed only to existing authenticated `admin` group members. Ordinary participants have their current-year private sheet without previous-year history or sharing/copy-link controls. This grants no new administrator memberships.
- Mock send/recovery transports and synthetic identities only until an exact real destination is expressly authorized. Deployment/directory seed never sends invitations.

## Result/error boundary

- Every create/update/get/list/import/export checks both resolved `errors` and required returned data. A thrown exception is only one failure form. Empty list is valid; missing list data or incomplete pagination is not a successful export.
- A mutation succeeds only after confirmed persistence of the requested record/revision. Mixed data+errors is failure/partial, never an unconditional Saved/Imported message. Per-record imports report confirmed counts and failures.
- Error codes in `interfaces.ts` are application classifications. Do not expose raw upstream messages containing private payloads; retain drafts and enable retry. Retryable errors never imply automatic retry of a non-idempotent send.
- Distinguish session expiry, forbidden, validation, missing data, network, conflict, rate limit and provider failure. Recovery UI preserves generic account-existence messaging.

## Required evidence for later phases

P01: protected full backup and independent restore/all-field comparison before any app cloud mutation.
P03/P04/P06: backend denial for regular-user admin operations, cross-owner reads/writes, forged owner/group fields, draft answer exposure and legacy updates; use synthetic isolated identities.
P04/P05: retry/two-tab creation, blank answers and same-year resume. P02: resolved errors/missing data.
P16/P17: conflicts, submission/revision and privacy boundaries. Delivery and physical-phone tests remain separate evidence.
Contract changes require coordinator review and explicit reporting; no worker may silently loosen these boundaries.

## Baseline and private evidence

Sanitized observation: `orchestration/results/P00/01/baseline.json`.
Resolved targets: `implementation/private/P00/01/resources.json` (local, never commit).
Full original typed rows, subjects and admin mapping: `baseline.dpapi` beside the manifest,
encrypted by Windows DPAPI for the current Windows user. This is a comparison observation,
not P01's protected, portable recovery artifact. No credentials are included.
The historical review saved projected aggregates, so original historical all-field equality is
not retroactively provable. Compare its 11-row/year/owner/date aggregates now; anchor all later
field-preservation checks in the fresh full observation. Never substitute a row count for equality.
