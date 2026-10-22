---
name: meelni-ops-connections
description: Use when working on Meelni operational integrations, external service auth, Vercel envs/deployments, Stripe billing setup, Linear product tickets, MCP connectors, undocumented provider setup, or when an agent needs to rediscover account/project details before changing external systems.
---

# Meelni Ops Connections

Use this skill before changing Meelni external systems. Because the repository
is public, it records safe discovery procedures and guardrails rather than
personal identities, provider resource IDs, account numbers, or workstation
paths.

## Quick Anchors

| System | Canonical target                                                                  |
| ------ | --------------------------------------------------------------------------------- |
| Vercel | Resolve the authenticated `meelni` team project before every operation            |
| Stripe | Resolve and verify the intended test/live account before every operation          |
| Linear | Use the product project/work tracked under `SAV-*` unless the user says otherwise |
| Repo   | Resolve the current Git worktree root; never store a developer home path here     |

## Workflow

1. Run `npm run agent:service -- <service>` to resolve the preferred MCP/CLI/repository boundary and canonical target. Run `npm run agent:doctor -- <service>` when workstation readiness is uncertain.
2. Read `references/connections.md` before authenticating, adding env vars, creating Stripe catalog objects, or filing/updating operational tickets.
3. Prefer installed service-specific skills when they apply:
   - `stripe-best-practices` for Stripe design, billing, webhooks, API version, and security decisions.
   - Vercel skills such as `vercel:env-vars`, `vercel:payments`, or `vercel:deployments-cicd` for platform details.
   - `linear:linear` for issue/project work.
4. Never paste secrets or private operational identifiers into chat, Linear,
   docs, or tracked files. Write only environment-variable names, target
   environment labels, authenticated discovery commands, and redacted summaries.
5. When adding a new MCP/provider, extend `config/agent-integrations.json` and
   `references/connections.md` with the decision boundary, auth command,
   verification command, safe write path, production guardrails, and cleanup
   notes. Keep exact account and resource identifiers in provider-controlled
   configuration rather than this repository.
6. Before finalizing any external-system investigation, run the capture check in `references/connections.md`. If the agent learned a reusable connection/auth/env/deployment detail that was missing or wrong, update the catalog and this skill in the same turn.

## Common Mistakes

- Do not use deprecated Vercel login flags such as `--github`; use the OAuth device flow from `npx vercel@55.0.0 login`.
- Do not point Production Vercel at Stripe test prices.
- Do not delete or archive legacy Stripe prices until live subscriptions are checked.
- Do not assume connector tools can write; some MCPs are read/search only and require CLI or dashboard actions for mutations.
- Do not leave provider/MCP setup knowledge only in chat history; capture reusable discoveries in `references/connections.md`.
