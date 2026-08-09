# Meelni

Meelni is live PM interview practice: real PM interview questions, realistic
voice mock interviews, PM-calibrated feedback, and practice progress over time.

The current application is a root Next.js app with a Python LiveKit Agents
runtime under `agent/`. Shared contracts are migrating incrementally into
`packages/core`, `packages/agent`, `packages/integrations`, and
`packages/test-fixtures`; the root app remains canonical until the staged
`apps/web` migration is ready.

## Start here

Use the exact Node version in `.node-version`, then bootstrap a new worktree:

```bash
fnm install 22.22.0
fnm use 22.22.0
npm run bootstrap:worktree
```

Provider-free setup is intentional. When provider-backed runtime work is
needed, link the canonical Vercel project and pull only Preview configuration:

```bash
npx vercel@55.0.0 link --yes --project meelni --scope meelni
npm run env:pull:preview
npm run doctor:runtime
```

Never paste secrets into chat or tracked files. Local values belong in
gitignored `.env.local` files and provider secret managers.

Start the normal local stack with:

```bash
npm run dev:local
```

This starts Next.js, local Inngest, and the Python LiveKit worker when its
environment is configured.

## Coding agents

Read [AGENTS.md](./AGENTS.md) before making changes. Meelni-specific skills live
under `.agents/skills/` and are symlinked into Codex and Claude.

The integration catalog gives agents one safe discovery entrypoint:

```bash
npm run agent:services
npm run agent:service -- supabase
npm run agent:doctor
```

The catalog records each service's preferred MCP/CLI/repository boundary,
canonical targets, safe commands, environment variable names, write policy,
and runbooks. The doctor checks local CLI and MCP configuration without reading
or printing credential values.

## Current architecture

```text
Next.js web app (Vercel)
  ├─ Supabase Auth + PostgreSQL/Drizzle
  ├─ Stripe billing and signed webhooks
  ├─ Inngest durable background jobs
  ├─ Statsig relaunch access and consent-gated evaluation
  ├─ PostHog consent-gated analytics
  ├─ Google Sheets question-source sync
  └─ OpenAI feedback evaluation + optional Opik traces

Python LiveKit Agents
  ├─ explicit demo/interview dispatch
  ├─ Deepgram speech recognition
  ├─ OpenAI interview dialogue
  ├─ Cartesia or ElevenLabs speech through reviewed runtime config
  └─ sanitized optional Opik OTLP traces
```

Provider traffic enters product behavior through explicit workflows and
integration boundaries. MCP is an agent investigation surface, never an
application runtime dependency.

## Common commands

```bash
npm run doctor:setup       # provider-free workstation readiness
npm run doctor:runtime     # strict local runtime configuration
npm run dev:local          # complete local stack
npm run typecheck          # application TypeScript
npm run lint               # ESLint
npm run test:local         # repository tooling tests
npm run verify:agent       # full agent-authored change verification
```

Database and Production operations are deliberately guarded. Do not replace
the scoped aliases and runbooks with ambient `DATABASE_URL`, `db:push`, direct
provider writes, or ad hoc deployment commands.

## Documentation

- [Integration index](./docs/integrations/README.md)
- [Local and agent tooling](./docs/operations/tooling.md)
- [Architecture principles](./docs/architecture/codebase-principles.md)
- [Current decisions](./docs/decisions/current.md)
- [Behavior contracts](./docs/contracts/README.md)
- [Operations runbooks](./docs/operations/)
- [Python voice runtime](./agent/README.md)
- [Product requirements](./.claude/PRD.md)

Only the human product owner makes the final launch GO/NO-GO decision.
Automated gates and coding agents provide evidence; they do not authorize
Production/default-on action.

## License

Private project. All rights reserved.
