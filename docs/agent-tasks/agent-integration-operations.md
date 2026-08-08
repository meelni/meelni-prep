# Agent Integration Operations

## Intent

- User request: Deeply audit Meelni's integrations and make service operations efficient for coding agents.
- Product/user outcome: An agent can discover the correct service, target, MCP/CLI/SDK boundary, safe command, and runbook without reconstructing the system from scattered files.
- Why now: The repository has many active integrations and strong provider-specific guardrails, but its primary integration index is stale and operational knowledge is split across scripts, docs, environment contracts, and skills.

## Slice

- Primary slice: Agent Experience And Tooling.
- Secondary slices: Provider integration architecture and engineering memory.
- Relevant skills: `meelni-codebase-architecture`, `meelni-ops-connections`, `meelni-engineering-memory`, and `meelni-vertical-slice-playbooks`.

## Linear Tracking

- Project: Not assigned; this work was requested directly in the Codex goal thread.
- Parent slice issue: None.
- Child deliverable issue: None.
- Current Linear state: Not tracked in Linear.

## Scope

- In scope: Inventory active and operational services; define the MCP/CLI/repository-script/runtime boundary; add one machine-readable catalog and one read-only agent command; validate referenced commands, docs, and safe MCP configuration; replace the stale integration index; update agent guidance and runbooks.
- Out of scope: Provider mutations, Production enablement, credential creation or rotation, application behavior changes, package relocation, and installing every optional MCP globally.
- Assumptions: Repository scripts remain the preferred mutation path; MCP is primarily an investigation surface; runtime traffic continues through SDK/API adapters.

## Product Lens

- Audience: Coding agents and maintainers working on Meelni.
- Activation/retention/monetization/growth lever: Development velocity and operational reliability.
- Product Compass note: This work supports the existing PM interview product and does not broaden product scope.

## Technical Plan

- Likely app files: None.
- Likely package/workflow files: `config/agent-integrations.json`, a focused script under `scripts/`, `package.json`, and targeted script tests.
- Data or provider dependencies: Read-only local inspection of installed CLIs and Codex MCP registrations; no provider calls or secrets.
- Docs/decisions to update: `AGENTS.md`, `docs/integrations/README.md`, `docs/operations/tooling.md`, and the ops-connections skill/runbook. No new architecture decision is expected unless implementation changes a durable system boundary.

## Validation

- Required commands: Targeted agent-integration tests, `npm run validate:skills`, `npm run test:local`, and `npm run verify:agent`.
- Optional/manual checks: Run the integration list, detail, and doctor commands against the current workstation's CLI/MCP setup.
- Fixtures or regression tests needed: Catalog validation and deterministic CLI/MCP discovery fixtures that never inspect secret values.

## Rollout

- Risk level: Low; repository-local tooling and documentation only.
- Backward compatibility: Existing setup, runtime doctor, provider scripts, and production authorization remain unchanged.
- Metrics/events to watch: None; command exit status and validation output are sufficient.
- Follow-up slice: Add or tighten individual MCP connections only when a service-specific workflow demonstrates a recurring need.
