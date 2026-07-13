# SAV-250 Adjudicated Evidence-Anchor Audit

## Boundary and outcome

This provider-free audit reviewed all 32 scored `pm-gold-set.v4` synthetic
fixtures, all 64 approved strength/improvement anchors, and the calibration
matcher. It used no provider call, paid call, customer transcript, recording,
database, or Production data.

Outcome: the existing anchors are grounded and directionally plausible, but
the fixture pair is not an exhaustive list of legitimate feedback for any of
the 32 cases. The terminal SAV-248 result therefore cannot be classified as
irrelevant or legitimately alternative: response content was intentionally not
retained, so either conclusion would invent evidence.

The safe code change is limited to quote-span representation. A returned
finding matches an approved anchor only when its kind, rubric dimension, and
turn reference match and its exact transcript quote contains the complete
approved anchor. This accepts a full sentence around an approved phrase while
continuing to reject a different grounded phrase, a shorter fragment that
omits part of the anchor, another dimension, another finding kind, or another
turn.

## Review method

Three separate provider-free passes were applied:

1. Anchor-integrity pass: verify each quote exists in the named user turn and
   that its observation, dimension, and next step are defensible PM feedback.
2. Non-uniqueness pass: read each transcript as a fresh evaluator and determine
   whether another grounded strength or improvement could also be legitimate.
3. Independent second-panel pass: a fresh agent read all 32 transcripts and 64
   anchors directly from the fixture and adjudication sources, then reviewed the
   matcher and its tests without editing the implementation.

The independent pass agreed that 64/64 anchors are grounded and directionally
plausible, 32/32 transcripts admit legitimate alternative feedback, and no
anchor needs a corpus correction. It also confirmed that containment of the
complete anchor is the narrowest safe automated correction. The prior v4 corpus
approval and its two hash-bound panels remain separate historical evidence.

## Complete case inventory

Every row has the same audit result: both canonical anchors are plausible, and
the transcript admits at least one legitimate alternative finding. “Explicit”
means the answer states the gap directly; “omission” means a defensible gap is
inferred from a missing threshold, owner, comparison, or decision rule.

| Case                                        | Anchor assessment       | Why alternatives exist                                                                                                                        |
| ------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `product_sense:01:caregiver-planning`       | plausible; explicit gap | segmentation, problem definition, validation, metrics, and guardrails all offer other findings                                                |
| `product_sense:02:accessible-transit`       | plausible; explicit gap | broad audience, solution-first choice, vague preference test, and absent outcome controls compete                                             |
| `product_sense:03:teacher-feedback`         | plausible; explicit gap | user choice, discovery, shallow alternatives, repeat-use metric, and imprecise controls compete                                               |
| `product_sense:04:community-kitchens`       | plausible; explicit gap | initial segmentation, concept test, alternative depth, metrics, and launch controls compete                                                   |
| `product_sense:05:language-practice`        | plausible; omission gap | behavioral segment, safety framing, real-world outcome, prompt mechanics, and validation are all defensible                                   |
| `product_sense:06:repair-guidance`          | plausible; omission gap | audience, symptom framing, professional boundary, routing metric, safety guardrail, and ownership compete                                     |
| `product_sense:07:neighborhood-safety`      | plausible; omission gap | segment, contextual signal choice, route-confidence test, bias guardrail, and audit ownership compete                                         |
| `product_sense:08:clinic-followup`          | plausible; omission gap | audience, focused job, plain language, escalation, safety priority, thresholds, and ownership compete                                         |
| `execution:01:merchant-onboarding`          | plausible; explicit gap | delivery definition, absent owners, unordered milestones, dependency handling, metrics, and rollback compete                                  |
| `execution:02:search-latency`               | plausible; explicit gap | usable-release framing, ownership, sequencing, dependency risk, and missing controls compete                                                  |
| `execution:03:support-routing`              | plausible; explicit gap | goal, workstreams, ownership, prioritization, dependency detail, rollout, and thresholds compete                                              |
| `execution:04:mobile-migration`             | plausible; explicit gap | workstreams, owners, prioritization, dependency and rollback detail, staged metrics, and thresholds compete                                   |
| `execution:05:pricing-rollout`              | plausible; omission gap | independent gates, incumbent protection, support readiness, renewal and entitlement guardrails, approver, and thresholds compete              |
| `execution:06:moderation-queue`             | plausible; omission gap | severity-age priority, uncertainty, reversible actions, appeal metrics, escalation owner, and deadlines compete                               |
| `execution:07:warehouse-pilot`              | plausible; omission gap | bounded site choice, fallback, critical path, stop rule, local owner, and pause authority compete                                             |
| `execution:08:incident-recovery`            | plausible; omission gap | incident command, write stabilization, customer timeline, integrity gate, rollback test, failed assumption, and ownership compete             |
| `strategy:01:creator-market`                | plausible; explicit gap | unmet-need test, missing segment and market case, imitation, absent alternatives, and unbounded entry logic compete                           |
| `strategy:02:regional-expansion`            | plausible; explicit gap | unmet-need test, missing segment and market case, imitation, business-model deferral, and absent alternatives compete                         |
| `strategy:03:bundling`                      | plausible; explicit gap | strategic lenses, unnamed options, rough economics, pilot, and absent go/no-go trigger compete                                                |
| `strategy:04:open-platform`                 | plausible; explicit gap | lenses, option comparison, directional choice, rough economics, pilot, and absent expansion/exit trigger compete                              |
| `strategy:05:education-entry`               | plausible; omission gap | buyer/user split, teacher wedge, procurement timing, classroom proof, administrator criteria, and decision ownership compete                  |
| `strategy:06:marketplace-liquidity`         | plausible; omission gap | constraint decomposition, geographic focus, subsidy choice, repeat matches, and organic-liquidity threshold compete                           |
| `strategy:07:ai-positioning`                | plausible; omission gap | costly decision, workflow moat, verified outcomes, narrow launch, human review, quantification, and escalation compete                        |
| `strategy:08:portfolio-exit`                | plausible; omission gap | balanced criteria, managed sunset, migration support, deadline, governance, weighting, and transition measurement compete                     |
| `behavioral:01:roadmap-conflict`            | plausible; explicit gap | unclear individual role, discussion, summary, absent tradeoff, vague outcome, and generic learning compete                                    |
| `behavioral:02:failed-launch`               | plausible; explicit gap | unclear ownership, discussion, summary, absent decision, unmeasured result, and generic learning compete                                      |
| `behavioral:03:influence-without-authority` | plausible; explicit gap | stakeholder alignment, compromise, unclear hard tradeoff, unclear personal influence, loose result, and reflection compete                    |
| `behavioral:04:customer-escalation`         | plausible; explicit gap | bounded role, stakeholder concerns, compromise, unclear tradeoff, loosely measured result, and reflection compete                             |
| `behavioral:05:team-disagreement`           | plausible; omission gap | user-risk framing, test design, five-user prototype, simplification result, success threshold, and decision owner compete                     |
| `behavioral:06:missed-goal`                 | plausible; omission gap | metric mistake, inactive-team research, roadmap change, retained use, stakeholder alignment, and decision authority compete                   |
| `behavioral:07:mentoring`                   | plausible; omission gap | problem framing, question-led coaching, delegated ownership, successful review, transfer of method, and intervention threshold compete        |
| `behavioral:08:ethical-tradeoff`            | plausible; omission gap | trust-risk framing, transparent alternative, leadership choice, renewal result, complaint guardrail, segmentation, and counterfactual compete |

## Matcher findings

- The prior exact-string equality was representationally brittle: the same
  approved evidence failed if the evaluator quoted the whole source sentence.
- Exact transcript grounding is not semantic adjudication. The core parser can
  prove user ownership and byte-exact source text but cannot prove that an
  observation or next step is a fair interpretation.
- The matcher verifies anchor location, kind, and dimension, but does not and
  should not pretend to understand arbitrary provider prose.
- Some omission-based improvements cite the context in which a threshold,
  owner, comparison, or decision rule is missing; the quote does not itself
  state that omission. Several adjacent dimension assignments are debatable but
  remain directionally defensible.
- Eight cases place both approved anchors in one user turn, and
  `execution:07:warehouse-pilot` uses nested approved quote spans. The parser's
  existing duplicate-evidence rule still prevents two findings from reusing an
  identical whole-turn quote; containment does not bypass that constraint.
- Weakening the gate to “any grounded quote” would create a false-positive path
  where irrelevant but real transcript text passes.
- Enumerating unreviewed alternatives after seeing a failure would overfit the
  corpus and silently invalidate the existing approval hashes.

## Decision and remaining risk

The 100% canonical-anchor gate remains fail closed. No fixture, score band,
gold-set version, adjudication version, approval artifact, or historical report
was changed. The containment fix does not reclassify the historical SAV-248
failure; that report remains terminal NO-GO evidence produced by the earlier
code.

Before any v3 run is considered launch evidence, arbitrary alternative findings
need a separately designed review path. The safest option is a private,
synthetic-only, hash-bound output-adjudication artifact reviewed by two
independent panels, with a public report containing only closed decisions and
hashes. Until that exists, an output that omits a canonical anchor must fail
even when it might be a legitimate alternative.
