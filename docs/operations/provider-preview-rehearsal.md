# Stripe And LiveKit Preview Rehearsal

Status: synthetic guard implementation complete; provider-connected Preview
rehearsal remains blocked pending isolated provider configuration.

Keep the relaunch feature gate off throughout this rehearsal. This runbook does
not authorize Production access, provider provisioning, deployment, catalog
mutation, webhook mutation, or customer-data use.

## Environment Identity

Provider access uses `VERCEL_ENV` and the scoped
`MEELNI_ENV_PULL_ENVIRONMENT` marker. `NODE_ENV` is not an environment identity:
Vercel Preview uses production-mode Next.js builds. When both trusted markers
exist they must agree exactly.

Stripe Preview requires:

- `STRIPE_SECRET_KEY` using `sk_test_` or least-privilege `rk_test_` mode;
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` using `pk_test_` mode;
- `STRIPE_WEBHOOK_SECRET`;
- `STRIPE_INTERVIEW_PASS_PRICE_ID`;
- `STRIPE_STARTER_MONTHLY_PRICE_ID`;
- `STRIPE_PRO_MONTHLY_PRICE_ID`.

LiveKit Preview requires:

- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`;
- `NEXT_PUBLIC_LIVEKIT_URL` or `LIVEKIT_URL` for a dedicated Preview project;
- `MEELNI_PREVIEW_LIVEKIT_URL`, a fresh non-secret Preview project anchor;
- `MEELNI_PRODUCTION_LIVEKIT_URL`, a non-secret Production project anchor;
- the appropriate `LIVEKIT_INTERVIEW_AGENT_NAME` and
  `LIVEKIT_DEMO_AGENT_NAME` values.

Production must match the canonical Production LiveKit origin. Preview must
match the canonical Preview anchor, and those anchors must differ. Development
must differ from Production and may use Preview when its anchor is present. If
both LiveKit URL variables exist, they must canonicalize to the same
credential-free `wss://*.livekit.cloud` origin.
LiveKit Cloud may inject its server-only `LIVEKIT_URL` as an
`https://*.livekit.cloud` control-plane URL. The Python workers accept that
secure server-only form and normalize it to the equivalent `wss://` origin
before provider initialization. Public URLs and configured Preview/Production
anchors remain `wss://`-only; `http://`, `ws://`, credentials, paths, queries,
and non-LiveKit hosts remain denied.
The web runtime, internal transcript authentication, and both Python voice
workers enforce this identity before provider initialization or transcript
mutation. The Production anchor is scoped identity metadata and is never
restored from an older local env file when a Vercel pull omits it.
Docker builds may run the exact provider-free `download-files` agent command
without runtime credentials. No worker command or room entrypoint receives
that exception.

LiveKit deploys require an explicit `preview` or `production` argument, the
matching external environment-and-agent config path, both project anchors, and
the matching expected agent ID documented in `agent/README.md`. Before any
`lk agent deploy`, the script resolves one absolute config path, validates that
file, then derives a relative CLI argument whose join from `agent/` resolves
back to the exact same file. `[project].subdomain` must match the selected
environment anchor and `[agent].id` must match the selected worker's expected
ID. Tracked TOML files intentionally contain no project or agent identifiers.
Preview-scoped env pulls require a fresh nonblank Preview anchor and never
restore it from a stale local file.

### First Preview Agent Creation

The installed LiveKit CLI can link existing Cloud projects but cannot create a
Cloud project. Create `meelni-preview` in the LiveKit dashboard, then run
`lk cloud auth` and select only that project. Keep the canonical `meelni`
Production project as the CLI default and pass the Preview alias explicitly.
Do not reuse the locally configured generic `test` alias: its current agent
inventory request returns `401`, so ownership, access, and emptiness are not
proved.

Never print raw `lk project list --json`; that payload includes API keys and
secrets. The one shared bootstrap captures it internally, proves exactly one
`meelni-preview` alias has a valid project ID and the expected Preview URL,
freezes only that entry into a private one-run CLI home, and re-verifies the
snapshot without relaying provider stdout or stderr:

```bash
python3 agent/shared/bootstrap_livekit_preview.py demo
python3 agent/shared/bootstrap_livekit_preview.py interview
```

The bootstrap is Preview-only and fixed to `us-east`. It refuses relative,
non-canonical, repository-local, symlinked, or pre-existing config targets. It
requires a private (`0700`) external parent directory and separate worker
secrets files with mode `0600`, no duplicate or extra names,
`MEELNI_ENV_PULL_ENVIRONMENT=preview`,
both exact URL anchors, the fixed matching dispatch name, and a non-placeholder
`OPENAI_API_KEY`. `ANTHROPIC_API_KEY` and every other extra name are denied.
It also requires exactly LiveKit CLI v2.12.8 before reading the registry;
upgrade only after re-auditing registry resolution and config-path behavior.
The CLI subprocess environment is rebuilt from a tight allowlist for auth
config location, locale, and temporary files, so unknown ambient application
or provider credentials and TLS trust-root overrides are not forwarded. The
create subprocess uses the bootstrap-owned CLI home containing only the
verified Preview project. Both inventory calls and create have bounded
timeouts; create receives only a private frozen copy of the validated secrets.

After all local validation and the read-only alias inventory, the only allowed
mutation is equivalent to:

```bash
lk --project meelni-preview \
  --config <relative-bootstrap-config> \
  agent create --region us-east \
  --secrets-file <mode-0600-frozen-secrets> \
  --silent .
```

The command runs from `agent/`. In LiveKit CLI v2.12.8, the config filename is
joined to the working directory even when it looks absolute. The bootstrap
therefore derives a relative path and rejects it unless that join resolves
exactly to its random private workspace outside the repository. The demo
Dockerfile is selected only during the subprocess and is restored on all
handled exits. The generated config is made private, then must positively
match the Preview subdomain and a `CA_*` agent ID. Those validated bytes are
fsynced to a private file and atomically linked to the operator target; a
pre-existing file or symlink causes a no-clobber denial. Record the printed ID in
`MEELNI_LIVEKIT_PREVIEW_DEMO_AGENT_ID` or
`MEELNI_LIVEKIT_PREVIEW_INTERVIEW_AGENT_ID`; later versions must use the
ordinary guarded deploy scripts.

The bootstrap acquires a deterministic mode-`0600`
`.meelni-livekit-bootstrap-*.lock` in the canonical config parent before its
first absence check and holds it through config publication. This reservation
is shared across repository worktrees, so two processes targeting one config
cannot both mutate LiveKit. The repository-local lock separately protects the
demo Dockerfile within one worktree. Remove either stale lock only after proving
no matching bootstrap process is running.

If create returns failure or post-create validation fails, do not retry
blindly: inspect `lk agent list --project meelni-preview` and the dashboard for
a partially created agent. Delete only the positively identified Preview
agent, or preserve it and regenerate its external config, before retrying.
The relaunch flag stays off throughout.

The Stripe catalog setup command applies the same trusted deployment identity
and key-mode boundary before constructing a Stripe client. `--dry-run` remains
provider-free; Production live-mode setup additionally requires
`--confirm-live`.

## Provider-Free Gate

Run from a clean worktree without pulling envs or starting provider runtimes:

```bash
npm run test:integrations
npm run test:billing
npm run test:python-agent
npm run test:api
npm run test:local
npm run typecheck
```

The gate is red if any environment-policy test, route denial test, Python
runtime contract, or typecheck fails. `npm run check:ci` is the broader merge
gate and includes the Python agent contracts.

Do not use `npm run stripe:setup-catalog` without `--dry-run`, `stripe listen`,
`stripe trigger`, `stripe events resend`, any `lk` mutation/deploy command, or
any Production-scoped command during this phase.

## Open Operational Blockers

- A pristine dedicated Preview database may report
  `ready_for_clean_bootstrap` only when its Drizzle ledger is absent and its
  public application schema contains no non-extension objects. That diagnostic
  result is not rehearsal- or launch-ready. Apply the exact canonical migration
  chain only after backup/rehearsal requirements are satisfied, then require a
  clean postflight result. Any partial schema, unexpected object, or catalog
  ambiguity remains a hard stop; do not copy Production data, seed migration
  history manually, or create an alternate repair chain.
- The current Vercel metadata shows one `STRIPE_WEBHOOK_SECRET` entry scoped to
  both Preview and Production. A webhook secret has no test/live prefix, so
  static validation cannot prove endpoint identity. Preview needs its own test
  webhook endpoint and secret, followed by a synthetic signed-webhook smoke
  test, before the golden path can pass.
- Static Stripe price IDs are opaque. The three configured Preview prices still
  require read-only test-account verification that each exists and reports
  `livemode=false` before Checkout rehearsal.
- Preview remains fail-closed until its distinct LiveKit project anchor and
  environment-and-worker agent IDs are configured. API credentials and dispatch
  names still require read-only provider verification before rehearsal.
- The currently running Production agents predate the environment guard. Before
  deploying guarded worker code to Production, add
  `MEELNI_ENV_PULL_ENVIRONMENT=production` and the canonical
  `MEELNI_PRODUCTION_LIVEKIT_URL` to each agent. A missing marker or anchor is
  an intentional no-go.
- LiveKit supports multiple individually linked Cloud projects. Usage and
  quotas are project-scoped, while free-project allowances are shared across
  free projects; another project does not increase that allowance. Billing is
  usage-based rather than a documented fixed fee per project.
- Preview currently has no listed `INNGEST_EVENT_KEY`, and its signing
  configuration has not been independently verified. Feedback handoff remains
  blocked until a Preview event key and matching signing configuration pass
  the service-health gate.
- Route denial tests cover session start and demo token issuance with missing,
  invalid, or conflicting Preview identity and dispatch configuration. Separate
  relaunch-gate behavior tests prove default-off access returns `403` before
  demo room/dispatch, Stripe Checkout, or application-database mutation. The gate
  does not disable cancellation, billing-portal access, account deletion, or
  existing account data.
  Session start performs the required Supabase authentication read before
  runtime configuration validation; no application database, session, credit,
  or provider mutation begins, and no LiveKit client, room, token, or dispatch
  is initialized. Fuller portal route coverage remains follow-up work under
  SAV-184/SAV-186.

## Live Preview Go/No-Go

Proceed to a separately authorized provider-connected rehearsal only when all
provider-free checks pass, Preview Stripe uses test mode with a distinct
webhook endpoint, the three test prices are verified, LiveKit uses a distinct
project with deployed matching agents, Inngest is ready, and the feature gate
remains off. Any identity ambiguity is a no-go.
