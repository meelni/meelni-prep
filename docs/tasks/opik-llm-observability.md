# Opik LLM Observability Intake

## Intent

- User request: Integrate Comet Opik with Meelni.
- Product/user outcome: Operators can inspect feedback-evaluation and live voice
  LLM traces without changing interview or feedback outcomes.
- Why now: The owner is adding an LLM observability workflow.

## Slice

- Primary slice: Feedback and evaluation.
- Secondary slices: Interview runtime and operational tooling.
- Relevant skills: codebase architecture, ops connections, feedback evaluation,
  LiveKit interview runtime, vertical-slice playbooks.

## Linear Tracking

- Project: Meelni (`SAV-*`).
- Parent/child issue: Not supplied for this repo-only setup.
- Current Linear state: Untracked.

## Scope

- In scope: Opt-in Opik configuration, feedback traces, sanitized LiveKit OTLP
  export, tests, and an operator runbook.
- Out of scope: Creating the Comet account, setting real secrets, Production
  deployment, online evaluators, datasets, dashboards, alerts, or changing the
  approved Privacy Policy.
- Assumptions: Hosted Opik is the initial target; project name `meelni` is the
  default recommendation; provider credentials will be entered outside chat.

## Product Lens

- Audience: Meelni operators and engineers.
- Lever: Interview and feedback reliability.
- Product Compass note: Observability supports the PM interview practice path;
  it does not become a user-facing model control.

## Technical Plan

- App/workflow: `lib/evaluation/scorer.ts`.
- Provider boundary: `packages/integrations/src/opik.ts`.
- Voice runtime: `agent/shared/opik_tracing.py` and both worker entrypoints.
- Provider dependency: Opik TypeScript SDK and the OTLP HTTP exporter already
  used by LiveKit Agents.
- Docs: LLM observability contract, setup runbook, and connection memory.

## Validation

- Required: Typecheck, integration tests, Python agent tests, agent verifier.
- Manual: Send one synthetic/local feedback trace and one Preview voice trace
  after credentials exist; inspect content behavior in Opik.
- Regression: Assert metadata-only default, explicit content capture, and
  removal of identities and raw errors.

## Rollout

- Risk: Medium because transcript capture changes data disclosure when enabled.
- Backward compatibility: Tracing is disabled unless explicitly configured;
  exporter failures are non-fatal.
- Watch: Trace delivery, feedback latency, worker shutdown, payload content,
  and Opik retention/access controls.
- Follow-up: Owner privacy review and Production secret/deployment contract.
