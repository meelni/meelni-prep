# Meelni Connection Runbook

Use this reference when an agent needs to connect to, inspect, or safely mutate
Meelni external systems. This repository is public, so it intentionally stores
procedures and environment-variable names but not personal identities, provider
resource IDs, installation IDs, account numbers, private dashboard URLs, or
developer workstation paths.

Before opening a provider section, run `npm run agent:service -- <service>`.
The machine-readable `config/agent-integrations.json` owns runtime integration
requirements. Provider dashboards and authenticated CLIs remain the source of
truth for the exact account and resource selected for an operation.

## Capture policy

- Record reusable authentication commands, verification shapes, environment
  variable names, read/write boundaries, and production guardrails.
- Do not record secrets, tokens, raw environment values, one-time device codes,
  private customer data, personal email addresses, provider resource IDs,
  installation IDs, account numbers, or local absolute paths.
- Resolve exact resource identifiers through an authenticated provider session
  when needed. Keep any private operator notes outside the Git repository.
- If a provider connection changes, update the procedure here without copying
  values returned by the provider.

## Vercel

Auth:

```bash
npx vercel@55.0.0 login
```

Verify the authenticated team and existing project before linking:

```bash
npx vercel@55.0.0 whoami
npx vercel@55.0.0 teams ls
npx vercel@55.0.0 project inspect meelni --scope meelni
npx vercel@55.0.0 link --yes --project meelni --scope meelni
npx vercel@55.0.0 env ls
```

Guardrails:

- Never print environment values. Enter secrets through an interactive provider
  prompt or dashboard, never a command-line value argument.
- Preview and Production values remain separate. Production database, Stripe,
  and LiveKit credentials must never be copied into Preview.
- After a GitHub ownership transfer, verify that the existing Vercel project's
  Git link resolves to `https://github.com/meelni/meelni-prep`. Preserve the
  existing project and domains rather than creating a duplicate.
- Environment changes require a deployment before they affect the runtime.
- Use `npm run env:pull:preview` and `npm run env:pull:production` for scoped
  local refreshes. Gitignored files are the only local storage target.

## GitHub

Auth:

```bash
gh auth login --web
gh auth status
gh repo view meelni/meelni-prep --json nameWithOwner,url,viewerPermission,visibility
```

Guardrails:

- The canonical public URL is `https://github.com/meelni/meelni-prep`.
- Confirm the authenticated operator, repository owner, current branch, diff,
  and intended remote before any write.
- Never print or document the keyring token returned by GitHub CLI.
- Install third-party GitHub Apps for only this repository and verify selected
  repository mode through the authenticated organization installation view.
- Repository settings, protections, secrets, variables, visibility, branch
  deletion, and force-push history replacement require explicit owner scope.
- Production deploys follow reviewed merges to `main`; do not promote an
  arbitrary branch as a substitute.

## PostHog

Environment variables:

- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `ANALYTICS_PSEUDONYM_KEY`

Guardrails:

- A browser project key is public; a personal API key is secret and must live
  only in provider-managed or deployment secret storage.
- Analytics changes must preserve explicit consent, pseudonymous identities,
  disabled replay/autocapture, and the closed event allowlist.
- Rotate any personal API key that enters Git history, then update every
  environment that used it and review provider audit activity.

## Stripe

Auth and read-only verification:

```bash
stripe login
stripe products list --limit 3
stripe products list --live --limit 3
```

Environment variables:

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_INTERVIEW_PASS_PRICE_ID`
- `STRIPE_STARTER_MONTHLY_PRICE_ID`
- `STRIPE_PRO_MONTHLY_PRICE_ID`

Guardrails:

- Verify test/live mode and the authenticated account in the provider before
  every mutation. Do not store the account identifier here.
- Live catalog writes require the guarded repository command and the exact
  owner-authorized `MEELNI_PRODUCTION_ACTION_AUTHORIZATION` artifact.
- For Stripe, direct Dashboard creation is not a substitute for the guarded
  repository contract.
- Preview and Production require different webhook endpoints and signing
  secrets. Rotate any secret that enters Git history and redeploy the matching
  environment.
- Before removing legacy prices, inspect active live subscriptions.
- Generate the webhook allowlist with
  `npm run stripe:webhook-events -- --format=json` and verify only sanitized
  endpoint exports.

## LiveKit

Auth and safe verification:

```bash
lk cloud auth
lk project list --json | jq 'map({name: .Name, projectId: .ProjectId, url: .URL})'
```

Environment variables:

- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `NEXT_PUBLIC_LIVEKIT_URL`
- `LIVEKIT_URL`
- `LIVEKIT_INTERVIEW_AGENT_NAME`
- `LIVEKIT_DEMO_AGENT_NAME`

Guardrails:

- Do not paste unfiltered project-list output into evidence; provider output can
  contain API credentials.
- Generic pull-request Preview is web-only. Trusted staging and Production use
  separate provider projects and credentials.
- Resolve deployment IDs from the authenticated intended project immediately
  before use rather than copying them into this runbook.
- Production worker deploys use the signed repository authorization wrappers;
  do not bypass them with raw secret-update commands.

## Supabase

Auth and safe verification:

```bash
supabase login --no-browser --agent no --output-format text
supabase projects list --agent no --output-format text
```

Environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF`

Guardrails:

- Browser URL and anonymous key are public client configuration. Database URLs
  and service-role tokens are secrets.
- Resolve Preview and Production project refs from the authenticated account;
  do not store them in this runbook.
- Preview migrations and Production migrations must pass their corresponding
  fail-closed identity preflight.
- Verify current backups before every live mutation. Destructive data or schema
  work requires explicit authorization and a reviewed recovery procedure.

## Google Sheets

Environment variables:

- `GOOGLE_SHEET_CSV_URL`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_NAME`
- `GOOGLE_SHEETS_API_KEY`
- `GOOGLE_SHEETS_CREDENTIALS_BASE64`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

Verify without writing:

```bash
npm run test:sheets
npm run sync:questions -- --dry-run
```

Keep sheet IDs and published URLs in deployment configuration, not this public
runbook. A Production sync additionally requires its exact owner authorization.

## Inngest

Environment variables:

- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`

Use `npm run dev:local` for local work. Cloud inspection requires an
environment-scoped authenticated session; Production sends require explicit
operational scope.

## Statsig

Environment variables:

- `NEXT_PUBLIC_STATSIG_CLIENT_KEY`
- `NEXT_PUBLIC_STATSIG_ENVIRONMENT`
- `NEXT_PUBLIC_STATSIG_API_URL`
- `MEELNI_REACTIVATION_DEFAULT`
- `MEELNI_RELAUNCH_PHASE`

Resolve the project, gate, reviewers, and GitHub App installation from the
authenticated provider session. Do not record their IDs here. Production gate
enablement and targeting changes remain human-owner actions.

## GitGuardian

Install the GitHub App with access to only `meelni/meelni-prep`. Verify selected
repository mode and an unsuspended installation from the authenticated GitHub
organization view. Do not record workspace or installation IDs here.

## New providers

For a new provider, document only:

- the auth command and safe read-only verification command;
- environment-variable names and secret storage target;
- read/write tooling boundaries;
- Production guardrails and rollback procedure;
- how to resolve the exact resource from an authenticated session.

Keep every returned identifier and secret out of the public repository unless
it is a deliberate public application identifier required by executable source.
