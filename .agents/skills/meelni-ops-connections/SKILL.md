---
name: meelni-ops-connections
description: Use when working on Meelni operational integrations, external service auth, Vercel envs/deployments, Stripe billing setup, Linear product tickets, MCP connectors, undocumented provider setup, or when an agent needs to rediscover account/project details before changing external systems.
---

# Meelni Ops Connections

Use this skill before changing Meelni external systems. It records stable account/project anchors and creates an operational memory loop: when an agent has to investigate a new provider/MCP connection, it captures the working path here before finishing.

## Quick Anchors

| System | Canonical target                                                                            |
| ------ | ------------------------------------------------------------------------------------------- |
| Vercel | Project `meelni/meelni`; use `npx vercel@55.0.0` device-flow login                          |
| Stripe | Account `acct_1SSreECdoT5hfbsF`; use Stripe CLI or Stripe MCP depending on read/write needs |
| Linear | Use the product project/work tracked under `SAV-*` unless the user says otherwise           |
| Repo   | `/Users/REDACTED/Desktop/Github/meelni-prep` for the Milni/Meelni product app                   |

## Workflow

1. Run `npm run agent:service -- <service>` to resolve the preferred MCP/CLI/repository boundary and canonical target. Run `npm run agent:doctor -- <service>` when workstation readiness is uncertain.
2. Read `references/connections.md` before authenticating, adding env vars, creating Stripe catalog objects, or filing/updating operational tickets.
3. Prefer installed service-specific skills when they apply:
   - `stripe-best-practices` for Stripe design, billing, webhooks, API version, and security decisions.
   - Vercel skills such as `vercel:env-vars`, `vercel:payments`, or `vercel:deployments-cicd` for platform details.
   - `linear:linear` for issue/project work.
4. Never paste secrets into chat, Linear, docs, or tracked files. Write only env variable names, target environments, IDs that are safe to share, and redacted summaries.
5. When adding a new MCP/provider, extend `config/agent-integrations.json` and `references/connections.md` with the decision boundary, canonical target, auth command, verification command, safe write path, production guardrails, and cleanup notes.
6. Before finalizing any external-system investigation, run the capture check in `references/connections.md`. If the agent learned a reusable connection/auth/env/deployment detail that was missing or wrong, update the catalog and this skill in the same turn.

## Common Mistakes

- Do not use deprecated Vercel login flags such as `--github`; use the OAuth device flow from `npx vercel@55.0.0 login`.
- Do not point Production Vercel at Stripe test prices.
- Do not delete or archive legacy Stripe prices until live subscriptions are checked.
- Do not assume connector tools can write; some MCPs are read/search only and require CLI or dashboard actions for mutations.
- Do not leave provider/MCP setup knowledge only in chat history; capture reusable discoveries in `references/connections.md`.
