import type { FeedbackDimension } from "@meelni/core";

export interface ScoredAdjudicationCandidate {
  strength: AdjudicationFinding;
  improvement: AdjudicationFinding;
}

export interface AdjudicationFinding {
  turnSequence: 1 | 2 | 3;
  quote: string;
  dimension: FeedbackDimension;
  observation: string;
  nextStep: string;
}

export const SCORED_ADJUDICATIONS: Readonly<
  Record<string, ScoredAdjudicationCandidate>
> = {
  "product_sense:01:caregiver-planning": candidate(
    finding(
      1,
      "define the intended user outcome",
      "structure",
      "Starts with the user outcome before ideation, providing a basic sequence for the response.",
      "Make the outcome measurable and choose the priority user segment before ideating."
    ),
    finding(
      1,
      "brainstorm features for everyone",
      "leadership",
      "Keeps the audience broad instead of making a segment decision.",
      "Choose one segment and explain why it should be served first."
    )
  ),
  "product_sense:02:accessible-transit": candidate(
    finding(
      1,
      "define the intended user outcome",
      "structure",
      "Begins with an intended user outcome before proposing accessibility features.",
      "Make the accessibility outcome measurable for one priority user segment."
    ),
    finding(
      2,
      "ask users whether they like it",
      "insight",
      "Uses a vague preference question that will not reveal whether the problem was solved.",
      "Ask a behavior-based validation question tied to the intended outcome."
    )
  ),
  "product_sense:03:teacher-feedback": candidate(
    finding(
      1,
      "confirm its main pain point",
      "clarity",
      "States a clear problem-discovery step before solution selection.",
      "Name the user group and pain point in one precise sentence."
    ),
    finding(
      3,
      "have not made the guardrail or launch threshold precise",
      "leadership",
      "Acknowledges that the launch decision lacks a precise threshold.",
      "Set a numeric launch threshold and one stopping guardrail."
    )
  ),
  "product_sense:04:community-kitchens": candidate(
    finding(
      1,
      "choose one broad user group",
      "structure",
      "Makes an explicit initial user choice before selecting a solution.",
      "Subsegment the broad group by the highest-cost unmet need."
    ),
    finding(
      2,
      "segmentation and comparison with alternatives are still fairly surface level",
      "insight",
      "Leaves the segmentation and alternative analysis too shallow to support the product choice.",
      "Compare two segments and alternatives using explicit decision criteria."
    )
  ),
  "product_sense:05:language-practice": candidate(
    finding(
      1,
      "adult language learners who understand lessons but avoid spontaneous conversation",
      "insight",
      "Identifies a specific audience and behavior gap.",
      "Keep the behavioral segmentation and quantify when avoidance occurs."
    ),
    finding(
      2,
      "psychologically safe prompt",
      "insight",
      "Introduces psychological safety as a product need without explaining what design property would create it or how that safety would be validated.",
      "Describe the prompt mechanics and how safety would be validated with learners."
    )
  ),
  "product_sense:06:repair-guidance": candidate(
    finding(
      2,
      "without encouraging repairs that require a professional",
      "clarity",
      "States a clear safety boundary for the product.",
      "Keep the boundary explicit in the first solution description."
    ),
    finding(
      3,
      "unsafe self-repair attempts as a stopping guardrail",
      "leadership",
      "Defines a stop signal but not who reviews or acts on it.",
      "Name the accountable owner and response when the guardrail trips."
    )
  ),
  "product_sense:07:neighborhood-safety": candidate(
    finding(
      2,
      "current lighting and open businesses, not a generic crime score",
      "insight",
      "Reframes safety around current, actionable route context.",
      "Validate which contextual signals actually change route confidence."
    ),
    finding(
      3,
      "auditing reports for bias",
      "leadership",
      "Names a bias audit without ownership, cadence, or an action threshold.",
      "Assign an audit owner, cadence, and remediation trigger."
    )
  ),
  "product_sense:08:clinic-followup": candidate(
    finding(
      2,
      "confirming the next action in plain language",
      "structure",
      "Defines a focused first job for the experience.",
      "Keep this job first and sequence later capabilities behind it."
    ),
    finding(
      2,
      "escalation back to the care team when uncertain",
      "leadership",
      "Names escalation but leaves uncertainty criteria and ownership undefined.",
      "Define the uncertainty threshold and the care-team owner for escalation."
    )
  ),
  "execution:01:merchant-onboarding": candidate(
    finding(
      1,
      "define a usable release as the delivery goal",
      "structure",
      "Provides a minimal delivery goal before discussing work.",
      "Translate usable release into observable acceptance criteria."
    ),
    finding(
      1,
      "without an owner or ordered milestones",
      "leadership",
      "Explicitly leaves delivery ownership and sequencing unresolved.",
      "Assign owners and order milestones by risk and dependency."
    )
  ),
  "execution:02:search-latency": candidate(
    finding(
      1,
      "define a usable release as the delivery goal",
      "structure",
      "Provides a minimal delivery goal before discussing work.",
      "Define usable in latency and relevance terms."
    ),
    finding(
      3,
      "I would call the launch successful if it ships",
      "leadership",
      "Leaves the release without measurable control points.",
      "Set a success metric, relevance guardrail, and rollback condition."
    )
  ),
  "execution:03:support-routing": candidate(
    finding(
      1,
      "identify the main workstreams",
      "structure",
      "Breaks delivery into workstreams rather than one undifferentiated launch.",
      "Order the workstreams by dependency and customer risk."
    ),
    finding(
      2,
      "dependency analysis and rollback plan need more detail",
      "communication",
      "Does not explain dependencies or rollback clearly enough for the team to act.",
      "State the critical dependency and rollback path explicitly."
    )
  ),
  "execution:04:mobile-migration": candidate(
    finding(
      1,
      "identify the main workstreams",
      "structure",
      "Identifies the main workstreams before prioritizing the migration plan.",
      "Order those workstreams by dependency and define acceptance criteria for each."
    ),
    finding(
      2,
      "rollback plan need more detail",
      "leadership",
      "Mentions rollback but omits who makes the rollback decision and when.",
      "Name the rollback decision owner and trigger."
    )
  ),
  "execution:05:pricing-rollout": candidate(
    finding(
      1,
      "separate catalog correctness, entitlement enforcement, billing recovery, and customer communication into independent gates",
      "structure",
      "Separates the rollout into independently verifiable gates.",
      "Keep gate evidence and ordering explicit in the rollout plan."
    ),
    finding(
      2,
      "until migration evidence and support playbooks are ready",
      "leadership",
      "Uses readiness language without an accountable approver or threshold.",
      "Name the approver and evidence threshold for advancing the cohort."
    )
  ),
  "execution:06:moderation-queue": candidate(
    finding(
      1,
      "oldest high-severity reports",
      "insight",
      "Prioritizes the queue using severity and age.",
      "Validate the severity-age rule against harm and reviewer capacity."
    ),
    finding(
      2,
      "gives reviewers context and reversible actions rather than autonomous permanent enforcement",
      "leadership",
      "Chooses reversibility but does not specify escalation ownership for severe cases.",
      "Assign escalation ownership and a deadline for irreversible decisions."
    )
  ),
  "execution:07:warehouse-pilot": candidate(
    finding(
      1,
      "choose one warehouse with stable scanning behavior",
      "structure",
      "Includes a fallback in the pilot design before launch.",
      "Test the fallback and document when it takes over."
    ),
    finding(
      1,
      "define a manual fallback before the pilot",
      "leadership",
      "Defines a bounded pilot and fallback but does not name the local accountable owner.",
      "Name the warehouse owner and decision authority for pausing the pilot."
    )
  ),
  "execution:08:incident-recovery": candidate(
    finding(
      1,
      "assign one incident commander",
      "leadership",
      "Creates clear incident command ownership.",
      "Keep command ownership and handoff rules explicit throughout recovery."
    ),
    finding(
      3,
      "convert the failed assumption into an automated rollback test",
      "insight",
      "Proposes a test without identifying the failed assumption or how recurrence will be detected.",
      "Name the failed assumption and the signal the automated test must catch."
    )
  ),
  "strategy:01:creator-market": candidate(
    finding(
      1,
      "test whether customers have an unmet need",
      "structure",
      "Starts with a customer-need test before deciding whether to enter the market.",
      "Define the customer, the evidence threshold, and the next entry decision."
    ),
    finding(
      3,
      "growth seems possible",
      "leadership",
      "Bases entry on an unbounded possibility rather than a decision rule.",
      "Set an entry threshold and evidence that would reverse the recommendation."
    )
  ),
  "strategy:02:regional-expansion": candidate(
    finding(
      1,
      "test whether customers have an unmet need",
      "structure",
      "Starts with a customer-need test before deciding whether to expand.",
      "Define the segment and evidence threshold, then compare market size, constraints, and alternatives."
    ),
    finding(
      2,
      "without comparing strategic alternatives",
      "leadership",
      "Commits to imitation without comparing options.",
      "Compare build, partner, and no-entry options before recommending expansion."
    )
  ),
  "strategy:03:bundling": candidate(
    finding(
      1,
      "compare customer demand, competitor strength, and our right to win",
      "insight",
      "Names three relevant strategic lenses.",
      "Quantify each lens before choosing a bundle strategy."
    ),
    finding(
      2,
      "two plausible options",
      "communication",
      "References two options without naming them, weakening the recommendation narrative.",
      "Name both options and state why the preferred one wins."
    )
  ),
  "strategy:04:open-platform": candidate(
    finding(
      2,
      "favor the lower-investment entry",
      "clarity",
      "Makes a clear directional recommendation.",
      "State the option, investment boundary, and expected advantage precisely."
    ),
    finding(
      3,
      "have not set a precise trigger for expansion or exit",
      "leadership",
      "Leaves the pilot without a go/no-go trigger.",
      "Set expansion and exit thresholds with a decision owner."
    )
  ),
  "strategy:05:education-entry": candidate(
    finding(
      1,
      "institutional buyers from individual teachers",
      "insight",
      "Separates buyer and user motions that operate differently.",
      "Keep procurement and adoption evidence separate in the strategy."
    ),
    finding(
      2,
      "an administrator can later evaluate",
      "leadership",
      "Treats administrator evaluation as a buyer gate without defining evidence criteria or a go/no-go owner.",
      "Name the required evidence, the decision owner, and the go/no-go rule."
    )
  ),
  "strategy:06:marketplace-liquidity": candidate(
    finding(
      1,
      "buyer demand, qualified supply, matching, or trust",
      "structure",
      "Decomposes liquidity into distinct possible constraints.",
      "Diagnose one primary constraint per market before intervening."
    ),
    finding(
      3,
      "once organic liquidity holds",
      "insight",
      "Uses organic liquidity as a trigger without defining a measurable threshold.",
      "Define repeat-match and subsidy thresholds that demonstrate organic liquidity."
    )
  ),
  "strategy:07:ai-positioning": candidate(
    finding(
      1,
      "costly customer decision the product can improve",
      "insight",
      "Anchors positioning in a costly customer decision rather than generic model access.",
      "Quantify the decision cost and the improvement target."
    ),
    finding(
      3,
      "human review remains required",
      "leadership",
      "Preserves human review but leaves review ownership and escalation unspecified.",
      "Define reviewer authority and escalation for disputed outputs."
    )
  ),
  "strategy:08:portfolio-exit": candidate(
    finding(
      1,
      "strategic fit, customer dependency, switching cost, and reinvestment return",
      "structure",
      "Defines a balanced set of exit criteria.",
      "Weight the criteria and show how they lead to the recommendation."
    ),
    finding(
      3,
      "set a decision date",
      "leadership",
      "Names a deadline without assigning decision ownership or governance.",
      "Name the decision owner and approval process for the exit date."
    )
  ),
  "behavioral:01:roadmap-conflict": candidate(
    finding(
      2,
      "scheduled one discussion and summarized the disagreement",
      "communication",
      "Uses a discussion and summary to make the stakeholder disagreement explicit.",
      "Connect the summary to a recommendation and decision owner."
    ),
    finding(
      2,
      "did not drive a clear tradeoff or decision",
      "leadership",
      "Did not convert the discussion into a decision.",
      "State the tradeoff, recommendation, and decision owner."
    )
  ),
  "behavioral:02:failed-launch": candidate(
    finding(
      2,
      "summarized the disagreement",
      "communication",
      "Makes the disagreement explicit by summarizing it for the group.",
      "Name each perspective and connect the summary to a recommendation and decision owner."
    ),
    finding(
      3,
      "do not have a concrete result",
      "leadership",
      "Provides no measurable outcome showing ownership or impact.",
      "Quantify the result and state the action personally owned."
    )
  ),
  "behavioral:03:influence-without-authority": candidate(
    finding(
      2,
      "gathered their concerns, proposed a compromise",
      "communication",
      "Listened to stakeholders and proposed a concrete path forward.",
      "Keep the stakeholder concerns and proposal explicit."
    ),
    finding(
      2,
      "personal influence are not fully clear",
      "leadership",
      "Does not distinguish the candidate's influence from the group's work.",
      "Explain the specific intervention that changed the decision."
    )
  ),
  "behavioral:04:customer-escalation": candidate(
    finding(
      1,
      "owned one part of a team problem",
      "clarity",
      "States a bounded personal responsibility.",
      "Name the exact responsibility and customer outcome."
    ),
    finding(
      3,
      "result is only loosely measured",
      "leadership",
      "Leaves the impact too vague to assess ownership.",
      "Provide a concrete customer or operational result."
    )
  ),
  "behavioral:05:team-disagreement": candidate(
    finding(
      2,
      "asked each lead for the cheapest test",
      "communication",
      "Turned disagreement into a shared, testable question.",
      "Keep the test request and decision criteria explicit."
    ),
    finding(
      2,
      "sponsored a prototype with five target users",
      "leadership",
      "Sponsors a concrete test but does not define its success threshold or decision owner.",
      "Define the prototype success threshold and who owns the resulting decision."
    )
  ),
  "behavioral:06:missed-goal": candidate(
    finding(
      2,
      "interviewed inactive teams",
      "insight",
      "Investigated the failed metric through customer evidence.",
      "Connect each finding to the roadmap change it justified."
    ),
    finding(
      2,
      "changed the roadmap",
      "leadership",
      "Describes a roadmap change without explaining stakeholder alignment or decision authority.",
      "Explain how stakeholders were aligned and who approved the change."
    )
  ),
  "behavioral:07:mentoring": candidate(
    finding(
      2,
      "reviewed drafts with questions instead of edits",
      "communication",
      "Used questions to transfer judgment instead of taking over the work.",
      "Keep the coaching method and expected learner decision explicit."
    ),
    finding(
      3,
      "led the review successfully",
      "leadership",
      "Reports the review as successful without defining the criteria used to judge success.",
      "Define review success criteria and the threshold for mentor intervention."
    )
  ),
  "behavioral:08:ethical-tradeoff": candidate(
    finding(
      2,
      "a transparent alternative that tested value reminders",
      "leadership",
      "Proposed a concrete ethical alternative rather than only objecting.",
      "Keep the alternative and the decision principle explicit."
    ),
    finding(
      3,
      "improved retained renewals without more complaints",
      "insight",
      "Reports an aggregate outcome without duration, segmentation, or a counterfactual.",
      "Test whether the outcome persists by segment against a clear comparison."
    )
  ),
};

function candidate(
  strength: AdjudicationFinding,
  improvement: AdjudicationFinding
): ScoredAdjudicationCandidate {
  return { strength, improvement };
}

function finding(
  turnSequence: 1 | 2 | 3,
  quote: string,
  dimension: FeedbackDimension,
  observation: string,
  nextStep: string
): AdjudicationFinding {
  return { turnSequence, quote, dimension, observation, nextStep };
}
