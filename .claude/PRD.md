# Meelni Relaunch PRD

Last updated: 2026-07-09
Status: accepted product direction; relaunch work in progress

## Product Contract

### Category

**Live PM interview practice**

### One-line description

Practice real PM interview questions out loud, handle realistic follow-ups, and get PM-calibrated feedback on what to improve next.

### Hero promise

**Practice the answer before it counts.**

### Product vocabulary

- A complete simulated session is a **mock interview**.
- The broader activity is **interview practice**.
- A partial or generic activity can be a **practice session**.
- The dashboard home is **Overview**.
- The launch action is **New Mock Interview**.
- Do not frame Meelni as a gym or call interviews reps.
- Do not claim that Meelni predicts hiring outcomes, certifies readiness, or guarantees interview success.
- Use **practice progress**, **recent practice score**, or the specific observed measure instead of readiness language.

The accepted positioning and compatibility rules are recorded in `docs/decisions/2026-07-09-live-pm-interview-practice-positioning.md`. Canonical constants live in `lib/product-language.ts`.

## Problem

PM candidates can study frameworks and read sample answers without learning whether they can produce a clear, structured answer under interview conditions. Human mock interviews and coaching can help, but they are costly and difficult to repeat. Generic AI interview tools often miss PM-specific reasoning, round conventions, and feedback standards.

Meelni should close the gap between knowing PM interview advice and practicing the answer out loud.

## Primary User

The relaunch serves PM candidates actively preparing for interviews, including APMs, product managers, senior product managers, and career switchers. The immediate wedge is not every profession and not enterprise hiring software.

Core PM round types:

- Product Sense
- Execution and Product Metrics
- Strategy
- Behavioral

Core jobs to be done:

- Practice realistic PM questions out loud.
- Respond to follow-up questions without losing structure.
- Receive feedback grounded in the answer and a PM-specific rubric.
- Review transcripts and completed-interview history.
- Understand what to improve and what to practice next.

## Product Loop

1. Discover a real PM question through marketing, company pages, the question bank, or the authenticated product.
2. Start a New Mock Interview with the selected question or round context preserved.
3. Complete a live voice interview with realistic follow-ups.
4. Review the transcript and PM-calibrated feedback.
5. Choose a concrete next practice action.
6. Return for another mock interview and compare observed practice progress.

The loop should optimize for useful completed interviews and clear follow-up actions, not time spent in the product.

## Current Product Truth

The repository contains a working foundation for:

- Public marketing, pricing, blog, company, question-bank, and SEO surfaces.
- Supabase authentication and an authenticated dashboard.
- Question and round selection for PM practice.
- LiveKit-backed voice interview sessions with a Python agent runtime.
- Session transcript persistence and post-interview feedback flows.
- Interview history, aggregate analytics, settings, and billing surfaces.
- Stripe subscription, credit, and usage foundations.
- A relaunch feature flag that can keep the discontinued experience unavailable while readiness work is open.

The existence of a foundation in code does not mean every path is launch-ready, enabled, or validated in production. The relaunch program must verify claims and complete the end-to-end journey before public availability expands.

## Intentional Relaunch Gate

The discontinued experience is intentionally behind a relaunch feature flag. The default-off state is a rollout control, not a product defect.

- Keep the relaunch experience off by default while launch-readiness work remains open.
- Test the enabled experience deliberately in development and preview environments.
- Treat agent reviews, provider rehearsals, and automated gates as launch-readiness evidence, not the launch decision.
- Only the human product owner makes the final launch GO/NO-GO for the exact candidate.
- Change the default to on only after an explicit owner GO and a separately authorized launch action; passing criteria alone does not authorize the change.
- Preserve an operational way to disable the experience if launch monitoring exposes a material issue.

## Relaunch Scope

The relaunch is ready when a candidate can complete the core loop without ambiguity or a trust-breaking failure:

- Public positioning consistently describes live PM interview practice.
- Public proof matches production behavior.
- New links use `/dashboard/new-interview`; legacy launch links preserve their context and redirect.
- Authentication, interview selection, entitlement, microphone permission, live voice, ending, transcript, feedback, and return-to-dashboard paths work together.
- Empty, loading, error, partial, exhausted-credit, and recovery states are understandable.
- Feedback identifies evidence-based strengths and improvements rather than generic advice.
- Dashboard language reports observed practice progress without predicting readiness.
- Billing promises, credit enforcement, checkout, webhook handling, and account state agree.
- Analytics distinguish launch attempts, starts, completions, feedback views, failures, and returns.
- Production operations, security controls, data contracts, and rollback paths are documented and verified.

## Proof And Claims

Approved proof points:

- Real PM interview questions across the four core round types.
- Live voice mock interviews with follow-up questions.
- PM-calibrated feedback, transcripts, and practice history after completed interviews.

Claims require evidence. Do not promise real-time perfection. Do not promise guaranteed job outcomes or interviewer-equivalent scoring. Do not claim a validated readiness score. If latency, evaluation agreement, or user-outcome targets are adopted later, document the measurement method and baseline before using them in marketing.

## Billing Direction

The accepted catalog is credit-based because full voice interviews have meaningful variable cost:

- Trial: 2 full-interview credits for 7 days.
- Interview Pass: 1 full-interview credit for $9, expiring after 30 days.
- Starter: $19/month for 4 credits per month.
- Pro: $49/month for 12 credits per month.
- Subscription rollover follows the limits in `docs/decisions/2026-06-29-credit-based-billing-catalog.md`.

The relaunch must verify that pricing copy, checkout products, subscription state, credit reservation and consumption, failure refunds, structured data, and upgrade states all implement the same catalog. Do not describe the catalog as shipped merely because it is accepted.

## Success Signals

Establish baselines during controlled relaunch traffic before setting hard targets. At minimum, measure:

- Question or landing-page visit to mock-interview start.
- Start attempt to successful room connection.
- Successful connection to completed interview.
- Completion to feedback availability and feedback view.
- Feedback view to another practice start.
- Trial activation and paid conversion by completed-interview count.
- Failure and recovery rates by stage.
- User-rated feedback helpfulness.

Use observed session and feedback data as product-quality signals. Do not relabel an aggregate score as interview readiness.

## Non-goals For Relaunch

- General interview preparation for every profession.
- Human interviewer or coach marketplace.
- Enterprise cohort administration, hiring workflows, or candidate ranking.
- Coding interview or whiteboard evaluation.
- Photoreal avatar or mandatory video experience.
- User-facing model, provider, or prompt-tuning controls.
- Guaranteed outcomes or readiness certification.

## Future Direction

These ideas are not shipped relaunch promises:

- More targeted practice and learning material tied to actual answers.
- Deeper company- and round-specific practice paths.
- AI and agent product-management practice tracks.
- Validated progress models based on longitudinal evidence.
- Enterprise custom rubrics, cohorts, privacy controls, and evaluation exports.
- Broader roles only after the PM wedge is working or a concrete distribution advantage justifies expansion.

Future work should strengthen acquisition, activation, retention, monetization, enterprise validation, or product quality and name which lever it serves.

## Product Principles

- PM-specific depth beats generic breadth.
- Realistic practice is the core value; content should lead into practice.
- Feedback should make the next action obvious.
- Measured behavior beats aspirational claims.
- Monetization should attach to serious preparation and visible value.
- Enterprise optionality must not distort the consumer wedge prematurely.
- AI should improve interview practice, not become generic decoration.
- Future direction must remain labeled as future until it ships and is verified.
