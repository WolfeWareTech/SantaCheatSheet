# Local setup and handoff

Canonical origin is `https://github.com/WolfeWareTech/SantaCheatSheet.git`.
Baseline rollback commit: `17fce432369c5405d3b5e72eaf0d5054c27cdd6a`.
P00 creates a full independent clone at `implementation/integration` on
`codex/integration` and a unique worker clone at `implementation/workspaces/P00-01/repo`
on `codex/p00-01`. Neither is production. Coordinator acceptance/cherry-pick is separate.

Future workers clone the integration repository using `git clone --no-hardlinks`, set
origin to the canonical remote, pin the coordinator's accepted SHA and create a
`codex/<phase>-<attempt>` branch. Verify no alternates, clean status, origin and exact
base before edits. Never fetch into or edit source/. Never push worker changes to main;
Amplify main has automatic builds enabled. The coordinator owns integration writes.

Before each mutation/resume, reread REGISTRY.json and verify exact active phase/attempt,
chat ID, path scopes and cloud target lease. A checkout path never grants cloud authority.
P00 scripts are fixed to attempt 01 and must not be rerun under a later worker lease.
Use new output paths for every attempt; never rerun the dated review collector unchanged.

## Output boundaries

The review root ignores implementation/. Every app clone ignores node_modules, dist,
generated Amplify outputs/config, .amplify, private/, implementation/private/ and .env*.
Keep raw logs, backups, contacts, subjects, answers and invitation credentials out of Git
and Obsidian. Git ignores prevent accidental additions, not a security boundary; inspect
the staged diff before each commit. Never copy the production API key into tracked files.

Resolved resource manifest is `implementation/private/P00/01/resources.json` in the
review workspace. All Regional targets are us-east-2; profile mcp-wwrs-deploy retains
existing Identity Center SSO. Catalog endpoint is us-east-1. Guidance preference LOW,
recorded from the owner's P00 reply. GetAccountPlanState returns ResourceNotFoundException
for this existing project; plan type remains unverified, without blocking read-only baseline.

Run setup scripts from the review workspace root, or set SANTA_REVIEW_ROOT to that
absolute directory; committed copies are provenance, not permission to rerun an attempt.
`collect_p00.py` calls only an explicit read-operation allowlist. It performs full
strongly consistent paginated table reads, directory reads and served asset hashing.
Private observations are Windows DPAPI encrypted; read success and complete all-field
comparison are checked by `verify_p00.py`. This is not a protected backup or restore drill.
P01 owns durable encrypted backup/restore, retention and cloud protection decisions.
`aws_mcp_read.py` retrieves documentation through the installed Toolkit MCP bridge;
resource inspection uses CLI fallback because native AWS tools are absent from this chat.

## Fixture and verification policy

Use invented participants, subjects, .invalid email addresses and synthetic answer text;
mock delivery/recovery, time and idempotency. Never copy real rows into fixtures or
replay production mutations. Isolated auth/backend tests require their own lease and
must not enroll family members, send reset codes or make invitations live as a side effect.
Code-ready, mocked, deployed and physical-phone evidence are separate states.
Run relevant existing build/lint checks for code changes; this P00 docs/setup phase
checks contract types, clone boundaries, private decryption and production preservation.

## Rollback

No P00 cloud writes exist to roll back. Preserve encrypted observation until P01 accepted
recovery supersedes it. Coordinator may remove only newly created disposable local clones
after checking resolved paths are within this project's implementation/ directory, or
retain them marked unaccepted. Do not reset source/, delete production resources or
replay historical auth-removal commits. Baseline ref is `refs/tags/codex/p00-baseline` in
both newly created clones. A future release rollback needs its own reviewed data/schema
compatibility plan; an old frontend commit alone cannot undo a schema migration.
