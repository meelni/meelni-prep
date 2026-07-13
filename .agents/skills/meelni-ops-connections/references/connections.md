# Meelni Connection Runbook

Use this reference when an agent needs to connect to, inspect, or safely mutate Meelni external systems.

## Self-Improving Capture Loop

Use this loop whenever a user asks to connect a new MCP/provider, authenticate a service, set operational env vars, debug connector permissions, or perform provider setup that is not already documented here.

1. Before starting, search this file for the provider/system name.
2. If no section exists, investigate normally using the available MCP tools, CLI, dashboard auth, official docs, and service-specific skills.
3. After the connection works, or after a real blocker is identified, update this file before finalizing.
4. Capture only reusable operational knowledge: account/project IDs, auth flow, verification commands, env variable names, tool boundaries, production guardrails, and cleanup rules.
5. Never capture secrets, tokens, raw env values, one-time device codes, private customer data, or transient URLs.
6. In the final response, mention that the runbook was updated and where.

Capture when any of these happened:

- The agent used a provider/MCP not already listed here.
- The agent discovered the canonical account, workspace, project, region, team, or environment.
- The agent had to use a non-obvious auth flow or workaround.
- The agent learned that a connector is read-only, search-only, or requires CLI/dashboard writes.
- The agent found a production safety rule, legacy cleanup dependency, or env propagation step.
- A command, deprecated flow, permission boundary, or verification step was corrected.

Skip capture only when the work used an already-documented path and nothing new was learned.

## Vercel

Canonical target:

- Scope/account observed: `meelnis`
- Project: `meelni/meelni`
- App repo: `/Users/savi/Desktop/Github/meelni-prep`

Auth:

```bash
npx vercel@55.0.0 login
```

Use the OAuth device-flow URL/code printed by the CLI. Do not use deprecated email, `--github`, `--gitlab`, `--bitbucket`, `--oob`, or old team login flows.

Verify:

```bash
npx vercel@55.0.0 whoami
npx vercel@55.0.0 link --yes --project meelni
npx vercel@55.0.0 env ls
```

For local Codex worktrees, link the repo with `npx vercel@55.0.0 link --yes --project meelni`. The observed `meelnis` account behaves as the current personal scope, so passing `--scope meelnis` can be rejected by the Vercel CLI.

Fresh worktree setup should run `npm run setup:local`; when Vercel CLI auth is available, that setup path links the worktree and runs `npm run env:pull` if required env values are missing or still placeholders.

Safe env operations:

```bash
npx vercel@55.0.0 env add NAME preview --yes --force
npx vercel@55.0.0 env add NAME production --yes --force
npx vercel@55.0.0 env rm NAME preview --yes
```

Scoped local refresh and verification:

```bash
npm run env:pull:preview
npm run db:preflight:preview
npm run env:pull:production
npm run db:preflight:production
```

For a fresh unmarked file with several intentionally restored same-environment
values, use `npm run env:adopt:preview` or `npm run env:adopt:production` only
after verifying every provider account/mode. Adoption still requires the local
database project to match the public Supabase project from the scoped Vercel
pull; a database match by itself preserves only database/Supabase credentials.

Guidelines:

- List env names and target environments only; never print env values.
- Enter secret values through the Vercel prompt or provider dashboard; never
  pass them with `--value` because process arguments can be inspected locally.
- Preview refresh writes only `.env.local`; Production refresh writes only
  `.env.production.local`. The refresh validates Supabase project alignment and
  atomically replaces a private `0600` file. It does not scrape deployed sites
  or borrow values across environments.
- Configure the non-secret `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF` in both
  Vercel Preview and Production. Preview refreshes must prove their database
  project differs from that ref; Production refreshes must prove it matches.
  Missing or malformed identity metadata blocks the refresh before replacement.
- Encrypted Vercel values can pull as present-but-blank. A usable value in the
  same existing environment file is preserved. If none exists, restore or
  rotate it from the provider dashboard and update the same Vercel environment;
  never copy a Production database secret into Preview or paste a secret into
  chat.
- Preview/Development can use Stripe test keys and test price IDs.
- Production must use live Stripe keys and live price IDs.
- After env changes, redeploy the affected environment before assuming runtime behavior changed.

## GitHub

Canonical target:

- Account: `saviii`
- App repo: `saviii/meelni-prep`
- Repository ID: `1089904588`
- Canonical user/owner ID: `24397508`
- Local remote: `https://github.com/saviii/meelni-prep.git`

Install, authenticate, and upgrade:

```bash
brew install gh
gh auth login --web
brew upgrade gh
```

Use the browser device flow and store the resulting credential in the macOS keyring. Never record the OAuth token or a one-time device code.

Verify:

```bash
gh auth status
gh repo view --json nameWithOwner,url,viewerPermission
```

The active account should be `saviii`; the Meelni repository should resolve to `saviii/meelni-prep`. Use the GitHub app connector for structured PR and issue operations when available, and local `git`/`gh` for branch-aware workflows, authentication checks, pushes, and GitHub Actions logs.

Production guardrails:

- Confirm the current branch, diff, and intended remote before pushing or opening a PR.
- Do not print or document the keyring token reported by `gh auth status`.
- Do not change repository settings, protections, secrets, or Actions variables without explicit scope from the user.
- SAV-198 paid calibration never trusts the local remote. Its one-time authority
  is hard-bound to GitHub.com, repository `saviii/meelni-prep`/`1089904588`,
  actor `saviii`/`24397508`, and the exact protected ledger ref and genesis OID.
  Follow `docs/operations/evaluation-calibration.md` for the two-ruleset and
  deterministic seed gate. Do not create the real ref or rulesets during tests.
- SAV-198 paid calibration must be launched directly with
  `./scripts/run-evaluation-calibration-live.sh`, never through npm or a Node
  process that inherits credentials. The launcher derives the GitHub token from
  the fixed GitHub CLI after a credential-free readiness handshake and reads
  the OpenAI key from the macOS Keychain service
  `meelni-calibration-openai`. Ambient `GITHUB_TOKEN`,
  `OPENAI_API_KEY`, xtrace, preload, proxy, and TLS override state are rejected
  or stripped before Node starts.

## LiveKit

Canonical target:

- Project alias: `meelni`
- Project ID: `p_419fgt1pbkp`
- WebSocket URL: `wss://meelni-ek4vaisp.livekit.cloud`
- Region observed for Cloud agents: `us-east`
- Interview Cloud agent: `CA_yawKG67rCMG4`
- Demo Cloud agent: `CA_t3sKQEihMQ7x`

Preview isolation target:

- Required CLI alias: `meelni-preview`
- Project creation: LiveKit Cloud dashboard; the CLI only links an existing
  Cloud project
- Project ID and WebSocket URL: capture after dashboard creation; Preview must
  differ from `p_419fgt1pbkp` and `wss://meelni-ek4vaisp.livekit.cloud`
- Fixed dispatch names: `meelni-preview-demo` and
  `meelni-preview-interview`
- A generic local `test` alias (`p_4yfzjfvvpjy`) was observed, but its agent
  inventory returned `401`. Do not use, revoke, or delete it until dashboard
  ownership and resource emptiness are proved.

Auth:

```bash
lk cloud auth
lk project set-default meelni
```

Verify:

```bash
lk project list
lk agent status --id CA_yawKG67rCMG4 --project meelni
lk agent status --id CA_t3sKQEihMQ7x --project meelni
```

Link and safely inventory the dashboard-created Preview project:

```bash
lk cloud auth
lk project list --json | jq '[.[] | {name: .Name, project_id: .ProjectId, url: .URL}]'
lk agent list --project meelni-preview
```

The raw JSON project list includes API keys and secrets. Always project only
safe fields before allowing command output into logs or chat.

Docs MCP:

```bash
codex mcp add --url https://docs.livekit.io/mcp livekit-docs
```

Use the LiveKit Docs MCP for current docs search, page rendering, changelog lookup, Python agent examples, public LiveKit code search, and pricing information. If MCP is unavailable in the current session, use official LiveKit docs and record any reusable setup finding here.

Env and secrets:

- Web app envs: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_URL`, `LIVEKIT_INTERVIEW_AGENT_NAME`, `LIVEKIT_DEMO_AGENT_NAME`
- Cloud agent secrets: `LIVEKIT_INTERVIEW_AGENT_NAME` for the interview agent and `LIVEKIT_DEMO_AGENT_NAME` for the demo agent, plus model/provider secrets such as `OPENAI_API_KEY`
- Values live in Vercel envs and local gitignored `.env.local` files. Do not document raw API keys or secrets.

Operational notes:

- Vercel sensitive values can pull into `.env.local` as blank strings. `npm run env:pull` preserves existing nonblank local LiveKit values when Vercel returns blanks.
- If Vercel env values are questionable, use the authenticated `meelni` LiveKit CLI project as the source of truth and overwrite Vercel Development, Preview, and Production envs.
- After changing Vercel envs, redeploy affected Vercel environments. After changing agent code/secrets, redeploy the corresponding LiveKit Cloud agent.
- Voice-agent deploys require `preview` or `production` explicitly and use
  environment-and-agent-specific external config paths: the
  `MEELNI_LIVEKIT_{PREVIEW,PRODUCTION}_{DEMO,INTERVIEW}_CONFIG` variables.
  Set both `MEELNI_PREVIEW_LIVEKIT_URL` and
  `MEELNI_PRODUCTION_LIVEKIT_URL`, plus the matching
  `MEELNI_LIVEKIT_{PREVIEW,PRODUCTION}_{DEMO,INTERVIEW}_AGENT_ID` variables.
  Run `agent/demo/deploy.sh preview|production` or
  `agent/interview/deploy.sh preview|production`. Before invoking `lk`, each
  script resolves one absolute config path and proves the selected project and
  agent ID exactly match the selected environment and worker. The Preview and
  Production anchors must differ. Tracked TOML files contain no provider
  identifiers. Preview env pulls require a fresh Preview anchor and do not
  preserve a stale local value.
- First Preview agent creation must use
  `python3 agent/shared/bootstrap_livekit_preview.py demo|interview`; the normal
  deploy wrappers require an existing config and agent ID. The bootstrap uses
  separate absolute external config and mode-`0600` secrets paths from
  `MEELNI_LIVEKIT_PREVIEW_{DEMO,INTERVIEW}_{CONFIG,SECRETS_FILE}`, validates
  the fixed Preview alias internally without printing credentials, uses a
  tight child-environment allowlist and bounded CLI timeouts, and emits only
  the safe created agent ID and next expected-ID env name.
- Before the guarded worker version is deployed to the existing Production
  agents, add `MEELNI_ENV_PULL_ENVIRONMENT=production` and
  `MEELNI_PRODUCTION_LIVEKIT_URL`; current secret-name inventory does not show
  either value, so deploying first would fail closed.

## Supabase

Canonical target:

- Project name: `Meelni`
- Project ref: `rarrrwkjuhfyfatcmrkw`
- Project host: `rarrrwkjuhfyfatcmrkw.supabase.co`
- Region: `East US (Ohio)`
- Local browser auth redirects through Supabase OAuth and returns to `http://localhost:3000/auth/callback`.

Auth and link:

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref rarrrwkjuhfyfatcmrkw
```

When the CLI detects a Codex agent terminal and refuses interactive login in JSON output mode, use the manual browser flow:

```bash
supabase login --no-browser --agent no --output-format text
```

Open the one-time URL, authorize it in the browser, and enter the short verification code in the same terminal. Never record the one-time URL, code, or resulting token.

Verify:

```bash
supabase projects list --agent no --output-format text
```

The `Meelni` row should show the linked marker. Link metadata under `supabase/.temp/` is local-only and ignored by Git.

Env and secrets:

- Public browser envs: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Server-only envs: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Values live in Vercel envs and local gitignored `.env.local` files. Do not document raw anon keys, service role keys, database URLs, or tokens.

Operational notes:

- If login redirects to `xxx.supabase.co`, local `.env.local` still has placeholder Supabase values.
- Use `npm run setup:local` or run `npx vercel@55.0.0 link --yes --project meelni` from the worktree, then `npm run env:pull` to refresh local auth envs.
- Restart `npm run dev:local` after env changes so Next.js serves the updated public Supabase URL.
- Shared database tooling uses `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF` as a
  fail-closed identity anchor. `db:preflight:preview` and
  `db:migrate:preview` require a Preview database ref different from the
  declared Production ref. Their Production counterparts require an exact
  match. Loopback PostgreSQL URLs bypass the shared-environment identity check
  so disposable local migration tests and local development remain usable.
- Check provider restore coverage without exposing credentials:

  ```bash
  npx --yes supabase@latest backups list \
    --project-ref rarrrwkjuhfyfatcmrkw --output json
  ```

- As of 2026-07-10, the canonical project reported `pitr_enabled: false` and
  no listed physical backup entries. Do not assume a provider restore point is
  available. Capture a mode-0600 schema-only dump outside the repository before
  additive migrations, and require a stronger data backup before destructive
  data or schema changes.

## Google Sheets

Canonical target:

- Question bank sheet ID: `1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4`
- Primary sync source: `GOOGLE_SHEET_CSV_URL` using the published `gviz` CSV endpoint for `gid=0`
- API fallback tab name: `Form Responses 1`
- Question table: `interview_question`

Verify:

```bash
npm run test:sheets
npm run sync:questions -- --dry-run
```

Production/local checks:

```bash
MEELNI_ENV_FILE=.env.production.local npm run sync:questions -- --dry-run
```

Env and secrets:

- Primary envs: `GOOGLE_SHEET_CSV_URL`, `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_NAME`
- Optional private/API fallback envs: `GOOGLE_SHEETS_API_KEY`, `GOOGLE_SHEETS_CREDENTIALS_BASE64`, `GOOGLE_SHEETS_CREDENTIALS`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SHEET_CSV_URL`, `GOOGLE_SHEET_ID`, and `GOOGLE_SHEET_NAME` are not secrets, but still live in Vercel envs and gitignored local env files.

Operational notes:

- The Google Sheet is currently readable through the published `gviz` CSV endpoint even when the normal export endpoint returns unauthorized.
- `npm run sync:questions` loads `.env.local` by default. Set `MEELNI_ENV_FILE=.env.production.local` to test or run against the production local env file intentionally.
- Vercel sensitive Google values can pull as blank strings. `npm run env:pull` preserves existing nonblank local Google Sheets values when Vercel returns blanks.
- The sync script handles quoted multiline CSV cells and batches database writes. It compares by normalized question text, so rerunning after a partial sync is safe.
- On 2026-06-29, the shared question database was repopulated from the sheet with 3,472 active questions.

## Stripe

Canonical target:

- Account: `acct_1SSreECdoT5hfbsF`
- Existing legacy live setup observed: `Meelni Pro` with old `$29/month` and `$249/year` prices.
- New credit catalog:
  - `interview_pass`: `Meelni Interview Pass`, `$9` one-time, lookup key `meelni_interview_pass_usd`
  - `starter`: `Meelni Starter`, `$19/month`, lookup key `meelni_starter_monthly_usd`
  - `pro`: `Meelni Pro`, `$49/month`, lookup key `meelni_pro_monthly_usd`

Auth:

```bash
stripe login
```

Verify account/read access:

```bash
stripe products list --limit 3
stripe products list --live --limit 3
```

Repo setup command:

```bash
npm run stripe:setup-catalog
STRIPE_SECRET_KEY=sk_live_... npm run stripe:setup-catalog -- --confirm-live
```

Important operational notes:

- Use `stripe-best-practices` before changing billing architecture, webhooks, Checkout, subscriptions, or API versions.
- Stripe CLI login may produce a restricted live `rk_live` key that can read live resources but cannot create Products/Prices through the Stripe SDK. If live catalog creation fails with a permissions error, use a proper `sk_live` secret with product/price write permission or create the products/prices in Dashboard.
- Do not configure Production with test-mode price IDs.
- Before archiving legacy prices, check active live subscriptions:

```bash
stripe subscriptions list --live --status=active --limit=100
```

Webhook guidance:

- Local development can use `stripe listen --forward-to http://localhost:3000/api/webhooks/stripe`.
- Production webhooks should target the production app URL, usually `/api/webhooks/stripe`.
- Treat webhook signing secrets as secrets. Do not paste them into chat or Linear.

## Inngest

Canonical target:

- App ID: `meelni`
- Local dev server UI/API: `http://127.0.0.1:8288`
- Next.js function endpoint: `/api/inngest`

Local development:

```bash
npx inngest-cli@latest dev
npm run dev
```

Verify local server:

```bash
npx inngest-cli@latest api health --raw
```

Env and secrets:

- Cloud event sending requires `INNGEST_EVENT_KEY`.
- Function signature verification requires `INNGEST_SIGNING_KEY`.
- Local dev server sends do not need cloud keys when the app runs in explicit Inngest dev mode.
- `OPENAI_API_KEY` is also required before `feedback/generate.requested` can complete evaluation.

Operational notes:

- `.env.local` can include `VERCEL` and `VERCEL_ENV` metadata from `npm run env:pull`; do not let those make local code infer Inngest cloud mode.
- Vercel encrypted/sensitive values pull as blanks. Preserve existing local `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, and `OPENAI_API_KEY` values when refreshing envs.
- As of 2026-06-29, Vercel had `OPENAI_API_KEY` for Preview/Production and `INNGEST_SIGNING_KEY` for Preview/Production, but no `INNGEST_EVENT_KEY` listed. Production/Preview event dispatch should not be considered ready until a real event key is added.

## Linear

Canonical target:

- Product work should use the product project/work tracked under `SAV-*` unless the user says otherwise.
- Stripe/Vercel operations ticket from this billing work: `SAV-126`.

Guidelines:

- Use Linear tools rather than browser scraping when available.
- Put durable operational blockers and account/project discoveries into the relevant issue as comments.
- When creating new issues for this area, include links to PRs, Vercel project/environment targets, Stripe object IDs, and explicit production guardrails.

## MCP And Future Providers

When adding a new MCP or external provider to this skill, add a section with:

| Field                 | What to record                                                            |
| --------------------- | ------------------------------------------------------------------------- |
| Canonical target      | Account ID, project ID/name, region, workspace, team, or repo             |
| Auth path             | CLI command, connector auth, device flow, or dashboard path               |
| Verify path           | Commands/tools that prove the agent is connected without exposing secrets |
| Read/write boundary   | Which MCP tools can mutate and when CLI/dashboard is required             |
| Secret handling       | Which values are secrets and where they should live                       |
| Production guardrails | What must be checked before changing live systems                         |
| Cleanup               | What legacy objects can be removed only after verification                |

Keep secrets out of the skill. Store only stable IDs, commands, env variable names, and safe operational notes.

Template:

````markdown
## Provider Name

Canonical target:

- Account/workspace/project:
- Repo/app path:
- Environment split:

Auth:

```bash
command or connector flow here
```

Verify:

```bash
safe command that proves connection without printing secrets
```

Read/write boundary:

- MCP/tool can:
- CLI/dashboard required for:

Env and secrets:

- Env variable names:
- Secret storage target:
- Values never documented:

Production guardrails:

- Check before live changes:
- Rollback/cleanup:

Notes:

- Durable discoveries:
````
