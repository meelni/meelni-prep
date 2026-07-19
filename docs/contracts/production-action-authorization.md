# Production Action Authorization Contract

Contract: `meelni.production-action-authorization.v1`

This contract authorizes one exact Meelni release or maintenance action. It is
not a launch decision, readiness evidence, a provider credential, or customer
runtime authorization.

## Scope

The contract applies only to operator-controlled Production actions:

- `stripe-live-catalog`
- `livekit-production-interview-deploy`
- `livekit-production-demo-deploy`
- `production-database-migrate`
- `production-question-sync-activate`
- `production-question-sync-manual`
- `vercel-production-promote`
- `relaunch-default-on`

Normal authenticated or provider-signed runtime behavior remains outside this
contract. In particular, period-end cancellation, account deletion, billing
portal access, Checkout, webhooks, interview sessions, and post-launch customer
transactions retain their existing subject authorization, idempotency, and
environment controls.

## Signed Artifact

The external mode-`0600` JSON artifact contains exactly `contract`, `payload`,
and `signature`. The payload contains exactly:

- action authorization ID and action enum;
- owner ID `saviii` and environment `production`;
- provider and SHA-256 target fingerprint;
- exact 40-character Git candidate SHA, resolved only from a clean tracked and
  untracked worktree;
- SHA-256 configuration fingerprint;
- SHA-256 executor fingerprint;
- an action-specific `mutationScope` from the repository allowlist;
- canonical UTC issue and expiry timestamps, with a maximum 30-minute lifetime;
- `maxUses: 1`;
- `ownerLaunchDecision`, which must be `null` for every action except
  `relaunch-default-on`.

The signature is Ed25519 over the UTF-8 signing domain
`meelni.production-action-authorization.v1`, one NUL byte, and the canonical
JSON payload. This domain separation prevents a signature over identical JSON
from being reused by another protocol or future contract version. The owner
key is dedicated to this authorization domain. The verifier accepts
only active public keys in `config/production-action-owner-keys.json`. The
private key stays outside the repository and must never be pasted into chat,
Linear, a PR, logs, or a provider environment.

The provider-free owner tooling contract,
`meelni.production-action-owner-tooling.v1`, creates the Ed25519 private key and
random executor identity only in new external mode-`0600` files. Enrollment may
emit only the public registry entry for a separate reviewed change. Unsigned
payload and signed-artifact commands emit fixed success codes rather than their
contents. Signing verifies the result against the reviewed public registry
before writing it to a new external mode-`0600` file.

The tooling's generic preparation and signing path rejects
`relaunch-default-on`. It therefore cannot create or imply launch GO. A future
launch-decision workflow must remain separate and require the human owner's
explicit GO bound to the exact candidate.

`relaunch-default-on` uniquely requires `ownerLaunchDecision: "GO"`. A GO for
another candidate, a readiness recommendation, a passed automated gate, a
provider rehearsal, or authorization for another Production action cannot
enable the relaunch.

## Consumption

The executor identity is a private, random, mode-`0600` external file. Its
fingerprint binds the signed artifact to the enrolled executor identity. Before
the provider client or command starts, the verifier records the authorization
ID and artifact hash in that workstation's private consumption ledger. A
provider failure after consumption requires a newly signed artifact through
the supported workflow.

This local ledger prevents accidental replay and concurrent reuse through the
supported wrapper on that workstation. It is not a global or tamper-proof
single-use authority: a process with the same OS-user permissions can copy the
executor file, change `HOME`, or delete the ledger. Central protected
compare-and-swap consumption remains required before the repository can claim
globally enforced one-use against a malicious same-user caller.

Unknown fields, malformed canonical values, a key outside its validity window
at use or before artifact expiry, future/expired timestamps, a dirty worktree,
environment/action/provider/target/configuration/candidate/executor mismatch,
mutation-scope mismatch, non-GO default-on, and locally recorded replay all fail
closed.

The repository guard prevents accidental or delegated execution through
supported tooling. Credential custody, provider roles, branch protection, and
review remain the outer security boundary because an operator with direct
provider credentials can bypass repository wrappers.

## Synthetic proof

`meelni.production-action-synthetic-proof.v1` exercises the same enrollment,
preparation, signing, verification, and local consumption code with temporary
synthetic inputs. A passing proof must demonstrate exact binding, candidate and
artifact mutation rejection, expiry rejection, and replay rejection while
reporting zero provider calls and zero Production calls. All temporary private
material is removed at completion. This proof validates the repository
contract; it does not enroll the owner, authorize a real action, or establish
launch readiness.
