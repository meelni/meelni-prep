# Live PM Interview Practice Positioning

Date: 2026-07-09
Status: accepted

## Context

Meelni is returning after a discontinued period. Its strongest product wedge is PM-specific practice: real questions, live voice interviews, and feedback calibrated to PM interview expectations. Calling the product a "PM interview gym" and naming sessions "reps" adds a fitness metaphor that does not clarify the value. Product surfaces also use readiness language that can imply a predictive claim the product does not currently validate.

The relaunch needs one product story that is accurate before the default feature gate is enabled.

## Decision

### Positioning contract

- Category: **Live PM interview practice**
- One-line description: **Practice real PM interview questions out loud, handle realistic follow-ups, and get PM-calibrated feedback on what to improve next.**
- Hero promise: **Practice the answer before it counts.**
- Primary audience: PM candidates actively preparing for Product Sense, Execution/Product Metrics, Strategy, or Behavioral interviews.
- Primary product-quality lever: make realistic practice and the next improvement action clearer.

### Proof

Customer-facing proof should stay grounded in capabilities the product has:

- Real PM interview questions across the four core round types.
- Live voice mock interviews with follow-up questions.
- PM-calibrated feedback, transcripts, and practice history after completed interviews.

Do not imply that Meelni can guarantee interview outcomes, predict hiring decisions, or certify that a candidate is ready.

### Canonical vocabulary

| Avoid in product copy       | Use instead                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| PM interview gym            | Live PM interview practice                                                                        |
| rep / reps                  | mock interview, practice session, completed interview, or interview history, according to context |
| drill / workout             | focused practice, practice question, or suggested exercise, according to context                   |
| New Rep                     | New Mock Interview                                                                                |
| Practice Home               | Overview                                                                                          |
| readiness / readiness score | practice progress, recent practice score, or the specific measured trend                          |
| interview-ready             | name the observed score, feedback, or completed practice behavior                                 |

"Mock interview" means a complete simulated interview session. "Interview practice" is the broader activity. "Practice session" is acceptable when the item may be partial or incomplete.

The fitness-language restriction applies to Meelni's own product framing, including labels for short improvement activities. Verbatim question-bank, company, or blog content may still use words such as "fitness" when that is the subject of a legitimate PM interview prompt, for example designing a fitness app. Internal database fields, provider payloads, and compatibility APIs may retain legacy identifiers until they can be migrated safely, but those identifiers must not leak into product copy.

### Route compatibility

- `/dashboard/new-interview` is the canonical launch route.
- New links and CTAs must target the canonical route.
- `/dashboard/new-rep` is a temporary compatibility alias and must redirect to the canonical route while preserving all query parameters, including repeated parameters.
- The alias is not customer-facing vocabulary. Remove it only after post-relaunch traffic confirms that bookmarks, indexed links, and external referrals no longer depend on it.
- `/setup` remains a compatibility redirect and must not become a standalone setup experience.

### Analytics compatibility

- Canonical launch events use the `new_interview_*` namespace.
- During migration, the product may dual-write equivalent legacy `new_rep_*` events so existing funnels and dashboards remain continuous.
- Keep the compatibility window through **2026-08-09**. Before removing legacy writes, verify that canonical events populate production analytics and migrate dependent dashboards or saved reports.
- Legacy event identifiers may appear only in the compatibility implementation, tests, and documentation. They are not approved product language.

### Relaunch gate

- The discontinued experience is intentionally behind a relaunch feature flag. Its default-off state is a rollout control, not a defect.
- Keep the experience off by default while relaunch-readiness work remains open.
- Test the enabled path in controlled development and preview environments.
- Enable it by default only as a deliberate launch action after the accepted launch criteria pass, with an operational disable path retained for rollback.

## Consequences

- Marketing, authenticated UI, product strategy references, and developer guidance use one positioning contract.
- Dashboard aggregates are progress signals based on completed practice. They are not readiness predictions.
- Historical code or docs that describe the fitness metaphor must be updated when they are active guidance; legitimate interview-question content remains unchanged.
- Future capabilities must be labeled as future direction until they ship and are verified.

## Validation

- Product-language guardrails should catch new customer-facing uses of the fitness metaphor and unsupported readiness claims.
- Route tests should prove that legacy launch URLs preserve query context.
- Analytics tests should prove canonical events and the time-bounded compatibility behavior.
- Relaunch review should compare public promises with the production experience before enabling the product gate by default.
