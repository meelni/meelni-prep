# Production Action Authorization

Status: repository-owned executable paths are guarded for Stripe live-catalog
setup, LiveKit Production deploys, Production database migrations, and manual
Production question sync. Legacy database-mutating scripts reject Production
and unmarked shared targets before their database adapter loads. Repository
policy accepts Vercel Preview builds and Production Git builds only from
`main`; all other Production refs are ignored. A reviewed merge to `main` is
the supported web Production path. Direct branch promotion, live schedule
activation, and relaunch default-on remain unsupported rather than exposing an
unguarded command. The already-declared scheduled route remains source-fenced
for any future owner-authorized first activation. Owner enrollment and artifact
preparation tooling is available, and the active owner
public key `meelni-owner-2026-07` is enrolled. Guarded Production paths still fail closed
unless the owner signs a fresh exact artifact for the reviewed action,
candidate configuration, target fingerprint, and bounded TTL. Preview, local
development and ordinary customer/runtime actions are unchanged.

## Ownership Boundary

- Only the human product owner can sign an authorization artifact.
- A signed Production action is not launch GO.
- Only `relaunch-default-on` may carry launch `GO`, and it must bind that GO to
  the exact candidate.
- Agents may prepare an unsigned payload, configuration fingerprint, validation
  plan, and rollback plan. They cannot enroll their own key, sign for the
  owner, infer GO, or treat a technical gate as authorization.

## Enrollment State

`config/production-action-owner-keys.json` contains the active Ed25519 public
key `meelni-owner-2026-07`, valid from `2026-07-21T00:00:00.000Z` through
`2027-07-21T00:00:00.000Z`. The corresponding private key and executor ID must
remain outside the repository on the authorized workstation in mode-`0600`
files. Never send either value through chat.

Provider-free proof recorded on 2026-07-22: `npm run
production-action:synthetic-dry-run` returned `result: "pass"` with
`productionCalls: 0`, `providerCalls: 0`, and proofs for exact binding,
candidate mutation rejection, artifact mutation rejection, expiry rejection,
and replay rejection.

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
  --key-id meelni-owner-2026-07 \
  --not-before 2026-07-21T00:00:00.000Z \
  --not-after 2027-07-21T00:00:00.000Z \
  > /tmp/meelni-owner-public-entry.json
```

The command refuses existing files, the repository's Git common directory,
and every registered linked worktree, including a worktree reached through a
symlinked ancestor. It proves the path boundary before creating a directory and
checks it again afterward. It creates the private key and executor ID with mode
`0600`; stdout contains only the public registry entry. Review that public entry
locally, add only that entry to the `keys` array in
`config/production-action-owner-keys.json`, and merge it through a separate
reviewed PR. Delete the temporary public-entry file afterward. Do not add the
private key, executor ID, unsigned payload, signed artifact, or consumption
ledger to Git, GitHub, Linear, chat, CI artifacts, or provider environments.

If the public stdout file is lost after enrollment succeeds, do not delete or
recreate the private key or executor. Re-derive the same public entry by
supplying the original key ID and validity window:

```bash
umask 077
npm run production-action:owner -- public-entry \
  --key-id meelni-owner-2026-07 \
  --not-before 2026-07-21T00:00:00.000Z \
  --not-after 2027-07-21T00:00:00.000Z \
  > /tmp/meelni-owner-public-entry.json
```

This read-only command verifies that the external mode-`0600` private file is
an Ed25519 key and emits only the public registry entry. It cannot recover an
unknown key ID or validity window, so retain those non-secret enrollment inputs
in the reviewed owner handoff. A caught partial file write removes its new file
before returning failure; rerun only after confirming the command's fixed error
code and that no canonical file exists.

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
  --key-id meelni-owner-2026-07
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

### Revocation and signing-key rotation

To revoke a key, change only its public registry entry from `active` to
`revoked` in a reviewed PR. Do not delete the entry or the consumption ledger.
Move the private key out of service or destroy it through the workstation's
approved secure-storage process. Any outstanding artifact from that key then
fails closed once the revoked registry is on the executing candidate.

Routine rotation changes only the signing key. Preserve the canonical executor
identity and consumption ledger so outstanding replay evidence and the
executor-bound action boundary remain intact. Create the replacement key at a
new explicit external path:

```bash
umask 077
npm run production-action:owner -- rotate-key \
  --key-id meelni-owner-2027-01 \
  --not-before 2027-06-15T00:00:00.000Z \
  --not-after 2028-07-01T00:00:00.000Z \
  --private-key-path "$HOME/.config/meelni/production-actions/owner-ed25519-private-2027.pem" \
  > /tmp/meelni-owner-2027-public-entry.json
```

Merge the new active public entry before using the new private-key path with
`sign --private-key-path ...`. After every artifact signed by the old key has
expired, change the old public entry to `revoked` in a reviewed PR and retire
the old private key through the approved workstation process. Do not overwrite
the old key in place.

Executor rotation is not supported by this tooling. It would invalidate every
outstanding artifact and change the identity consumed by all guarded Production
wrappers, so it requires a separately reviewed, staged maintenance workflow.
Never rotate or delete the executor or ledger merely to bypass replay
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
The Production interview-agent wrapper also requires an external, owner-only
secrets file containing only `MEELNI_TRANSCRIPT_INGEST_SECRET`. It snapshots
that file, includes the snapshot SHA-256 in the authorized target fingerprint,
and passes the same private snapshot to `lk`. The secret value is never printed
or stored in the authorization artifact.
After consuming the authorization, the wrapper reads the verified candidate
SHA from the private consumption receipt and uses `git archive` to create a
private build snapshot from that exact commit. LiveKit never builds the
Production interview worker from mutable working-tree bytes. The deploy omits
LiveKit's inferred Git attributes and writes the explicit
`meelni.source_sha=<authorized candidate SHA>` version attribute instead. A
failed archive, receipt validation, or source-identity check occurs after
consumption and therefore requires a fresh authorization.

Before consuming authorization, the wrapper resolves the installed `lk`
executable and requires `lk agent deploy --help` to expose both
`--no-default-attributes` and `--attribute`. LiveKit CLI 2.12.8 does not expose
these flags; official CLI 2.18.2 does. Upgrade through the existing official
package-manager installation and re-run this capability check before preparing
the owner payload. Never sign an action that the installed CLI cannot execute.

The supported wrapper then verifies and consumes the exact authorization
before constructing a Stripe client, invoking `lk`, or spawning Drizzle. The
artifact is never read from an env value, CLI argument, tracked file, symlink,
or group/world-readable file.

### Prepare an interview-agent deployment

Run this provider-free preparation only after the reviewed change is merged and
the authorized workstation is on that exact clean `main` commit. The helper
validates the canonical Production config and owner-only one-variable secrets
file, computes the same configuration and target fingerprints as the guarded
deploy wrapper, and writes only the external unsigned payload:

```bash
export MEELNI_REVIEWED_MAIN_SHA="<exact 40-character merged main SHA>"
npm run production-action:livekit-interview -- prepare \
  --expected-candidate-sha "$MEELNI_REVIEWED_MAIN_SHA" \
  --config-file "$MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG" \
  --secrets-file "$MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_SECRETS_FILE" \
  --output-path "$HOME/.config/meelni/production-actions/livekit-interview-unsigned.json"
```

The human owner reviews that payload locally and signs it:

```bash
npm run production-action:owner -- sign \
  --payload-path "$HOME/.config/meelni/production-actions/livekit-interview-unsigned.json" \
  --artifact-path "$HOME/.config/meelni/production-actions/livekit-interview-authorization.json" \
  --key-id meelni-owner-2026-07
```

Recompute the exact target fingerprints and verify the signed artifact without
printing them:

```bash
npm run production-action:livekit-interview -- verify \
  --expected-candidate-sha "$MEELNI_REVIEWED_MAIN_SHA" \
  --config-file "$MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG" \
  --secrets-file "$MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_SECRETS_FILE" \
  --artifact-path "$HOME/.config/meelni/production-actions/livekit-interview-authorization.json"
```

Then set `MEELNI_PRODUCTION_ACTION_AUTHORIZATION` to that artifact path and run
`agent/interview/deploy.sh production`. Preparation and verification make zero
provider calls and do not consume the artifact; the deploy wrapper consumes it
immediately before invoking `lk`.

Before opening a Production test room, prove that LiveKit recorded the exact
reviewed source identity:

```bash
lk agent versions \
  --id CA_yawKG67rCMG4 \
  --project meelni \
  --attribute "meelni.source_sha=$MEELNI_REVIEWED_MAIN_SHA" \
  --json |
  jq -e '(.versions // []) | length >= 1'
```

Then inspect the agent status and require the matching new version to be
`Running`. An empty attribute-filtered result means the deploy is unproven or
came from the retired mutable-working-tree path; do not run an interview.

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

1. adding controlled direct/non-main Vercel Production promotion, live
   question-sync schedule activation, and relaunch default-on provider adapters;
   reviewed `main` Git builds are already supported, while Production schedule
   requests remain inert until those adapters exist;
2. the human owner running the provider-free enrollment workflow and merging
   only the reviewed public key when ready;
3. adding central protected compare-and-swap consumption before claiming
   globally enforced one-use.

No direct provider CLI or dashboard mutation is approved as a substitute for
these wrappers.
