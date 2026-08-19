import type { RoundType } from "./interview";

export interface PmInterviewRoundPack {
  objectives: readonly string[];
  probeFamilies: readonly string[];
  transitionGuidance: readonly string[];
  closeGuidance: readonly string[];
}

export const PM_INTERVIEW_ROUND_PACKS = {
  behavioral: {
    objectives: [
      "establish_situation_and_role",
      "surface_specific_decisions_and_actions",
      "examine_stakeholder_judgment",
      "verify_outcomes_and_impact",
      "extract_learning_and_adaptation",
    ],
    probeFamilies: [
      "ownership",
      "chronology",
      "alternatives_considered",
      "stakeholder_conflict",
      "influence_without_authority",
      "failure_and_recovery",
      "measurable_impact",
      "learning_and_adaptation",
    ],
    transitionGuidance: [
      "Move forward after the candidate has made their own role, actions, and judgment concrete.",
      "Use a transition to change the evidence being explored, never to prescribe an answer framework.",
    ],
    closeGuidance: [
      "Invite a concise final reflection on impact or learning when time remains.",
      "Close without grading, coaching, or previewing post-interview feedback.",
    ],
  },
  product_sense: {
    objectives: [
      "clarify_product_goal",
      "prioritize_target_user",
      "identify_core_problem",
      "compare_solution_options",
      "make_product_recommendation",
      "define_success_and_risks",
    ],
    probeFamilies: [
      "objective_and_scope",
      "user_segmentation",
      "problem_evidence",
      "prioritization_rationale",
      "solution_tradeoffs",
      "product_detail",
      "success_metrics",
      "failure_modes",
    ],
    transitionGuidance: [
      "Advance after the candidate has made a defensible choice, without requiring a named framework.",
      "Move from problem understanding to solution reasoning without supplying ideas or priorities.",
    ],
    closeGuidance: [
      "When time remains, invite a concise recommendation, primary success measure, or material risk.",
      "Close without grading, coaching, or previewing post-interview feedback.",
    ],
  },
  execution: {
    objectives: [
      "clarify_decision_context",
      "define_primary_metric_and_guardrails",
      "diagnose_causal_drivers",
      "evaluate_execution_tradeoffs",
      "propose_experiment_or_execution_plan",
      "define_decision_thresholds",
    ],
    probeFamilies: [
      "metric_definition",
      "segmentation",
      "causal_chain",
      "instrumentation",
      "execution_tradeoffs",
      "experiment_design",
      "operational_risk",
      "rollout_and_learning",
    ],
    transitionGuidance: [
      "Advance once the candidate has stated a testable diagnosis or decision, without completing the analysis for them.",
      "Move between metrics, causes, and action while preserving the candidate's ownership of the reasoning.",
    ],
    closeGuidance: [
      "When time remains, invite a concise decision, threshold, or next validation step.",
      "Close without grading, coaching, or previewing post-interview feedback.",
    ],
  },
  strategy: {
    objectives: [
      "define_strategic_objective",
      "assess_market_and_company_position",
      "compare_strategic_alternatives",
      "reason_about_economics",
      "recommend_and_sequence",
      "identify_risks_and_reversal_conditions",
    ],
    probeFamilies: [
      "objective_and_constraints",
      "market_structure",
      "customer_value",
      "competition_and_moats",
      "business_model_economics",
      "strategic_tradeoffs",
      "sequencing",
      "critical_assumptions",
      "reversal_conditions",
    ],
    transitionGuidance: [
      "Advance after the candidate commits to a strategic premise or choice that can be examined.",
      "Move from landscape to recommendation without supplying the missing analysis or preferred option.",
    ],
    closeGuidance: [
      "When time remains, invite a concise recommendation, sequencing choice, or reversal condition.",
      "Close without grading, coaching, or previewing post-interview feedback.",
    ],
  },
} as const satisfies Record<RoundType, PmInterviewRoundPack>;

export function getPmInterviewRoundPack(
  roundType: RoundType
): PmInterviewRoundPack {
  return PM_INTERVIEW_ROUND_PACKS[roundType];
}
