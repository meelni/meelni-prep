# SAV-434 Agent Task Intake

## Intent

- User request: Document the agreed four-phase interview-to-feedback program,
  draft its tickets, and supervise parallel delivery through review and merge.
- Product/user outcome: Feedback becomes faster, more recoverable, and more
  useful without weakening transcript integrity or score authority.
- Why now: Runtime settlement can race room shutdown, partial session state can
  suppress useful scores from earlier closed answers, and generation latency is
  not decomposed well enough to tune safely.

## Slice

- Primary slice: Cross-cutting interview-to-feedback architecture and delivery
  contract.
- Secondary slices: LiveKit settlement, feedback evaluation, processing UX,
  operations telemetry, and default-off shadow evaluation.
- Relevant skills: Meelni start, Linear workstream, engineering memory,
  codebase architecture, LiveKit interview runtime, feedback evaluation,
  vertical-slice playbooks, and PR prep.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-433.
- Child deliverable issue: SAV-434.
- Phase parents: SAV-436, SAV-435, SAV-437, and SAV-438.
- Current Linear state: In Progress.

## Scope

- In scope: Accepted decision, architecture flow, invariants, phase boundaries,
  PR-sized issue graph, validation gates, proposed targets, and merge train.
- Out of scope: Runtime or UI code, migrations, provider calls, Production
  changes, default-on activation, deployment, and launch authorization.
- Assumptions: The current canonical transcript, answer-block, dimension
  coverage, durable Inngest, and human-owned launch decisions remain authority.

## Product Lens

- Audience: Candidates finishing authenticated PM interview practice.
- Lever: Completion trust and retention through faster useful feedback.
- Product Compass note: Speed must come from better ownership, granularity, and
  latency control—not weaker evidence or a speculative preview score.

## Technical Plan

- Record the accepted durable settlement, per-block score authority, latency
  budget, processing workspace, and incremental-shadow decisions.
- Document the current and target flows and the cross-phase compatibility
  invariants.
- Make Linear children PR-sized and encode merge dependencies explicitly.
- Start separate worktree tasks only after this documentation is merged; tasks
  may prepare blocked work but may not merge ahead of their dependencies.
- Keep Production/provider/default-on actions outside delegated authority.

## Validation

- Required commands: Documentation link checks where available,
  `npm run verify:agent`, and repository formatting checks for touched files.
- Optional/manual checks: Review every Linear relation against the documented
  Mermaid merge graph and confirm current decision indexes link the record.
- Fixtures or regression tests needed: None for this documentation-only slice.

## Rollout

- Risk level: Low for runtime, medium for delivery coordination.
- Backward compatibility: Documentation only; current behavior is unchanged.
- Metrics/events to watch: Implementation PR status, hosted checks, merge
  dependency state, and later program targets defined in the architecture doc.
- Follow-up slice: SAV-442, SAV-439, and SAV-444 may begin in parallel after
  SAV-434 merges; all other child work remains dependency-gated.
