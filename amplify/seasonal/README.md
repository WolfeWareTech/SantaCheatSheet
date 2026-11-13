# Seasonal backend contract (P04)

The existing `SantasSheet` model, generated IDs, table and Cognito configuration
remain in place. Every generated legacy create/update/delete pipeline rejects at
its entry. Keep that guard in all rollbacks. Existing owners/admins can still read
legacy history. Do not deploy a schema that removes or renames the old model.

New records live in a retained sidecar table and have no generated CRUD,
subscriptions, import/export or maintenance bypass. All operations authenticate
with the existing user pool and return a checked `{ok,data}` / `{ok:false,error}`
envelope inside the GraphQL JSON result. Clients must check GraphQL `errors`,
parse a JSON string if their client returns one, and check `ok` before success.
No event, SDK error, subject, answer or credential is logged.

* `seasonState({year})` reads explicit server configuration. Launch year is 2026;
  its initial state is open (revision 0, no deadline). No device-clock routing.
  2025 always reports closed; unknown years fail closed.
* `seasonSheet({year,subject?})` is read-only: it never creates a response. Omit
  subject for My sheet. An admin may select another subject only for submitted
  responses or legacy 2025. Draft answers remain private even to administrators.
  Legacy lookup matches stable subject, not name/email, rejects ambiguous rows,
  returns the unchanged row as `legacy` with `state:legacy_saved,submittedAt:null`.
* `ensureSeasonSheet({year})` derives identity from the token. A conditional
  transaction makes one subject/year record and progress metadata atomically.
  Every answer starts as an empty string/array; retry resumes the existing record.
  `participantId` is currently the existing subject; future directory linking must
  preserve that binding without matching untrusted email or phone.
  Presentation names come from the separate account/directory profile; this API
  does not treat a display name or email as an answer or ownership key.
* `saveSeasonSheet({year,answers,expectedRevision,intent,idempotencyKey})` accepts
  exactly the answer keys in `service.ts`, a server revision, `save_draft|submit`,
  and an 8–128 character request ID. Reuse the same ID and payload after uncertain
  persistence. The most recent successful request is replayable; a later save
  makes an older retry a conflict. Revisions and the open-season configuration are
  checked in the same database transaction. Submission is retained on later edits;
  server timestamps supply `savedAt`, original `submittedAt` and `revisedAt`.
* `seasonProgress({year,nextToken?})` is admin-only and paginated. Its distinct
  partition contains only participant/year/state/timestamps/revision, no answers.
  No row means not started. Blank initialized rows are draft with `savedAt:null`.
* `configureSeason({year,state,expectedRevision,deadline?})` is admin-only. It
  opens/closes a nonlegacy year with a revision check. Deadlines are descriptive,
  optional and do not auto-close. It cannot make 2025 writable. Annual active-year
  selection remains the later admin phase; the first release routes to 2026.

Run `node --import tsx --test amplify/seasonal/service.test.ts`,
`npx tsc --noEmit -p amplify`, build and lint. `implementation/migration/dry_run.py`
compares every fresh full typed legacy row and complete identity/admin records
with P00's DPAPI baseline. It emits only aggregates/digests and proposes zero
original/identity writes. There is deliberately no production migration apply.

## Rollback

Revert seasonal client use first, retaining the legacy write guard. Preserve the
existing table/pool and every seasonal table/record: table and logs have Retain.
Do not blindly revert this commit in production, since that would reopen legacy
writes. Use the supplied isolated rollback rehearsal to redeploy the same data
model with the seasonal resolver returning a safe maintenance error; verify old
updates still fail and stored hashes stay equal, then restore the normal resolver.
Cleanup of retained sandbox tables/logs and synthetic pool belongs to a later
explicit cleanup lease; production additive resources must never be deleted as
an automatic rollback.

Current references: [custom data sources](https://docs.amplify.aws/react/build-a-backend/data/custom-business-logic/),
[DynamoDB transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html),
[Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html).
