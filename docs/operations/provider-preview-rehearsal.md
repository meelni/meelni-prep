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
- `MEELNI_PRODUCTION_LIVEKIT_URL`, a non-secret Production project anchor;
- the appropriate `LIVEKIT_INTERVIEW_AGENT_NAME` and
  `LIVEKIT_DEMO_AGENT_NAME` values.

Production must match the canonical Production LiveKit origin. Preview and
Development must differ from it. If both LiveKit URL variables exist, they must
canonicalize to the same credential-free `wss://*.livekit.cloud` origin.
The web runtime, internal transcript authentication, and both Python voice
workers enforce this identity before provider initialization or transcript
mutation. The Production anchor is scoped identity metadata and is never
restored from an older local env file when a Vercel pull omits it.
Docker builds may run the exact provider-free `download-files` agent command
without runtime credentials. No worker command or room entrypoint receives
that exception.

LiveKit deploys require an explicit `preview` or `production` argument and the
matching external environment-and-agent config path documented in
`agent/README.md`. Before any `lk agent deploy`, the script derives the project
origin from `[project].subdomain`: Preview must differ from
`MEELNI_PRODUCTION_LIVEKIT_URL`, while Production must match it. Tracked TOML
files intentionally contain no project or agent identifiers.

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

- The current Vercel metadata shows one `STRIPE_WEBHOOK_SECRET` entry scoped to
  both Preview and Production. A webhook secret has no test/live prefix, so
  static validation cannot prove endpoint identity. Preview needs its own test
  webhook endpoint and secret, followed by a synthetic signed-webhook smoke
  test, before the golden path can pass.
- Static Stripe price IDs are opaque. The three configured Preview prices still
  require read-only test-account verification that each exists and reports
  `livemode=false` before Checkout rehearsal.
- A distinct Preview LiveKit Cloud project, API credentials, and both agent
  dispatch names must be verified. The URL inequality guard prevents a known
  Production target but cannot prove that credentials or agent names belong to
  the declared Preview project.
- LiveKit supports multiple individually linked Cloud projects. Usage and
  quotas are project-scoped, while free-project allowances are shared across
  free projects; another project does not increase that allowance. Billing is
  usage-based rather than a documented fixed fee per project.
- Preview currently has no listed `INNGEST_EVENT_KEY`, and its signing
  configuration has not been independently verified. Feedback handoff remains
  blocked until a Preview event key and matching signing configuration pass
  the service-health gate.
- Focused route tests cover current billing and reconnect behavior, but fuller
  session-start, demo-token, and portal route coverage remains follow-up work
  under SAV-184/SAV-186.

## Live Preview Go/No-Go

Proceed to a separately authorized provider-connected rehearsal only when all
provider-free checks pass, Preview Stripe uses test mode with a distinct
webhook endpoint, the three test prices are verified, LiveKit uses a distinct
project with deployed matching agents, Inngest is ready, and the feature gate
remains off. Any identity ambiguity is a no-go.
