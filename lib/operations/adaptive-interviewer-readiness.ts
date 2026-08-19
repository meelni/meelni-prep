import { createHash } from "node:crypto";

import {
  ADAPTIVE_INTERVIEWER_OWNER_REQUEST_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_MAX_TTL_MS,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_STAGE_DEFINITIONS,
  isInterviewerObservabilityEvent,
  repositoryAdaptiveInterviewerVersionPins,
} from "@meelni/agent";
import { createAdaptiveFeedbackRegressionFixtures } from "@meelni/test-fixtures/adaptive-feedback";

export const ADAPTIVE_INTERVIEWER_READINESS_REPORT_VERSION =
  "adaptive-interviewer-readiness-report.v1" as const;
export const ADAPTIVE_INTERVIEWER_IMPLEMENTATION_BASE_SHA =
  "eeb0eb04187899b13f7ef2e2f7d7a961cce37583" as const;

export const ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE = {
  benchmark: {
    path: "docs/evidence/sav-467-current-interviewer-baseline.json",
    sha256: "ed812951ddff990d6367c190a6ea03ad5e8bfabe20e5ad9a059e0993f3ebdc6e",
  },
  adjudication: {
    path: "docs/evidence/sav-467-interviewer-adjudication-approval.json",
    sha256: "e6e2415f7180d31dd5f34ecef69ca93c11f873fa2322e9564b3db723a2f52492",
  },
  adaptiveFeedback: {
    path: "packages/test-fixtures/src/adaptive-feedback.ts",
    sha256: "e1dc45c5e259d93a2de68f079db2bb434b8864e70fc924d6cc18e674c13d2632",
  },
  observability: {
    path: "packages/test-fixtures/interviewer-observability-wire.json",
    sha256: "fbfb28c37a3dfb41f70d73561fb27327f238c9773f2bc35e536510e3de9b40a6",
  },
} as const;

export interface AdaptiveInterviewerReadinessInputs {
  benchmarkJson: string;
  adjudicationJson: string;
  adaptiveFeedbackSource: string;
  observabilityJson: string;
}

export interface AdaptiveInterviewerReadinessReport {
  contract_version: typeof ADAPTIVE_INTERVIEWER_READINESS_REPORT_VERSION;
  implementation_base_sha: typeof ADAPTIVE_INTERVIEWER_IMPLEMENTATION_BASE_SHA;
  evidence_scope: {
    provenance: "fully_synthetic_provider_free";
    customer_data_used: false;
    provider_credentials_read: false;
    provider_calls: 0;
    production_calls: 0;
    live_rooms: 0;
    claim_boundary: "repository_contract_and_fixture_evidence_only";
  };
  frozen_inputs: readonly {
    artifact:
      | "benchmark"
      | "adjudication"
      | "adaptive_feedback"
      | "observability";
    path: string;
    sha256: string;
    digest_status: "matched";
  }[];
  benchmark_evidence: {
    claim: "current_runtime_provider_free_baseline_and_invariants_only";
    contract_version: string;
    suite_version: string;
    baseline_version: string;
    prompt_contract: string;
    input_sha256: string;
    report_sha256: string;
    aggregate_current_quality_score: number;
    aggregate_current_latency_p95_ms: number;
    deterministic_invariants: "passed";
    invariant_violations: 0;
    owner_adjudication: "product_owner_accepted_exact_candidate_manifest";
    adjudication_manifest_sha256: string;
    adjudication_authority: "semantic_gold_set_only";
    adaptive_quality_improvement_observed: false;
    shadow_entry_eligible: false;
    shadow_entry_blockers: readonly string[];
  };
  adaptive_feedback_evidence: {
    claim: "frozen_synthetic_fixture_expectations_only";
    fixture_contract_version: string;
    fixture_count: number;
    current_and_adaptive_variants: number;
    fully_synthetic: true;
    accepted_transcript_change_fixture_count: number;
    expected_outcomes: Record<string, number>;
    equal_expected_outcome_pairs: number;
    runtime_only_payloads_are_non_authoritative_by_contract: true;
    live_feedback_outcomes_observed: 0;
  };
  observability_evidence: {
    claim: "frozen_wire_contract_cases_only";
    contract_version: "interviewer-observability.v1";
    valid_case_count: number;
    invalid_case_count: number;
    expectations_matched: true;
    live_runtime_count: 0;
    live_latency_samples: 0;
    live_completion_samples: 0;
  };
  rollout_policy: {
    contract_version: typeof ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION;
    configuration_sha256: string;
    current_stage: "synthetic";
    next_stage: "preview_shadow";
    adaptive_flags_enabled: 0;
    director_adapter_version: null;
    director_model: null;
    allowed_forward_transition: "adjacent_only_with_stage_specific_owner_authorization";
    allowed_rollback: "declared_safe_target_only";
    active_session_immediate_revocation: "director_influence";
    active_session_shadow_stop: "reviewed_session_settle_or_shutdown_required";
    new_session_rollback_order: readonly [
      "director_influence",
      "director_shadow",
      "interviewer_tools",
      "interview_controller",
      "interview_brief",
    ];
  };
  owner_preparation_gate: {
    request_contract_version: typeof ADAPTIVE_INTERVIEWER_OWNER_REQUEST_CONTRACT_VERSION;
    authorization_contract_version: typeof ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION;
    selection_contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION;
    selection_status: "unselected";
    selection_configuration: null;
    selected_candidate_configuration_sha256: null;
    candidate_preparation_authorized: false;
    rollout_transition_authorized: false;
    parser_authenticates_human_identity: false;
    external_decision_reference_verification_required: true;
    authorization_max_ttl_ms: typeof ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_MAX_TTL_MS;
    second_live_authorization_rehearsal_matrix: "unbound_and_unperformed";
  };
  readiness: {
    system_recommendation: "hold_at_synthetic";
    owner_decision: "pending";
    preview_shadow_authorized: false;
    preview_influence_authorized: false;
    production_authorized: false;
    default_on_authorized: false;
    launch_go_no_go_recorded: false;
    blockers: readonly string[];
    smallest_owner_action: string;
  };
  report_sha256: string;
}

export function buildAdaptiveInterviewerReadinessReport(
  inputs: AdaptiveInterviewerReadinessInputs
): AdaptiveInterviewerReadinessReport {
  const frozenInputs = verifyFrozenInputs(inputs);
  const benchmark = parseRecord(inputs.benchmarkJson, "benchmark");
  const adjudication = parseRecord(inputs.adjudicationJson, "adjudication");
  const observability = parseArray(inputs.observabilityJson, "observability");
  assertBenchmarkEvidence(benchmark, adjudication);

  const feedbackFixtures = createAdaptiveFeedbackRegressionFixtures();
  if (
    feedbackFixtures.length === 0 ||
    feedbackFixtures.some(
      (fixture) =>
        fixture.contractVersion !== "adaptive-feedback-regression.v1" ||
        fixture.provenance !== "fully_synthetic"
    )
  ) {
    throw new Error("adaptive_interviewer_feedback_evidence_invalid");
  }

  let validCases = 0;
  let invalidCases = 0;
  for (const value of observability) {
    if (!isRecord(value) || typeof value.valid !== "boolean") {
      throw new Error("adaptive_interviewer_observability_evidence_invalid");
    }
    const actual = isInterviewerObservabilityEvent(value.event);
    if (actual !== value.valid) {
      throw new Error("adaptive_interviewer_observability_evidence_invalid");
    }
    if (actual) validCases += 1;
    else invalidCases += 1;
  }
  if (validCases === 0 || invalidCases === 0) {
    throw new Error("adaptive_interviewer_observability_evidence_invalid");
  }

  const expectedOutcomes: Record<string, number> = {};
  let equalExpectedOutcomePairs = 0;
  for (const fixture of feedbackFixtures) {
    for (const outcome of [
      fixture.expected.current.outcome,
      fixture.expected.adaptive.outcome,
    ]) {
      expectedOutcomes[outcome] = (expectedOutcomes[outcome] ?? 0) + 1;
    }
    if (
      fixture.expected.current.outcome === fixture.expected.adaptive.outcome
    ) {
      equalExpectedOutcomePairs += 1;
    }
  }

  const versions = requiredRecord(benchmark, "versions");
  const reproducibility = requiredRecord(benchmark, "reproducibility");
  const aggregate = requiredRecord(benchmark, "aggregate");
  const latency = requiredRecord(aggregate, "responseLatencyMs");
  const corpus = requiredRecord(benchmark, "corpus");
  const thresholds = requiredRecord(benchmark, "thresholds");
  const shadowEntry = requiredRecord(thresholds, "shadowEntry");

  const partialReport = {
    contract_version: ADAPTIVE_INTERVIEWER_READINESS_REPORT_VERSION,
    implementation_base_sha: ADAPTIVE_INTERVIEWER_IMPLEMENTATION_BASE_SHA,
    evidence_scope: {
      provenance: "fully_synthetic_provider_free" as const,
      customer_data_used: false as const,
      provider_credentials_read: false as const,
      provider_calls: 0 as const,
      production_calls: 0 as const,
      live_rooms: 0 as const,
      claim_boundary: "repository_contract_and_fixture_evidence_only" as const,
    },
    frozen_inputs: frozenInputs,
    benchmark_evidence: {
      claim:
        "current_runtime_provider_free_baseline_and_invariants_only" as const,
      contract_version: requiredString(benchmark, "contractVersion"),
      suite_version: requiredString(versions, "suite"),
      baseline_version: requiredString(versions, "baseline"),
      prompt_contract: requiredString(versions, "promptContract"),
      input_sha256: requiredSha256(reproducibility, "inputSha256"),
      report_sha256: requiredSha256(reproducibility, "reportSha256"),
      aggregate_current_quality_score: requiredNumber(
        aggregate,
        "qualityScore"
      ),
      aggregate_current_latency_p95_ms: requiredNumber(latency, "p95"),
      deterministic_invariants: "passed" as const,
      invariant_violations: 0 as const,
      owner_adjudication:
        "product_owner_accepted_exact_candidate_manifest" as const,
      adjudication_manifest_sha256: requiredSha256(
        corpus,
        "adjudicationManifestSha256"
      ),
      adjudication_authority: "semantic_gold_set_only" as const,
      adaptive_quality_improvement_observed: false as const,
      shadow_entry_eligible: false as const,
      shadow_entry_blockers: requiredStringArray(shadowEntry, "blockers"),
    },
    adaptive_feedback_evidence: {
      claim: "frozen_synthetic_fixture_expectations_only" as const,
      fixture_contract_version: "adaptive-feedback-regression.v1",
      fixture_count: feedbackFixtures.length,
      current_and_adaptive_variants: feedbackFixtures.length * 2,
      fully_synthetic: true as const,
      accepted_transcript_change_fixture_count: feedbackFixtures.filter(
        (fixture) => fixture.acceptedDeliveredTranscriptChanged
      ).length,
      expected_outcomes: Object.fromEntries(
        Object.entries(expectedOutcomes).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      ),
      equal_expected_outcome_pairs: equalExpectedOutcomePairs,
      runtime_only_payloads_are_non_authoritative_by_contract: true as const,
      live_feedback_outcomes_observed: 0 as const,
    },
    observability_evidence: {
      claim: "frozen_wire_contract_cases_only" as const,
      contract_version: "interviewer-observability.v1" as const,
      valid_case_count: validCases,
      invalid_case_count: invalidCases,
      expectations_matched: true as const,
      live_runtime_count: 0 as const,
      live_latency_samples: 0 as const,
      live_completion_samples: 0 as const,
    },
    rollout_policy: {
      contract_version: ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION,
      configuration_sha256: adaptiveInterviewerRolloutConfigurationSha256(),
      current_stage: "synthetic" as const,
      next_stage: "preview_shadow" as const,
      adaptive_flags_enabled: 0 as const,
      director_adapter_version: null,
      director_model: null,
      allowed_forward_transition:
        "adjacent_only_with_stage_specific_owner_authorization" as const,
      allowed_rollback: "declared_safe_target_only" as const,
      active_session_immediate_revocation: "director_influence" as const,
      active_session_shadow_stop:
        "reviewed_session_settle_or_shutdown_required" as const,
      new_session_rollback_order: [
        "director_influence",
        "director_shadow",
        "interviewer_tools",
        "interview_controller",
        "interview_brief",
      ] as const,
    },
    owner_preparation_gate: {
      request_contract_version:
        ADAPTIVE_INTERVIEWER_OWNER_REQUEST_CONTRACT_VERSION,
      authorization_contract_version:
        ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION,
      selection_contract_version:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION,
      selection_status: "unselected" as const,
      selection_configuration: null,
      selected_candidate_configuration_sha256: null,
      candidate_preparation_authorized: false as const,
      rollout_transition_authorized: false as const,
      parser_authenticates_human_identity: false as const,
      external_decision_reference_verification_required: true as const,
      authorization_max_ttl_ms:
        ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_MAX_TTL_MS,
      second_live_authorization_rehearsal_matrix:
        "unbound_and_unperformed" as const,
    },
    readiness: {
      system_recommendation: "hold_at_synthetic" as const,
      owner_decision: "pending" as const,
      preview_shadow_authorized: false as const,
      preview_influence_authorized: false as const,
      production_authorized: false as const,
      default_on_authorized: false as const,
      launch_go_no_go_recorded: false as const,
      blockers: [
        "adaptive_candidate_quality_improvement_not_measured",
        "director_adapter_provider_model_not_selected_or_authorized",
        "preview_spend_privacy_retention_not_authorized",
        "preview_numeric_entry_and_stop_thresholds_not_owner_accepted",
        "preview_live_voice_rehearsal_not_run",
        "in_flight_preview_shadow_settle_shutdown_rehearsal_not_run",
        "all_round_adverse_voice_rehearsal_matrix_unbound_and_unperformed",
        "live_latency_completion_freshness_and_recovery_evidence_missing",
        "exact_candidate_owner_authorization_missing",
      ],
      smallest_owner_action:
        "After this repository packet is merged, fill the closed preview-shadow selection with an adapter/provider/model, integer Preview session and nano-USD caps, accepted synthetic-only privacy/retention terms, and coherent integer bps/ms entry and stop thresholds. Then record a current external owner decision reference authorizing only preparation against the exact origin/main SHA, repository configuration digest, and recomputed selected-candidate configuration digest. A trusted supervisor must verify that reference; parsing alone does not authenticate the owner. SAV-476 still requires a second exact-candidate authorization and an all-round/adverse-voice rehearsal matrix before any provider call, spend, deployment, or live room.",
    },
  };
  const reportSha256 = sha256(JSON.stringify(partialReport));
  return { ...partialReport, report_sha256: reportSha256 };
}

export function serializeAdaptiveInterviewerReadinessReport(
  report: AdaptiveInterviewerReadinessReport
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function adaptiveInterviewerRolloutConfigurationSha256(): string {
  return sha256(
    JSON.stringify({
      contract_version: ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION,
      stages: ADAPTIVE_INTERVIEWER_STAGE_DEFINITIONS,
      version_pins: repositoryAdaptiveInterviewerVersionPins(),
    })
  );
}

function verifyFrozenInputs(inputs: AdaptiveInterviewerReadinessInputs) {
  const values = [
    [
      "benchmark",
      inputs.benchmarkJson,
      ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.benchmark,
    ],
    [
      "adjudication",
      inputs.adjudicationJson,
      ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.adjudication,
    ],
    [
      "adaptive_feedback",
      inputs.adaptiveFeedbackSource,
      ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.adaptiveFeedback,
    ],
    [
      "observability",
      inputs.observabilityJson,
      ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.observability,
    ],
  ] as const;
  return values.map(([artifact, contents, expected]) => {
    const actual = sha256(contents);
    if (actual !== expected.sha256) {
      throw new Error(
        `adaptive_interviewer_frozen_input_digest_mismatch:${artifact}`
      );
    }
    return {
      artifact,
      path: expected.path,
      sha256: actual,
      digest_status: "matched" as const,
    };
  });
}

function assertBenchmarkEvidence(
  benchmark: Record<string, unknown>,
  adjudication: Record<string, unknown>
): void {
  const execution = requiredRecord(benchmark, "execution");
  const authorization = requiredRecord(execution, "authorization");
  const invariants = requiredRecord(benchmark, "deterministicInvariants");
  const owner = requiredRecord(benchmark, "ownerAdjudication");
  const approval = requiredRecord(owner, "approval");
  const scope = requiredRecord(approval, "authorityScope");
  const thresholds = requiredRecord(benchmark, "thresholds");
  const shadowEntry = requiredRecord(thresholds, "shadowEntry");
  const candidateManifest = requiredRecord(adjudication, "candidateManifest");
  const adjudicationScope = requiredRecord(adjudication, "authorityScope");

  if (
    benchmark.contractVersion !== "meelni.interviewer-benchmark-report.v3" ||
    benchmark.conclusion !== "baseline_recorded_owner_adjudication_accepted" ||
    execution.kind !== "provider_free_replay" ||
    execution.fullySyntheticOnly !== true ||
    execution.customerDataUsed !== false ||
    execution.providerCredentialRead !== false ||
    execution.productionCalled !== false ||
    execution.providerCalls !== 0 ||
    execution.actualCostUsd !== 0 ||
    authorization.kind !== "provider_free" ||
    invariants.status !== "passed" ||
    invariants.baselineViolations !== 0 ||
    owner.status !== "product_owner_accepted_exact_candidate_manifest" ||
    scope.semanticGoldSetAdjudicationOnly !== true ||
    scope.runtimeBehaviorAuthority !== false ||
    scope.providerCallAuthority !== false ||
    scope.productionAuthority !== false ||
    scope.sav476GoNoGoAuthority !== false ||
    shadowEntry.eligible !== false ||
    candidateManifest.sha256 !==
      "312e086a46334ab3af3907406c90302990ab3ea90063e2ecc6428e17af30c70f" ||
    adjudicationScope.semanticGoldSetAdjudicationOnly !== true ||
    adjudicationScope.runtimeBehaviorAuthority !== false ||
    adjudicationScope.providerCallAuthority !== false ||
    adjudicationScope.productionAuthority !== false ||
    adjudicationScope.sav476GoNoGoAuthority !== false
  ) {
    throw new Error("adaptive_interviewer_benchmark_evidence_invalid");
  }
}

function parseRecord(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`adaptive_interviewer_${label}_evidence_invalid`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`adaptive_interviewer_${label}_evidence_invalid`);
  }
  return parsed;
}

function parseArray(value: string, label: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`adaptive_interviewer_${label}_evidence_invalid`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`adaptive_interviewer_${label}_evidence_invalid`);
  }
  return parsed;
}

function requiredRecord(
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const result = value[key];
  if (!isRecord(result))
    throw new Error("adaptive_interviewer_evidence_invalid");
  return result;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== "string" || result.length === 0) {
    throw new Error("adaptive_interviewer_evidence_invalid");
  }
  return result;
}

function requiredSha256(value: Record<string, unknown>, key: string): string {
  const result = requiredString(value, key);
  if (!/^[0-9a-f]{64}$/.test(result)) {
    throw new Error("adaptive_interviewer_evidence_invalid");
  }
  return result;
}

function requiredNumber(value: Record<string, unknown>, key: string): number {
  const result = value[key];
  if (typeof result !== "number" || !Number.isFinite(result) || result < 0) {
    throw new Error("adaptive_interviewer_evidence_invalid");
  }
  return result;
}

function requiredStringArray(
  value: Record<string, unknown>,
  key: string
): string[] {
  const result = value[key];
  if (
    !Array.isArray(result) ||
    result.length === 0 ||
    result.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new Error("adaptive_interviewer_evidence_invalid");
  }
  return [...result];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
