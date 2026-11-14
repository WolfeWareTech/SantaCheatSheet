# P09 annual administration

`AnnualAdmin` is mounted only after App verifies access-token `sub` against the current
signed-in subject and finds the existing `admin` group. The directory API and annual API
are memoized per subject. Keyed panels, role gates and cancelled read effects clear
private state on logout/account switches. Existing festive auth, family/Santa hero,
editor and native Text/Share/Copy source modules are unchanged. The accepted 2026
native draft controls remain available to every verified admin. Future campaign/link
work is not simulated.

The dashboard initially selects the backend active year; no device year is used.
Viewing a different year is a read. To prepare an unconfigured year, start it closed,
then explicitly open it. To advance the active season, close the current year, select
and open the new year, then confirm activation. Activation is forward-only, requires
both observed season revisions/states plus active revision, and never copies answers
or creates sheet rows. Every settings/activation mutation requires a confirmation flag
and an existing trusted admin claim at the service as well as schema authorization.
Optional deadlines are UTC ISO instants; null means no deadline. The server rejects
writes at/after a deadline. Reopening a season retains its answers and deadline;
remove/update an elapsed deadline separately to allow edits again.

The existing retained seasonal table gets only an additive `CONFIG/ACTIVE` document
on activation. Absence means explicit launch year 2026, revision zero. Year config
keys, response keys, progress keys, legacy model and identities are retained. Sheet
transactions condition-check both active and season revisions. Old clients cannot
continue writing or reading former active years as ordinary users. All non-current
reads require admin; other people's draft answers remain inaccessible even to admins.
Admins can read their own historical drafts and other submitted historical sheets;
metadata progress contains no answers. Existing 2025 model read/write guards remain.

Authenticated landing reads active metadata and an existing sheet only. An explicit
“Start my blank YEAR sheet” mutation creates absent current-year answers blank.
Repeated access resumes existing answers. Closed current seasons read existing sheets
without ensure/create. My sheet remains available from the dashboard. General history
routes use `#/admin/history/YEAR[/subject]`; existing 2025 routes remain compatible.
Current unsaved work stays mounted across dashboard/history navigation in the session.

Totals consume complete paginated progress metadata, rejecting malformed/duplicate or
looping pages. They count available, confirmed-save and unsaved sheets, never claim
submissions. 2025 uses legacy saved count only (DynamoDB COUNT, no answer return).
Directory participation is separately selected by year, active and neither archived
nor excluded; missing historical observations or failed loads say Unknown. Future
years have independent participation records and never inherit prior approvals. Failed refreshes remove stale
totals/controls. Refresh after editing the directory. P08's seed remains unapplied,
excluded/unknown/pending with zero approved recipients.

## Release verification and rollback

These are local synthetic checks, not deployed or phone verification. The release
operator must inspect the complete synthesized diff, verify unchanged tables/pool/IDs
and legacy guards, then test ordinary/admin APIs using isolated synthetic identities
and rows. Verify active-state/configuration/activation conflicts, old-year denial,
closed/deadline guards, blank creation and same-season resume on deployed endpoints.
Never test by reading/logging existing 2026 drafts, sending messages or seeding real
recipients. Phone Text/Share/Copy acceptance remains the predecessor's external check.

For UI rollback, remove the annual dashboard mount and route verified admins to
My sheet (`#/sheets/2026` remains a compatible current-sheet entry; its actual year
is discovered from the backend). Retain the dynamic current-year consumer and backend
active/history/write guards after any activation. Do not roll back to fixed-2026
backend code, reset CONFIG/ACTIVE, reopen an old active year, delete metadata/rows,
replace tables/pool or clear saved work as a UI rollback.

## Per-year directory compatibility

The directory v1 document accepts an optional `annualParticipation` map on each contact,
keyed by 2027..2100. Old documents and the unapplied P08 seed are valid unchanged.
Each stored observation has state, exclusion, review and timestamp. Missing entries
mean unknown/excluded/pending, with no mutation on read. Original 2026 fields and
identity/source provenance remain unchanged by the new admin-only
`directoryParticipation` mutation. It conditionally writes the same bounded snapshot;
other years remain intact. Generic contact edits retain the map, global archive and
channel opt-outs continue to apply, and duplicate/identity-mismatch checks still fail
closed. Annual totals and previews use the explicitly selected membership year.

The future-year panel manages participation only; it cannot create an account, change
subjects, send invitations or manufacture delivery. Its saves update dashboard counts.
2026 membership remains editable in the accepted private directory form. Future-year
native sharing/personalized delivery remains explicitly pending P13 integration.
Retain the optional map and its handler validation when rolling back annual UI;
do not replay an older directory snapshot over newer yearly observations.
