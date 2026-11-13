# P01-01 recovery drill

This attempt starts at integration commit `83f327c5b16f46bf9d04161917a65089def8a39d`.
Run the bounded collector from the review workspace root, using its absolute
path if necessary. It checks the active P01-01 lease before every write and uses
only profile `mcp-wwrs-deploy` and selected Region `us-east-2`.

`p01.py prepare` decrypts and verifies the accepted P00 observation, performs
unprojected strongly consistent paginated reads, and saves a fresh encrypted
preflight. `protect` requests the full DynamoDB on-demand backup
`SantaCheatSheet-P01-01`, enables 35-day PITR, and retains/enables production
deletion protection. `restore` requires that backup to be AVAILABLE and restores
all indexes into the new `SantaCheatSheet-P01-01-restore` table. `verify` requires
ACTIVE, no reported in-progress restore, and matching TableId/ARN to the saved
restore response before comparing every typed field, ID, owner,
timestamp and complete identity snapshot with P00, preflight, restored and live
observations. Stage outputs are immutable; do not rerun a successful mutation
stage. Poll status with read-only DescribeTable/DescribeBackup instead.

Sanitized attempt evidence belongs in `orchestration/results/P01/01` in the
review workspace. Full rows and identity attributes exist only in memory and
Windows DPAPI CurrentUser ciphertext under `implementation/private/P01/01`.
That directory has inheritance disabled and a current-user-only NTFS ACL. The
same Windows user/profile and its DPAPI master keys are required for local
decryption; preserving only ciphertext on a different computer is insufficient.
The service backup is the independent recovery source. Git excludes private
artifacts. No record values, user identifiers or per-row hashes are published.

## Recovery prerequisites and limits

Use an authorized SSO session and the exact source backup ARN from
`backup-available.json`. Permission is needed for DescribeBackup,
RestoreTableFromBackup, DescribeTable and Scan on the specific source/target;
any encryption-key permissions required by the source must remain usable. This
drill creates no IAM/KMS configuration. Restore to a unique unused name in
`us-east-2`, wait for ACTIVE and all original indexes, then run the full typed
comparison before considering a separately reviewed application cutover.
The completed DescribeTable response may omit its optional RestoreSummary;
the saved restore response proves the backup ARN, and the unchanged table ID
links that request to the ACTIVE table and its successfully scanned data.
Never restore over or delete the original table. Existing Cognito subjects are
preserved and observed, not re-created; Cognito passwords are not exported.

AWS restores data and indexes to a new table. Settings requiring separate
review include IAM/resource policies, alarms, tags, streams, TTL, auto scaling,
deletion protection and PITR. The isolated target has no application cutover or
consumers configured. This drill proves data recovery, not a deployed recovery
environment. See [AWS on-demand recovery guidance](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/CreateBackup.html)
and [PITR guidance](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Backup-and-Restore.html).

## Retention and rollback

Retain the full USER backup without expiration and keep production PITR enabled
with a rolling 35-day window. Retain the isolated restore for independent review
and owner-directed cleanup. These resources incur usage-based charges; no
fixed price or free-tier coverage is assumed. The plan API is unavailable for
this existing SSO project; no plan or spend setting was changed.

This scope has no DeleteBackup/DeleteTable or IAM authority. Production deletion
protection does not make backups immutable or prevent item writes. Backup access
uses existing project IAM; no new grants or public access were added. A future
cleanup needs owner direction and a new exact lease, must leave the original
table/identities and protected backup intact, and must not disable production
PITR/deletion protection. There is no production rollback for this drill: the
application still points at its original table. A failed restore leaves that
table and its backup intact and blocks the P01 acceptance gate.
