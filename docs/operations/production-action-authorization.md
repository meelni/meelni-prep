# Production Action Authorization

Status: repository-owned executable paths are guarded for Stripe live-catalog
setup, LiveKit Production deploys, Production database migrations, and manual
Production question sync. Legacy database-mutating scripts reject Production
and unmarked shared targets before their database adapter loads. Repository
policy ignores every Vercel Git build except Preview, and the already-declared
scheduled route is source-fenced for any future owner-authorized first
activation. Production promotion, live schedule activation, and relaunch
default-on remain unsupported rather than exposing an unguarded command. Owner
enrollment and artifact preparation tooling is available, but no owner public
key is enrolled yet, so guarded Production paths intentionally fail closed. Preview,
local development and ordinary customer/runtime actions are unchanged.

Provider-state evidence recorded on 2026-07-17: the correct Vercel project,
`meelni/meelni` (`prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4`), reported `live: false`;
the current and recent Production deployment attempts were in `ERROR`. There
was therefore no active Production deployment or cron to bootstrap before this
repository policy began ignoring Production builds. This is time-sensitive
external evidence, not a code invariant: recheck it before merging this guard
or attempting first Production activation. If the project reports a live
deployment, stop and design a separately owner-authorized fence-first rollout
instead of merging both changes together.

## Ownership Boundary

- Only the human product owner can sign an authorization artifact.
- A signed Production action is not launch GO.
- Only `relaunch-default-on` may carry launch `GO`, and it must bind that GO to
  the exact candidate.
- Agents may prepare an unsigned payload, configuration fingerprint, validation
  plan, and rollback plan. They cannot enroll their own key, sign for the
  owner, infer GO, or treat a technical gate as authorization.

## Enrollment State

`config/production-action-owner-keys.json` is intentionally empty. Before any
supported Production action can run, the owner must enroll an Ed25519 public
key through a reviewed change and create a private executor ID on the
authorized workstation. Keep the private signing key and executor ID outside
the repository in mode-`0600` files. Never send either value through chat.

The canonical private files are:

```text
~/.config/meelni/production-actions/owner-ed25519-private.pem
~/.config/meelni/production-actions/executor-id
~/.config/meelni/production-actions/consumed-v1.json
```

The executor ID is 32 random bytes encoded as 43-character unpadded base64url.
The consumption ledger is created automatically with mode `0600` after a valid
artifact is accepted.

### Owner-only enrollment

The human owner runs enrollment on the authorized workstation. Agents must not
run this command against the canonical paths or receive its private outputs.
Choose a stable key ID and a bounded validity window:

```bash
umask 077
npm run production-action:owner -- enroll \
  --key-id meelni-owner-2026-01 \
  --not-before 2026-07-01T00:00:00.000Z \
  --not-after 2027-07-01T00:00:00.000Z \
  > /tmp/meelni-owner-public-entry.json
```

The command refuses repository paths and existing files. It creates the
private key and executor ID with mode `0600`; stdout contains only the public
registry entry. Review that public entry locally, add only that entry to the
`keys` array in `config/production-action-owner-keys.json`, and merge it through
a separate reviewed PR. Delete the temporary public-entry file afterward. Do
not add the private key, executor ID, unsigned payload, signed artifact, or
consumption ledger to Git, GitHub, Linear, chat, CI artifacts, or provider
environments.

Enrollment is complete only after the reviewed public-key change is present on
the exact clean candidate that will be authorized. The owner must inspect the
candidate, action, configuration fingerprint, target fingerprint, issue time,
expiry, and mutation scope before signing.

### Provider-free contract rehearsal

Run the synthetic proof before using owner tooling:

```bash
npm run production-action:synthetic-dry-run
```

It creates temporary synthetic keys and artifacts, proves exact binding plus
candidate mutation, artifact mutation, expiry, and replay rejection, and then
removes the temporary directory. Its fixed result reports zero provider calls
and zero Production calls. It does not load customer data or provider
credentials.

### Prepare, sign, and verify an artifact

An agent may calculate the exact action-specific configuration and target
SHA-256 fingerprints and prepare an unsigned payload. The payload path must be
absolute, external to the repository, new, and inside a mode-`0700` directory.
For a Production database migration, use the same fingerprints as the guarded
database entrypoint: `databaseMigrationConfigurationSha256(repoRoot)` and
`databaseTargetSha256(DATABASE_URL)` from `scripts/database-command.mjs`. Never
print or paste `DATABASE_URL`; only its domain-separated target hash belongs in
the unsigned payload.

```bash
npm run production-action:owner -- prepare \
  --action production-database-migrate \
  --configuration-sha256 "$REVIEWED_CONFIGURATION_SHA256" \
  --target-fingerprint "$REVIEWED_TARGET_SHA256" \
  --output-path "$HOME/.config/meelni/production-actions/database-migrate-unsigned.json" \
  --ttl-minutes 15
```

The human owner reviews that external mode-`0600` payload and signs it locally:

```bash
npm run production-action:owner -- sign \
  --payload-path "$HOME/.config/meelni/production-actions/database-migrate-unsigned.json" \
  --artifact-path "$HOME/.config/meelni/production-actions/database-migrate-authorization.json" \
  --key-id meelni-owner-2026-01
```

Signing first checks that the selected private key matches the active reviewed
public registry entry and that the signed payload is valid at that instant. It
prints only `signed_artifact_written`, never the artifact or key. Verify the
exact action binding before execution:

```bash
npm run production-action:owner -- verify \
  --artifact-path "$HOME/.config/meelni/production-actions/database-migrate-authorization.json" \
  --action production-database-migrate \
  --configuration-sha256 "$REVIEWED_CONFIGURATION_SHA256" \
  --target-fingerprint "$REVIEWED_TARGET_SHA256"
```

Verification does not consume the artifact. The guarded Production command
below consumes it immediately before starting its provider adapter. Generic
owner tooling refuses `relaunch-default-on`; launch GO/NO-GO remains an
explicit, separate, human-owner-only decision and has no generic signing path.

### Revocation and rotation

To revoke a key, change only its public registry entry from `active` to
`revoked` in a reviewed PR. Do not delete the entry or the consumption ledger.
Move the private key out of service or destroy it through the workstation's
approved secure-storage process. Any outstanding artifact from that key then
fails closed once the revoked registry is on the executing candidate.

Rotate by enrolling a new key ID and private executor deliberately, merging the
new public entry, and only then revoking the old key. Executor rotation changes
the bound fingerprint, so every outstanding artifact must be discarded and
re-issued. Never rotate or delete the executor/ledger merely to bypass replay
protection.

## Execution

Set only the path to the signed external artifact:

```bash
export MEELNI_PRODUCTION_ACTION_AUTHORIZATION=/absolute/external/path/authorization.json
```

LiveKit Production deploy wrappers invoke the fixed, root-owned system Node
runtime at `/usr/local/bin/node`. The caller cannot select a replacement through
`PATH` or an environment variable, and the wrapper removes `NODE_OPTIONS` and
`NODE_PATH` before verification. If that runtime is missing, a symlink, not
root-owned, or not executable, the deploy fails closed before `lk`.
The selected config must be a real file rather than a symlink. The wrapper
copies it into a private snapshot, authorizes the snapshot bytes, and passes
that same snapshot to `lk` so path replacement cannot change the approved
configuration.

The supported wrapper then verifies and consumes the exact authorization
before constructing a Stripe client, invoking `lk`, or spawning Drizzle. The
artifact is never read from an env value, CLI argument, tracked file, symlink,
or group/world-readable file.

Current guarded commands:

```bash
STRIPE_SECRET_KEY=rk_live_... npm run stripe:setup-catalog -- --confirm-live
agent/interview/deploy.sh production
agent/demo/deploy.sh production
MEELNI_ALLOW_REMOTE_MIGRATION=1 npm run db:migrate:production
MEELNI_ENV_FILE=.env.production.local npm run sync:questions
```

The demo worker remains dormant and de-scoped. Its guarded deploy command is
not permission to reintroduce the demo experience.

## Failure And Retry

- Validation failure performs no provider mutation and does not consume the
  authorization.
- Local consumption occurs before the external command. A later provider or
  command failure requires a new authorization through the supported wrapper.
- Default-off and emergency disable/rollback actions do not require launch GO.
- Do not delete or edit the consumption ledger to retry. Prepare fresh evidence
  and obtain a new exact authorization. The local ledger is cooperative replay
  protection, not a tamper-proof global one-use service; central protected
  consumption remains a later phase.

## Remaining Phases

SAV-254 follow-up remains for:

1. adding controlled Vercel Production promotion, live question-sync schedule
   activation, and relaunch default-on provider adapters; Git Production builds
   are ignored and Production schedule requests are inert until those adapters exist;
2. the human owner running the provider-free enrollment workflow and merging
   only the reviewed public key when ready;
3. adding central protected compare-and-swap consumption before claiming
   globally enforced one-use.

No direct provider CLI or dashboard mutation is approved as a substitute for
these wrappers.
