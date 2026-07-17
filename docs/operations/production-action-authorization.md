# Production Action Authorization

Status: repository-owned executable paths are guarded for Stripe live-catalog
setup, LiveKit Production deploys, Production database migrations, and manual
Production question sync. Legacy database-mutating scripts reject Production
and unmarked shared targets before their database adapter loads. Vercel
Production promotion, first schedule activation, and relaunch default-on remain
unsupported rather than exposing an unguarded command. No owner public key is
enrolled yet, so guarded Production paths intentionally fail closed. Preview,
local development, scheduled runtime sync after activation, and ordinary
customer/runtime actions are unchanged.

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

The canonical executor files are:

```text
~/.config/meelni/production-actions/executor-id
~/.config/meelni/production-actions/consumed-v1.json
```

The executor ID is 32 random bytes encoded as 43-character unpadded base64url.
The consumption ledger is created automatically with mode `0600` after a valid
artifact is accepted.

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

1. adding controlled Vercel Production promotion, first question-sync schedule
   activation, and relaunch default-on provider adapters; these actions are
   unsupported until those adapters exist;
2. enrolling the owner's public key and executor only when the owner is
   available;
3. adding central protected compare-and-swap consumption before claiming
   globally enforced one-use.

No direct provider CLI or dashboard mutation is approved as a substitute for
these wrappers.
