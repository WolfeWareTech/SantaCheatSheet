# Optional email preparation (P14)

This package is separate from Amplify, the app, and Cognito recovery. It performs
no sends. P14/01 inspected SES in the selected Region, us-east-2; the project is
still sandboxed. This package alone does not establish production readiness.

## Prepared resources

`readiness.template.json` proposes exactly three optional resources under the
stack `SantaCheatSheet-P14-01`: configuration set `SantaCheatSheet-P14-01-email`,
event destination `aggregate-delivery`, and managed policy
`SantaCheatSheet-P14-01-sender`. Every resource is conditional on us-east-2.
The managed policy has no users, groups, or role attachments. Sending through the
configuration set is disabled. TLS is required; bounce/complaint suppression is
enabled. The template neither creates nor changes an identity, DNS record,
identity default configuration set, Cognito setting, or application role.

Parameters have no sender defaults. The owner must choose the existing verified
identity and monitored From address; app admin addresses are not sender consent.
Validate that the chosen mailbox is covered by the identity before deployment.
Keep real parameter values in encrypted private deployment material, never Git,
chat, console output, or a shell history. `NoEcho` masks CloudFormation parameter
displays; it does not encrypt the resolved IAM policy. Authorized IAM readers
can see its sender condition, so do not place credentials in these parameters.

The prepared policy allows only `ses:SendEmail`, the chosen identity, this
configuration set, one From address and the selected Region. Resource scoping
permits use of this configuration set; it **cannot require** that a caller include
the optional configuration-set field. P15 must enforce that field server-side,
use a dedicated role with no other send grants, and reject raw/template/bulk
or multi-recipient requests unless separately reviewed. Do not expose that role
to browser clients. No role receives the policy in P14.

## Reporting and privacy

The event destination publishes only aggregate counts to CloudWatch metrics,
using the SES-generated `ses:configuration-set` auto-tag. No raw SES events go
to CloudWatch Logs. No SNS topic, queue, archive, log group, Lambda, tracking
domain, open/click tracking, or new CloudTrail is created. Custom metrics can
incur charges; no paid plan change or purchase is implied.

Existing project audit trails are outside this template and were not audited
in this phase. Before a later sending release, inspect their encryption,
access and event selection: SES API audit entries can contain addresses. Never
route raw send payloads or provider events into application logs.

`delivery_contract.py` is an offline reference for the P15 observation schema:

| Status | Evidence | Meaning |
| --- | --- | --- |
| queued | Persisted app job ID | Waiting locally; SES has not accepted it |
| accepted | SES MessageId or Send event | SES accepted the request and may attempt delivery |
| delivered | Delivery event | Recipient mail server accepted it; no proof of inbox placement or reading |
| delayed | DeliveryDelay event | A temporary issue; no final delivery claim |
| bounced | Bounce event | Permanent or exhausted delivery failure |
| complained | Complaint event | Recipient reported spam; stop future invitations to that destination |
| rejected | Reject event | SES accepted then rejected message content |
| rendering_failed | Rendering Failure event | Provider could not render the message |
| unknown | Missing/unsupported evidence | No delivery conclusion |

Observations contain only version, allowlisted status, keyed message/observation
digests, and a validated event timestamp when available. The correlation key
must be private, stable and at least 32 random bytes; the test key is synthetic.
Use the same private key to correlate API acceptance and provider events.
Missing event timestamps remain absent; `mail.timestamp` is the original send
time and must not masquerade as delivery time. Observation digests help identify
replays; they are not unique-recipient counters. Do not blindly overwrite final
statuses with delayed or older events. A bounce/complaint must stop automatic
retry to that destination; a timeout after send is ambiguous and must not cause
an automatic duplicate send. P15 owns durable job IDs, idempotency, event order,
recipient mapping, suppression handling, retry rules and admin authorization.

Aggregate metrics cannot populate per-person delivery state. The normalizer
does not authenticate event origin, deploy an ingestion route, or persist any
observations. Before P15 exposes per-person results, a separately reviewed
authenticated/encrypted ingestion path and finite cloud lease are required.
Keep raw recipient mapping encrypted and restricted; log only normalized
observations. An unsigned event or a metric count is not a person's receipt.

## Readiness gates and local checks

Owner sender choice, current verification, reviewed DNS authentication, SES
production access for ordinary family recipients, deployment/activation and
authorized delivery checks remain separate gates. While sandboxed the permitted
recipient options are: (1) individually verified email identities, (2) SES mailbox
simulator addresses, or (3) addresses at any verified domain in this project.
None are authorization to send. Preserve existing DKIM and verified identities.
The inspected domain has no custom MAIL FROM; current SES onboarding guidance
requires completing that setup before its production-access workflow. Review
the chosen domain's existing DNS before proposing exact records; do not invent
a MAIL FROM label or change an existing DMARC policy.

Run offline checks from the repository root:

```text
python -m unittest discover -s implementation/email -p "test_*.py" -v
```

These synthetic events include no live sends, simulator sends or family data.
CloudFormation ValidateTemplate passed for the prepared template. It checks
template syntax; it is not a successful deployment or IAM/service integration
test. Local cfn-lint/cfn-guard were unavailable and were not installed. Their
schema/compliance checks and account-aware predeployment checks remain pending.
Do not deploy merely because the offline checks pass.

## Activation and rollback

Do not deploy without a coordinator-amended finite lease and selected sender.
The review workspace owns P14/01 `CLOUD_LEASE_REQUEST.json` and `OWNER_ACTION.md`.
No activation, production-access request or verification message is submitted.
P15 must obtain a separate lease for role attachment, enabling sends and any
event ingestion support. A simulator send is a later explicitly authorized test;
real delivery/authentication requires an authorized mailbox and header evidence.

Local rollback reverts this package's commit. After a separately authorized
deployment, leave configuration-set sending disabled; detach only this policy
if a later phase attached it, after checking its consumers. Optional cleanup may
remove only these three new resources after verifying no sender references or
attachments. Do not automatically delete anything; retain all preexisting
identities, DNS, recovery configuration, identities, sheets and historical data.

References: [SES event publishing](https://docs.aws.amazon.com/ses/latest/dg/monitor-using-event-publishing.html),
[SES v2 IAM resources](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html),
[CloudFormation event destination](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ses-configurationseteventdestination.html),
[SES production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).
