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
- App repo: `/Users/REDACTED/Desktop/Github/meelni-prep`

Auth:

```bash
npx vercel@latest login
```

Use the OAuth device-flow URL/code printed by the CLI. Do not use deprecated email, `--github`, `--gitlab`, `--bitbucket`, `--oob`, or old team login flows.

Verify:

```bash
npx vercel@latest whoami
npx vercel@latest env ls
```

Safe env operations:

```bash
npx vercel@latest env add NAME preview --value "$VALUE" --yes --force
npx vercel@latest env add NAME production --value "$VALUE" --yes --force
npx vercel@latest env rm NAME preview --yes
```

Guidelines:

- List env names and target environments only; never print env values.
- Preview/Development can use Stripe test keys and test price IDs.
- Production must use live Stripe keys and live price IDs.
- After env changes, redeploy the affected environment before assuming runtime behavior changed.

## LiveKit

Canonical target:

- Project alias: `meelni`
- Project ID: `p_419fgt1pbkp`
- WebSocket URL: `wss://meelni-ek4vaisp.livekit.cloud`
- Region observed for Cloud agents: `us-east`
- Interview Cloud agent: `CA_yawKG67rCMG4`
- Demo Cloud agent: `CA_t3sKQEihMQ7x`

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

Env and secrets:

- Web app envs: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_URL`, `LIVEKIT_INTERVIEW_AGENT_NAME`, `LIVEKIT_DEMO_AGENT_NAME`
- Cloud agent secrets: `LIVEKIT_INTERVIEW_AGENT_NAME` for the interview agent and `LIVEKIT_DEMO_AGENT_NAME` for the demo agent, plus model/provider secrets such as `OPENAI_API_KEY`
- Values live in Vercel envs and local gitignored `.env.local` files. Do not document raw API keys or secrets.

Operational notes:

- Vercel sensitive values can pull into `.env.local` as blank strings. `npm run env:pull` preserves existing nonblank local LiveKit values when Vercel returns blanks.
- If Vercel env values are questionable, use the authenticated `meelni` LiveKit CLI project as the source of truth and overwrite Vercel Development, Preview, and Production envs.
- After changing Vercel envs, redeploy affected Vercel environments. After changing agent code/secrets, redeploy the corresponding LiveKit Cloud agent.

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
