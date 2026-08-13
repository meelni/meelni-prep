# Principal/CTO Investigation Guide

Use this reference when the request is ambiguous, cross-layer, risky, disputed,
or likely to create a durable product or architecture decision.

## Evidence Ladder

Prefer the lowest rung that can settle the question, then move upward only when
needed:

1. User-provided symptoms, artifacts, and explicit constraints.
2. Accepted product truth, decisions, contracts, runbooks, and OpenSpec.
3. Exact source, callers, schemas, state machines, tests, and version pins.
4. Local provider-free reproduction and adversarial fixtures.
5. Current external state from authoritative read-only tools.
6. Controlled Preview or Production proof under the applicable authorization.

Do not use Production customer content as a shortcut. Use aggregate, fixed-code,
count, timestamp, fingerprint, or synthetic evidence whenever possible.

## Investigation Depth

### Quick

Use for a stable factual question or small reversible decision. Check one or two
authoritative sources, answer directly, and state any material assumption.

### Standard

Use for a scoped bug, review, or implementation. Trace the public seam, callers,
tests, and failure behavior. Verify the most likely alternative hypothesis.

### Deep

Use for cross-layer behavior, architecture, privacy, billing, evaluation,
migrations, or repeated failures. Build a compact system map and test competing
hypotheses across contracts, persistence, providers, compatibility, and
operations.

### Incident

Use for current customer-impacting or Production failures. Pin time and release
identity, keep evidence redacted, distinguish symptom from fault, preserve
forensics, identify the containment boundary, and require explicit authority for
mutation.

## System Map

Map only the layers relevant to the question:

```text
user intent -> UI/API entrypoint -> workflow -> domain contract
            -> persistence/outbox -> provider adapter/runtime
            -> durable outcome -> presentation/analytics/operations
```

For each included boundary, record:

- owner and interface;
- input and output invariants;
- auth, privacy, and entitlement checks;
- state transition and idempotency rule;
- timeout, retry, and recovery behavior;
- observability and release identity;
- compatibility and rollback behavior.

## Principal Engineer Review

- Is the behavior owned at the deepest useful module, or repeated by callers?
- Are provider shapes normalized before core behavior?
- Are state and error modes explicit, durable, idempotent, and testable?
- Does the proposed change reduce caller knowledge or add another shallow layer?
- Do tests cross the same seam as production callers?
- What concurrency, stale-state, partial-failure, or rollback case could falsify
  the happy path?

## CTO/Product Review

- What user problem and Meelni product lever does this solve?
- Why now, and what is the opportunity cost?
- Is this strengthening live PM interview practice or drifting toward a generic
  platform?
- What is the all-in cost: delivery, provider spend, operations, privacy,
  maintenance, and future migration?
- Is the decision reversible? What evidence justifies irreversible complexity?
- What metric or qualitative signal will tell us the change worked?

## Hypothesis Table

Use a compact table for complex investigations:

| Hypothesis            | Supporting evidence | Disconfirming check     | Result                  |
| --------------------- | ------------------- | ----------------------- | ----------------------- |
| Most likely cause     | Known facts         | Smallest decisive probe | open/confirmed/rejected |
| Plausible alternative | Known facts         | Smallest decisive probe | open/confirmed/rejected |

Do not produce the table when a short explanation is clearer.

## Termination Rules

Stop investigating when:

- the requested answer or decision is supported by decisive evidence;
- the root cause is localized to an owned boundary and alternatives are
  reasonably excluded;
- implementation can begin with bounded assumptions and explicit validation;
- further progress requires a material owner decision, unavailable authority,
  or an external state change.

Do not stop merely because the first plausible explanation fits.
