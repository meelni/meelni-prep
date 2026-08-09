# Meelni Integrations

This is the human-readable index for Meelni's active runtime and operational
services. The machine-readable agent decision layer is
[`config/agent-integrations.json`](../../config/agent-integrations.json).

Use it through the repository commands rather than reading JSON manually:

```bash
npm run agent:services
npm run agent:service -- <service>
npm run agent:doctor
```

## Interface policy

- Application runtime uses SDKs, provider APIs, webhooks, or OTLP.
- Agents use MCP/apps for structured investigation when the connection is
  correctly scoped.
- Agents use provider CLIs or repository commands for deterministic,
  repeatable work.
- Provider writes should prefer the existing repository workflow. Production,
  billing, destructive, launch, and live-mode actions retain their explicit
  authorization boundaries.
- Setup and diagnostics never print credential values.

## Active service map

| Service             | Runtime role                                         | Preferred agent surface                                                                 |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Supabase / Postgres | Auth, database, RLS, migrations                      | Repository commands and Supabase CLI; Preview-scoped read-only MCP for investigation    |
| LiveKit             | Rooms, tokens, dispatch, Python voice workers        | Docs MCP for current knowledge, `lk` for inspection, guarded repository deploy wrappers |
| OpenAI              | Feedback evaluation and interview dialogue           | Repository tests/calibration; SDK or LiveKit inference at runtime                       |
| Stripe              | Checkout, subscriptions, credits, webhooks           | MCP for scoped reads/docs, CLI for local webhooks, repository workflows for writes      |
| Inngest             | Feedback, recovery, cleanup, insights, deletion jobs | Local MCP for dev runs; environment-scoped CLI/API for cloud investigation              |
| Statsig             | Relaunch access and evaluation                       | MCP for read-only evidence; owner-governed provider writes                              |
| PostHog             | Consent-gated analytics                              | PostHog app for analysis; repository tests for event behavior                           |
| Comet Opik          | Optional LLM/voice observability                     | Hosted OAuth MCP for investigation; HTTP/OTLP for runtime ingestion                     |
| Google Sheets       | PM question source                                   | Sheets app for inspection; authenticated repository sync workflow for writes            |
| Vercel              | Web deployments and environment configuration        | Repository-pinned Vercel CLI                                                            |
| GitHub              | Source, PRs, checks, Actions                         | `git`/`gh` for branch-aware work; GitHub app/MCP for structured reads                   |
| Linear              | Workstream tracking and evidence                     | Linear app/MCP plus the Meelni Linear skill                                             |
| GitGuardian         | Repository secret scanning                           | GitHub App checks verified through `gh`                                                 |

Deepgram, Cartesia, and ElevenLabs are voice-model providers reached through
the reviewed LiveKit runtime configuration. They are not independent agent
operation surfaces in this repository. Resend and Sentry environment names are
reserved in setup tooling but no active product adapter should be inferred
from those placeholders.

## Safety-sensitive boundaries

### Supabase

The agent MCP target is the isolated Preview project
`kxpvidtxznllfosfemdl`, with both `project_ref` and `read_only=true`. An
unscoped `https://mcp.supabase.com/mcp` connection can reach every project the
operator can access and is not the Meelni default. Database writes use the
scoped aliases and [database migration runbook](../operations/database-migrations.md).

### LiveKit

The Docs MCP is documentation-only. Cloud inspection uses `lk`; Production
worker deploys use the signed repository wrappers described by the
[Production action authorization runbook](../operations/production-action-authorization.md).

### Stripe

MCP can write as well as read. Keep write calls confirmation-gated and verify
test/live mode plus account identity before every operation. Live catalog
changes and exceptional billing actions remain behind their dedicated
runbooks.

### Statsig

Read-only technical evidence never constitutes launch approval. The human
product owner controls Production/default-on action under the accepted launch
decision and [Statsig governance runbook](../operations/statsig-relaunch-governance.md).

### Opik and PostHog

Both surfaces can contain sensitive product telemetry. Preserve the explicit
content-capture, redaction, analytics-consent, retention, and access contracts.

## Detailed runbooks

- [LiveKit integration](./livekit.md)
- [Google Sheets source](./google-sheets-setup.md)
- [Local Inngest](./inngest/setup.md)
- [Stripe quick reference](./stripe/quick-reference.md)
- [PostHog event catalog](./posthog/events.md)
- [Opik observability](../operations/opik-observability.md)
- [Deployment preflight](../operations/deployment-preflight.md)
- [Agent and local tooling](../operations/tooling.md)

Stable account/project anchors, authentication commands, and verification
details live in the canonical Meelni ops-connections runbook. If an agent learns
a reusable provider fact that is missing or wrong, it updates that runbook and
the catalog in the same change.
