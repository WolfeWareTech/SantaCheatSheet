# Release and rollback boundary

This additive feature attaches `directoryBackend` to the existing AppSync API and creates
only `PrivateDirectory`, `DirectoryService`, and its retained log group/role. Regional
resources are restricted to us-east-2. Handler permissions are only GetItem/PutItem on
this directory table plus logging. No existing table or user pool is passed to the module.
No seed custom resource, startup import, schedule, campaign, invitation or reset is created.

Before release, the exclusive operator must inspect the complete synthesized diff for
unchanged existing pool, subjects, legacy model, guards and seasonal storage. Then prove
ordinary-user API denial/admin operations with synthetic isolated records. No cloud
validation or production data mutation was performed by this feature worker.

The seed dry-run is prepared by `orchestration/results/P08/01/prepare-seed.ps1` outside
this application Git tree. It reads the accepted R01 encrypted identity observation;
its manifest binds source and seed ciphertext hashes and observation time. The encrypted
document contains names/subject mappings/contact fields and immutable provenance only;
no answers, passwords or tokens. Source verification is an observation, not perpetual
identity freshness. Before any separately leased seed, compare fresh verified identity
attributes/subjects and the owner-authorized two-admin snapshot, review in a private local
process, and leave every candidate excluded/pending/unknown until explicit admin review.
Never print decrypted seed or put plaintext in Git, chat, logs or the vault.

The seed document has revision 1 and `contacts`. An operator would store it only in the
new directory table as `pk.S=DIRECTORY`, `revision.N=1`, `document.S=<private JSON>`,
conditional on `attribute_not_exists(pk)`, after exact target/lease/recovery gates. There
is deliberately no production importer or command in this phase. Existing nonempty
directory data must never be overwritten with this seed. No recipient/send approval is
implied by seed preparation or installation.

Rollback: revert the module mount/API additions and this code while retaining additive
directory data/table/logs for recovery. Do not remove Cognito users, rewrite mappings,
alter sheet ownership or delete any original/seasonal rows. Retain the current legacy
write/history guards and existing current-year sheet access.

Implementation follows the existing custom Lambda data-source pattern and
[Amplify custom operations](https://docs.amplify.aws/react/build-a-backend/data/custom-business-logic/)
and [authorization rules](https://docs.amplify.aws/react/build-a-backend/data/customize-authz/).
