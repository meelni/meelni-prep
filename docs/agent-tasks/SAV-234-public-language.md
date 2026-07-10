# SAV-234 Public Language Follow-up

## Intent

- User request: Remove the fitness spin from Meelni's positioning and product experience.
- Product/user outcome: Every customer-facing surface describes interview practice and improvement directly.
- Why now: Relaunch language must be coherent before the default-off gate can be enabled.

## Slice

- Primary slice: Product positioning and customer-facing copy.
- Secondary slices: Dashboard, structured data, company preparation content, feedback compatibility.
- Relevant skill(s): `meelni-product-strategy`, `meelni-ui-design-system`, `meelni-engineering-memory`.

## Linear Tracking

- Project: Meelni Relaunch Readiness.
- Parent slice issue: SAV-165.
- Child deliverable issue: SAV-234.
- Current Linear state: In Review after remediation verification.

## Scope

- In scope: Remove customer-facing gym, rep, workout, and drill framing; strengthen the automated product-language contract.
- Out of scope: Rename persisted `drills` fields, provider payloads, migrations, or compatibility APIs; rewrite legitimate interview questions about fitness products.
- Assumptions: Focused practice, practice question, and suggested exercise describe the user value without a metaphor.

## Product Lens

- Audience: PM candidates actively preparing for interviews.
- Activation/retention/monetization/growth lever: Activation and product clarity.
- Product Compass note: State the concrete practice behavior and next improvement action.

## Technical Plan

- Likely app files: Structured data and authenticated dashboard copy.
- Likely package/workflow files: Canonical product-language contract and guardrail test.
- Data or provider dependencies: None.
- Docs/decisions to update: Accepted positioning decision and PRD future-direction vocabulary.

## Validation

- Required commands: Product-language contract, affected tests, typecheck, lint, production build.
- Optional/manual checks: Browser review on the converged authenticated Preview deployment.
- Fixtures or regression tests needed: Contract rejection for gym, rep, workout, and drill vocabulary on active product surfaces.

## Rollout

- Risk level: Low.
- Backward compatibility: Preserve internal and API field names; change presentation only.
- Metrics/events to watch: No event-contract changes.
- Follow-up slice: SAV-201 supplies deterministic focused-practice recommendations; SAV-234 does not expose stored compatibility fields.

## Implementation Evidence

- The branch is rebased directly onto remediated SAV-200 head `7511b9bc`.
- Public product copy, structured data, company CTAs, blog content, and customer
  API documentation use completed-interview feedback and focused-practice
  vocabulary.
- Exact `drills` JSON/property compatibility identifiers remain unchanged, but
  the language guard strips only identifier syntax and still rejects the same
  words in display strings.
- The guard scans active TS/TSX surfaces, company/blog copy sources, public
  Markdown/OpenAPI documents, and canonical product-strategy guidance.
- Canonical `.agents/skills/meelni-product-strategy` sources use focused-practice
  vocabulary; Codex and Claude mirrors remain symlinks.
