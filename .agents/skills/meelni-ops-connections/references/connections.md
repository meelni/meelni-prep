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

- Team scope: `meelni` (Pro)
- Account login: `contact@meelni.com`
- Project: `meelni/meelni` (`prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4`)
- Dashboard: `https://vercel.com/meelni/meelni`
- GitHub repository: `meelni/meelni-prep`
- App repo: `/Users/REDACTED/Desktop/Github/meelni-prep`

Auth:

```bash
npx vercel@55.0.0 login
```

Use the OAuth device-flow URL/code printed by the CLI. Do not use deprecated email, `--github`, `--gitlab`, `--bitbucket`, `--oob`, or old team login flows.

Verify:

```bash
npx vercel@55.0.0 whoami
npx vercel@55.0.0 teams ls
npx vercel@55.0.0 project inspect meelni --scope meelni
npx vercel@55.0.0 link --yes --project meelni --scope meelni
npx vercel@55.0.0 env ls
```

The personal CLI identity `meelnis` is not authoritative for Meelni operations.
Do not inspect or mutate the project through that identity even if it can see the
project. Authenticate as `contact@meelni.com`, verify the `meelni` team scope and
dashboard URL, and then link local worktrees with
`npx vercel@55.0.0 link --yes --project meelni --scope meelni`.

After a GitHub repository ownership transfer, inspect the Vercel project's Git
link before assuming the integration followed the repository. A retained link
to the former owner or a `sourceless` link must be reconnected from the verified
`meelni` team session; do not create a duplicate Vercel project.

Private repositories owned by a GitHub organization require a Vercel Pro team.
After the `Meelni` team was upgraded to Pro on 2026-07-15, the existing
`meelni` project's retained Git link still targeted the repository's former
owner URL even though its label showed `meelni/meelni-prep`. Disconnect and
reconnect Git from that existing project's Git settings, select the `meelni`
GitHub namespace, and connect `meelni-prep`; the resulting link must resolve to
`https://github.com/meelni/meelni-prep`. Preserve the project and its domains;
do not work around connection problems by creating a duplicate project, moving
the repository back to a personal account, or making it public. Prove the
connection with a fresh non-Production pull-request event before relying on
Preview checks.

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
- Do not use a broad project Runtime Log drain as the SAV-215 operational-event
  receiver. Vercel drains forward every selected log source, not only the
  closed `meelni_operational_failure@1` event. A receiver must select that
  closed event before external retention, or every additional selected server
  log source requires a separate privacy review.

Custom staging environment:

- Vercel custom environment `staging` (ID
  `env_h7GlGHRbEHNe8xdyyc1q5ebdknaI`) is the canonical isolated provider
  integration and launch-rehearsal target.
- It is a Preview-type environment bound to the persistent Git branch
  `codex/staging`. Its stable Vercel alias is
  `meelni-env-staging-meelni.vercel.app`.
- List the active target and branch binding with
  `npx vercel@latest target ls --scope meelni --project meelni`.
- Keep staging provider secrets scoped to the `staging` custom environment; do
  not use branch-only overrides as the durable configuration and do not
  overwrite the separate Production values.
- A push to `codex/staging` creates the trusted Git deployment identity that
  deployment preflight requires. Keep the branch tree aligned with the exact
  application head being rehearsed and record both commit and tree identity in
  evidence.
- The staging environment remains fail-closed under the normal Preview product
  controls. Creating or updating the environment does not authorize a
  relaunch-gate change.

## GitHub

Canonical target:

- Authenticated operator account: `saviii`
- Enterprise Cloud organization: `meelni`
- App repo: `meelni/meelni-prep`
- Repository ID: `1089904588`
- Canonical owner ID: `302571838`
- Local remote: `https://github.com/meelni/meelni-prep.git`

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

The active operator account should be `saviii`; the Meelni repository should
resolve to `meelni/meelni-prep`, whose organization plan reports `enterprise`.
Use the GitHub app connector for structured PR and issue operations when
available, and local `git`/`gh` for branch-aware workflows, authentication
checks, pushes, and GitHub Actions logs.

Billing and Actions policy:

- The `meelni` Enterprise account was activated as paid on 2026-07-15. Verify
  paid state from Enterprise -> Billing and licensing; the organization API's
  `enterprise` plan label alone does not distinguish a trial from paid billing.
- The plan includes 50,000 Actions minutes per billing cycle. Do not treat that
  allowance as permission to restore unattended schedules or duplicate runs.
- `meelni/meelni-prep` has a repository-scoped Actions product budget of $10 per
  month, with usage stopped at the limit and owner alerts at 75%, 90%, and 100%.
  Keep included-usage alerts enabled. Change this cap only with owner approval.
- Draft PR synchronization should allocate at most the one combined dependency
  audit. Full hosted Validate remains merge-ready or manually dispatched work.

Repository transfer and CI recovery:

- Disable `Relaunch Integration Gates` before any ownership or billing migration.
- Keep it disabled until `.github/stacked-prs.json` names the current repository
  owner and the default branch contains the cost-controlled trigger policy.
- Do not restore unattended schedules. Draft body/title edits must not allocate
  hosted publisher runners; draft branch/base movement uses one combined
  dependency audit. Use `workflow_dispatch` for a deliberate full sweep.
- After a transfer, update the shared Git remote and verify open PRs, branch
  protection, rulesets, environments, webhooks, and GitHub App checks before
  re-enabling hosted publication.
- Install third-party GitHub Apps with `Only select repositories` and select
  only `meelni/meelni-prep`. Verify the organization installation with
  `gh api orgs/meelni/installations`; `repository_selection` must be `selected`
  and `suspended_at` must be null. Repository enumeration may require an
  additional `read:user` OAuth scope, so the GitHub installation settings page
  is the authoritative fallback for confirming the selected repository.

Production guardrails:

- Confirm the current branch, diff, and intended remote before pushing or opening a PR.
- Do not print or document the keyring token reported by `gh auth status`.
- Do not change repository settings, protections, secrets, or Actions variables without explicit scope from the user.
- SAV-198 paid calibration never trusts the local remote. Its one-time authority
  is hard-bound to GitHub.com, repository `meelni/meelni-prep`/`1089904588`,
  organization owner `meelni`/`302571838`, authorized actor `saviii`/`24397508`,
  and the exact protected ledger ref and genesis OID.
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

## Statsig

Canonical target:

- Project ID: `01k0KuJePjFDEf80vuH61R`
- Relaunch gate: `meelni_reactivation_access`
- Gate owner: `Savi Singh <contact@meelni.com>`
- Owner Statsig user ID: `7spxjTLm7lyPibNJavcTmx`
- Gate URL:
  `https://console.statsig.com/01k0KuJePjFDEf80vuH61R/gates/meelni_reactivation_access`

Safe read-only verification:

- Read gate details for `meelni_reactivation_access`.
- List gate eligible reviewers.
- List gate reviews.

Current SAV-283 evidence from 2026-07-23:

- Gate status: `Disabled`
- `isEnabled: false`
- Rules: empty
- Owner: `contact@meelni.com`
- `reviewSettings.requiredReview: false`
- `reviewSettings.allowedReviewers: []`
- Eligible reviewers: `everyone_eligible: false`, owner user
  `7spxjTLm7lyPibNJavcTmx` / `contact@meelni.com`, groups empty
- Gate review `6Uip5thkTs2D7ascrYKYkQ` committed an `allowed_reviewers`
  change limiting gate reviewers to the owner account
- Dynamic config `meelni_preview_rehearsal_authority` remains disabled with
  `defaultValue.active: false`; review `QHCBMD2kK9ZIwA4hXmdzP` committed an
  `allowed_reviewers` change limiting config reviewers to the owner account
- Caveat: the gate detail endpoint still reports
  `reviewSettings.requiredReview: false`, so required-review enforcement is not
  proven even though the eligible-reviewers endpoint now returns owner-only.

GitHub App:

- In Statsig, open **Settings > Integrations > GitHub App**, then enable the
  connection for the `meelni` GitHub organization.
- Canonical `statsig-code` GitHub App installation ID: `147430568`. Verify the
  organization, selected-repository mode, and permissions without exposing
  credentials with:

  ```bash
  gh api /orgs/meelni/installations \
    --jq '.installations[] | select(.app_slug=="statsig-code") | {id, app_slug, account: .account.login, repository_selection, permissions}'
  ```

- Select **Only select repositories** and grant access only to
  `meelni/meelni-prep`; do not use the default all-current-and-future-repos
  scope.
- GitHub requires a sudo-mode passkey or equivalent second-factor confirmation
  before completing the installation. After authorization returns to Statsig,
  verify that the integration lists only `meelni/meelni-prep`.
- If GitHub shows the repo-scoped `statsig-code` installation but Statsig still
  shows **Enable Connection**, the installation callback was not associated
  with the Statsig project. Statsig cannot adopt that orphaned installation into
  the same project. With explicit approval to remove and restore the external
  permission, uninstall installation `147430568`, immediately restart
  **Enable Connection** from `meelni-com`, reinstall for only
  `meelni/meelni-prep`, and verify the Statsig integration reports connected.

Production guardrails:

- Get explicit owner approval before creating, approving, committing, or
  cancelling future gate/config reviews. The owner-only reviewer mutations above
  were committed on 2026-07-23; future launch rehearsal or enablement still
  requires a separate owner authorization.
- Do not use direct full-gate update APIs for relaunch-governance work unless a
  provider limitation makes the review API impossible and the owner has approved
  that exact fallback.
- Do not enable `meelni_reactivation_access`, add targeting rules, change
  fallback defaults, or authorize launch while configuring review governance.
- Owner-only eligible reviewers are now configured. If Statsig cannot separately
  require review while preserving that owner-only constraint, stop and record
  the exact limitation; do not claim SAV-283 complete from eligibility alone.

## LiveKit

Canonical target:

- Project alias: `meelni`
- Project ID: `p_419fgt1pbkp`
- WebSocket URL: `wss://meelni-ek4vaisp.livekit.cloud`
- Region observed for Cloud agents: `us-east`
- Interview Cloud agent: `CA_yawKG67rCMG4`
- Demo Cloud agent: `CA_t3sKQEihMQ7x`
- Isolated Preview project: `meelni-preview` (`p_16unz4e48is`)
- Preview WebSocket host: `meelni-preview-dk7443ua.livekit.cloud`
- Preview interview deployment: `CA_ZbGxFjfEYwsD`, dispatch name
  `meelni-preview-interview`
- Preview demo deployment: `CA_M5XTD4CMyXk3`, dispatch name
  `meelni-preview-demo`

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

Docs MCP:

```bash
codex mcp add --url https://docs.livekit.io/mcp livekit-docs
```

Use the LiveKit Docs MCP for current docs search, page rendering, changelog lookup, Python agent examples, public LiveKit code search, and pricing information. If MCP is unavailable in the current session, use official LiveKit docs and record any reusable setup finding here.

Env and secrets:

- Web app envs: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_URL`, `LIVEKIT_INTERVIEW_AGENT_NAME`, `LIVEKIT_DEMO_AGENT_NAME`
- Cloud agent secrets: `LIVEKIT_INTERVIEW_AGENT_NAME` for the interview agent and `LIVEKIT_DEMO_AGENT_NAME` for the demo agent, plus model/provider secrets such as `OPENAI_API_KEY`
- Values live in Vercel envs and local gitignored `.env.local` files. Do not document raw API keys or secrets.
- Preview/Production deploy checks use `npm run deploy:preflight:preview` and
  `npm run deploy:preflight:production`. They are read-only; LiveKit smoke
  sessions remain separately authorized rehearsal work.

Operational notes:

- Vercel sensitive values can pull into `.env.local` as blank strings. `npm run env:pull` preserves existing nonblank local LiveKit values when Vercel returns blanks.
- If Vercel env values are questionable, use the authenticated `meelni` LiveKit CLI project as the source of truth and overwrite Vercel Development, Preview, and Production envs.
- For the Vercel `staging` custom environment, use only the authenticated
  `meelni-preview` CLI project as the credential source. A LiveKit plan change
  or key rotation can leave the deployed staging pair stale even when the URL
  and dispatch names still match. Restore `LIVEKIT_API_KEY` and
  `LIVEKIT_API_SECRET` to `staging` without printing their values, redeploy the
  same reviewed commit, and require `PASS livekit.project.read_only` before a
  rehearsal. Never copy the default `meelni` Production pair into staging.
- After changing Vercel envs, redeploy affected Vercel environments. After changing agent code/secrets, redeploy the corresponding LiveKit Cloud agent.
- Require `LIVEKIT_INTERVIEW_AGENT_NAME` and `LIVEKIT_DEMO_AGENT_NAME` in every
  worker mode, including local development. An unnamed worker opts into
  LiveKit automatic dispatch and can create an empty-name dispatch in any new
  room. Room creation must carry one explicit `RoomAgentDispatch` atomically;
  do not create a plain room and add a named dispatch afterward. Re-list and
  require exactly one nonblank matching dispatch before exposing a token.

## Supabase

Canonical target:

- Production project: `Meelni`
- Production project ref: `rarrrwkjuhfyfatcmrkw`
- Production project host: `rarrrwkjuhfyfatcmrkw.supabase.co`
- Preview project: `meelni-preview`
- Preview project ref: `kxpvidtxznllfosfemdl`
- Preview GitHub integration: `meelni/meelni-prep`, working directory `.`,
  production branch `main`
- Organization plan: Pro, with Spend Cap enabled
- Preview branching: automatic, maximum 1 branch, `Supabase changes only`
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
- The GitHub App must be installed with access only to
  `meelni/meelni-prep`. Enable the GitHub integration from the
  `meelni-preview` project, never from the Production `Meelni` project during
  Preview-only connection work. Supabase labels the preview project's own
  `main` database as "Production" inside that project; verify the project ref
  `kxpvidtxznllfosfemdl` before accepting that label.
- Automatic branching is limited to one branch and only runs when Supabase
  files change. Branch compute is not covered by the organization's Spend Cap,
  so keep the limit at one unless the owner explicitly approves broader
  concurrency. A docs-only PR should produce an intentional skipped Supabase
  check; use a safe Supabase-scoped change when an actual preview database must
  be rehearsed.
- Check provider restore coverage without exposing credentials:

  ```bash
  npx --yes supabase@latest backups list \
    --project-ref rarrrwkjuhfyfatcmrkw --output json
  ```

- As of 2026-07-16, the paid canonical project reported seven completed daily
  physical backups and `pitr_enabled: false`. Verify current backup status
  before every live mutation rather than assuming this observation is still
  current. Capture a mode-0600 schema-only dump outside the repository before
  additive migrations, and require explicit authorization plus a reviewed
  recovery procedure before destructive data, schema, or migration-ledger
  changes.

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
- `npm run sync:questions` loads `.env.local` by default. Production dry-run still requires canonical environment identity. Production live sync additionally requires `MEELNI_PRODUCTION_ACTION_AUTHORIZATION` pointing to the exact external owner-signed artifact; the HTTP and scheduled Production paths remain inert.
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
MEELNI_PRODUCTION_ACTION_AUTHORIZATION=/absolute/private/authorization.json STRIPE_SECRET_KEY=sk_live_... npm run stripe:setup-catalog -- --confirm-live
```

Important operational notes:

- Use `stripe-best-practices` before changing billing architecture, webhooks, Checkout, subscriptions, or API versions.
- Stripe CLI login may produce a restricted live key that can read live resources but cannot create Products/Prices through the Stripe SDK. Live catalog mutation is allowed only through the guarded repository command with the exact owner artifact; direct Dashboard creation is not a substitute.
- Do not configure Production with test-mode price IDs.
- Before archiving legacy prices, check active live subscriptions:

```bash
stripe subscriptions list --live --status=active --limit=100
```

Webhook guidance:

- Local development can use `stripe listen --forward-to http://localhost:3000/api/webhooks/stripe`.
- Production webhooks should target the production app URL, usually `/api/webhooks/stripe`.
- Treat webhook signing secrets as secrets. Do not paste them into chat or Linear.
- The canonical Stripe test-mode webhook endpoint is
  `we_1TuSuvCdoT5hfbsFbmsubdFW`. It targets the stable Vercel staging alias at
  `/api/webhooks/stripe` and uses the project automation-bypass query without
  documenting its secret value.
- Its signing secret is stored only as `STRIPE_WEBHOOK_SECRET` in the Vercel
  `staging` custom environment. After rotating the endpoint or secret, redeploy
  `codex/staging` before sending a receipt.
- Do not point the test endpoint at an ephemeral PR/branch deployment. The old
  branch-pinned test endpoint was deleted after the canonical staging receiver
  returned signed `200` receipts on 2026-07-18.
- Preview and Production must use different webhook endpoints and signing
  secrets. Never replace the Production signing secret while repairing the
  staging/test receiver.
- Generate the canonical 16-required/one-optional endpoint allowlist with
  `npm run stripe:webhook-events -- --format=json`. Verify a sanitized endpoint
  export with
  `npm run stripe:webhook-events -- --verify-enabled-events-file=/absolute/path/to/sanitized-endpoint.json`.
  The evidence file should contain only an event array or `enabled_events`;
  never include the endpoint signing secret, credentials, or delivery payloads.
- A successful payment receipt is not proof that refund and dispute events are
  configured. Missing required events, wildcard delivery, or unrelated enabled
  events fail the executable contract and stop billing rehearsal acceptance.

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
- Workspace URL slug: `saviiii`
- GitHub organization: `meelni`
- GitHub repository: `meelni/meelni-prep`

Guidelines:

- Use Linear tools rather than browser scraping when available.
- Put durable operational blockers and account/project discoveries into the relevant issue as comments.
- When creating new issues for this area, include links to PRs, Vercel project/environment targets, Stripe object IDs, and explicit production guardrails.
- The current GitHub connection flow installs the `linear-code` GitHub App;
  install it with access only to `meelni/meelni-prep`. The legacy `linear` app
  can also appear during callback/setup flows. Do not assume the workspace link
  is complete merely because either app is installed: verify `meelni` appears
  under Settings -> Integrations -> GitHub -> Connected organizations, then
  prove a fresh `SAV-*` pull request links back to its Linear issue.
- As of 2026-07-15, the `saviiii` workspace lists both `meelni` and
  `nomu-labs` as connected organizations. Meelni verification must use a
  `meelni/meelni-prep` PR and a `SAV-*` issue; the unrelated `nomu-labs`
  connection is not evidence for this repository.

## GitGuardian

Canonical target:

- Workspace ID: `839712`
- GitHub organization: `meelni`
- GitHub repository: `meelni/meelni-prep`

Auth and connection:

- Install the `gitguardian` GitHub App on `meelni`.
- Choose `Only select repositories` and select only `meelni-prep`.
- Authenticate GitGuardian with the existing GitHub operator account, then link
  the `meelni` organization to the existing GitGuardian workspace. Do not
  create a second workspace when an existing workspace is available.

Verify:

```bash
gh api orgs/meelni/installations \
  --jq '.installations[] | select(.app_slug == "gitguardian") | {id, repository_selection, suspended_at}'
```

The result must report `repository_selection: selected` and
`suspended_at: null`. A fresh draft PR is the end-to-end proof that GitGuardian
can publish its security check for the transferred repository.

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
