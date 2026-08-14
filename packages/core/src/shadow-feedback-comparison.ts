import {
  FEEDBACK_DIMENSIONS,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  type DimensionCoverageFeedbackMode,
  type DimensionCoverageFeedbackResult,
} from "./feedback-dimension-coverage";
import type { FeedbackDimension } from "./evaluation";
import type { RoundType } from "./interview";
import {
  SHADOW_FEEDBACK_ARTIFACT_SET_VERSION,
  createShadowFeedbackArtifactKey,
  parseShadowFeedbackArtifact,
  parseShadowFeedbackArtifactKey,
  type ShadowFeedbackArtifactFailureClass,
  type ShadowFeedbackArtifactKeyV1,
  type ShadowFeedbackArtifactSetV1,
  type ShadowFeedbackArtifactV1,
} from "./shadow-feedback-artifact";
import {
  TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION,
  TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION,
  type TrustedAnswerBlockProjection,
} from "./trusted-answer-block-authority";

export const SHADOW_FEEDBACK_SCHEDULING_INTENT_VERSION =
  "feedback.shadow-scheduling-intent.v1" as const;
export const SHADOW_FEEDBACK_BATCH_AUTHORITY_VERSION =
  "feedback.shadow-batch-authority.v1" as const;
export const SHADOW_FEEDBACK_COST_RATES_VERSION =
  "feedback.shadow-cost-rates.v1" as const;
export const SHADOW_FEEDBACK_COMPARISON_REPORT_VERSION =
  "feedback.shadow-comparison-report.v1" as const;

const MAX_VERSION_LENGTH = 96;
const MAX_ARTIFACTS = 1_000;
const MAX_AGGREGATE_COUNT = 10_000;
const MAX_TOKEN_COUNT = 10_000_000_000;
const MAX_RATE_MICROS_PER_MILLION = 1_000_000_000;
const MAX_COST_MICROS = 10_000_000_000_000;
const MAX_EPOCH_MS = 8_640_000_000_000_000;
const MAX_POST_FREEZE_WINDOW_MS = 300_000;
const MAX_REPORT_SERIALIZED_BYTES = 16_000;

const FAILURE_CLASSES: readonly ShadowFeedbackArtifactFailureClass[] = [
  "deadline_exceeded",
  "transport_timeout",
  "transport_network",
  "provider_rate_limited",
  "provider_capacity",
  "provider_authentication",
  "provider_configuration",
  "provider_refusal",
  "provider_schema",
  "provider_contract",
  "evidence_integrity",
  "fenced",
  "persistence",
  "internal",
];

export interface ShadowFeedbackSchedulingIntentV1 {
  contractVersion: typeof SHADOW_FEEDBACK_SCHEDULING_INTENT_VERSION;
  intentId: `shadow-feedback-intent.v1:${string}`;
  idempotencyKey: `shadow-feedback-intent.v1:${string}`;
  terminalFreezeAnchorAtMs: number;
  key: ShadowFeedbackArtifactKeyV1;
}

export interface ShadowFeedbackBatchFacetAuthorityV1 {
  facetCode: string;
  trustedBlockFingerprint: `trusted-answer-block.v1:${string}`;
}

export interface ShadowFeedbackBatchDimensionAuthorityV1 {
  score: number | null;
  facets: ShadowFeedbackBatchFacetAuthorityV1[];
}

export interface ShadowFeedbackBatchAuthorityV1 {
  contractVersion: typeof SHADOW_FEEDBACK_BATCH_AUTHORITY_VERSION;
  sessionId: string;
  terminalFreezeAnchorAtMs: number;
  completedAtMs: number;
  roundType: RoundType;
  mode: DimensionCoverageFeedbackMode;
  dimensions: Record<
    FeedbackDimension,
    ShadowFeedbackBatchDimensionAuthorityV1
  >;
}

export interface ShadowFeedbackCostRatesV1 {
  contractVersion: typeof SHADOW_FEEDBACK_COST_RATES_VERSION;
  inputMicrosPerMillion: number;
  cachedInputMicrosPerMillion: number;
  outputMicrosPerMillion: number;
}

export interface ShadowFeedbackComparisonReportV1 {
  contractVersion: typeof SHADOW_FEEDBACK_COMPARISON_REPORT_VERSION;
  status: "complete" | "incomplete" | "invalid";
  artifacts: {
    expected: number;
    completed: number;
    failed: number;
    missing: number;
  };
  facets: {
    matched: number;
    batchOnly: number;
    shadowOnly: number;
  };
  mode: {
    agreement: "agree" | "disagree" | "unavailable";
    batch: DimensionCoverageFeedbackMode | null;
    shadow: DimensionCoverageFeedbackMode | null;
  };
  scores: {
    comparable: number;
    exact: number;
    withinOne: number;
    disagree: number;
    notComparable: number;
  };
  failures: Record<ShadowFeedbackArtifactFailureClass, number>;
  usage: {
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    estimatedCostMicros: number | null;
  };
  latency: {
    kind: "post_freeze_potential" | "unavailable";
    potentialLeadMs: number | null;
  };
  execution: {
    replay: "completed_work_deduplicated";
    ambiguousExternalCompletion: "requires_evaluator_idempotency";
  };
}

export type ShadowFeedbackComparisonParseErrorCode =
  | "version_unsupported"
  | "invalid_shape"
  | "authority_mismatch"
  | "report_too_large";

export class ShadowFeedbackComparisonParseError extends Error {
  constructor(readonly code: ShadowFeedbackComparisonParseErrorCode) {
    super(code);
    this.name = "ShadowFeedbackComparisonParseError";
  }
}

/**
 * Create content-free work identities only from a successful SAV-441
 * projection. The workflow must recompute the projection from its frozen
 * source before calling this function.
 */
export function createShadowFeedbackSchedulingIntents(input: {
  sessionId: string;
  projection: TrustedAnswerBlockProjection;
  terminalFreezeAnchorAtMs: number;
  rubricVersion: string;
  promptVersion: string;
  selectionSchemaVersion: string;
  modelVersion: string;
}): ShadowFeedbackSchedulingIntentV1[] {
  const sessionId = requireUuid(input.sessionId);
  const terminalFreezeAnchorAtMs = requireEpochMs(
    input.terminalFreezeAnchorAtMs
  );
  requireVersion(input.rubricVersion);
  requireVersion(input.promptVersion);
  requireVersion(input.selectionSchemaVersion);
  requireVersion(input.modelVersion);
  assertSchedulableProjection(input.projection);
  if (
    input.projection.status !== "complete" &&
    input.projection.status !== "verified_prefix"
  ) {
    return [];
  }

  const seen = new Set<string>();
  return input.projection.trustedBlockIdentities.map((identity, index) => {
    const block = input.projection.trustedBlocks[index]!;
    if (
      identity.contractVersion !== TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION ||
      identity.answerBlockId !== block.answerBlockId ||
      !isTrustedBlockFingerprint(identity.identity) ||
      seen.has(identity.identity)
    ) {
      throw new ShadowFeedbackComparisonParseError("authority_mismatch");
    }
    seen.add(identity.identity);
    const key = createShadowFeedbackArtifactKey({
      sessionId,
      trustedBlockIdentity: identity,
      rubricVersion: input.rubricVersion,
      promptVersion: input.promptVersion,
      selectionSchemaVersion: input.selectionSchemaVersion,
      modelVersion: input.modelVersion,
    });
    const digest = key.keyFingerprint.slice(
      "shadow-feedback-artifact-key.v1:".length
    );
    const intentId = `shadow-feedback-intent.v1:${digest}` as const;
    return {
      contractVersion: SHADOW_FEEDBACK_SCHEDULING_INTENT_VERSION,
      intentId,
      idempotencyKey: intentId,
      terminalFreezeAnchorAtMs,
      key,
    };
  });
}

export function parseShadowFeedbackSchedulingIntent(
  value: unknown
): ShadowFeedbackSchedulingIntentV1 {
  const root = requireRecord(value);
  if (root.contractVersion !== SHADOW_FEEDBACK_SCHEDULING_INTENT_VERSION) {
    throw new ShadowFeedbackComparisonParseError("version_unsupported");
  }
  requireExactKeys(root, [
    "contractVersion",
    "intentId",
    "idempotencyKey",
    "terminalFreezeAnchorAtMs",
    "key",
  ]);
  const key = parseShadowFeedbackArtifactKey(root.key);
  const digest = key.keyFingerprint.slice(
    "shadow-feedback-artifact-key.v1:".length
  );
  const intentId = `shadow-feedback-intent.v1:${digest}` as const;
  if (root.intentId !== intentId || root.idempotencyKey !== intentId) {
    throw new ShadowFeedbackComparisonParseError("authority_mismatch");
  }
  return {
    contractVersion: SHADOW_FEEDBACK_SCHEDULING_INTENT_VERSION,
    intentId,
    idempotencyKey: intentId,
    terminalFreezeAnchorAtMs: requireEpochMs(root.terminalFreezeAnchorAtMs),
    key,
  };
}

export function createShadowFeedbackBatchAuthority(input: {
  feedback: DimensionCoverageFeedbackResult;
  projection: TrustedAnswerBlockProjection;
  sessionId: string;
  terminalFreezeAnchorAtMs: number;
  completedAtMs: number;
}): ShadowFeedbackBatchAuthorityV1 {
  const sessionId = requireUuid(input.sessionId);
  const terminalFreezeAnchorAtMs = requireEpochMs(
    input.terminalFreezeAnchorAtMs
  );
  const completedAtMs = requireEpochMs(input.completedAtMs);
  if (completedAtMs < terminalFreezeAnchorAtMs) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  assertSchedulableProjection(input.projection);
  if (
    input.projection.status !== "complete" &&
    input.projection.status !== "verified_prefix"
  ) {
    throw new ShadowFeedbackComparisonParseError("authority_mismatch");
  }
  const identityByAnswerBlock = new Map(
    input.projection.trustedBlockIdentities.map((identity, index) => {
      const block = input.projection.trustedBlocks[index]!;
      if (
        identity.contractVersion !== TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION ||
        identity.answerBlockId !== block.answerBlockId ||
        !isTrustedBlockFingerprint(identity.identity)
      ) {
        throw new ShadowFeedbackComparisonParseError("authority_mismatch");
      }
      return [identity.answerBlockId, identity.identity] as const;
    })
  );
  if (identityByAnswerBlock.size !== input.projection.trustedBlocks.length) {
    throw new ShadowFeedbackComparisonParseError("authority_mismatch");
  }
  const roundType = requireRoundType(input.feedback.roundType);
  const dimensions = {} as ShadowFeedbackBatchAuthorityV1["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const source = input.feedback.dimensions[dimension];
    const facets = source.evidence.map((evidence) => {
      const trustedBlockFingerprint = identityByAnswerBlock.get(
        evidence.answerBlockRef
      );
      if (
        !trustedBlockFingerprint ||
        !isAllowedFacet(roundType, dimension, evidence.facetCode)
      ) {
        throw new ShadowFeedbackComparisonParseError("authority_mismatch");
      }
      return {
        facetCode: evidence.facetCode,
        trustedBlockFingerprint,
      };
    });
    if (
      facets.length > 2 ||
      new Set(facets.map(({ facetCode }) => facetCode)).size !== facets.length
    ) {
      throw new ShadowFeedbackComparisonParseError("invalid_shape");
    }
    dimensions[dimension] = {
      score: requireNullableScore(source.score),
      facets: facets.sort(compareFacetAuthority),
    };
  }
  return parseShadowFeedbackBatchAuthority({
    contractVersion: SHADOW_FEEDBACK_BATCH_AUTHORITY_VERSION,
    sessionId,
    terminalFreezeAnchorAtMs,
    completedAtMs,
    roundType,
    mode: input.feedback.mode,
    dimensions,
  });
}

export function parseShadowFeedbackBatchAuthority(
  value: unknown
): ShadowFeedbackBatchAuthorityV1 {
  const root = requireRecord(value);
  if (root.contractVersion !== SHADOW_FEEDBACK_BATCH_AUTHORITY_VERSION) {
    throw new ShadowFeedbackComparisonParseError("version_unsupported");
  }
  requireExactKeys(root, [
    "contractVersion",
    "sessionId",
    "terminalFreezeAnchorAtMs",
    "completedAtMs",
    "roundType",
    "mode",
    "dimensions",
  ]);
  const sessionId = requireUuid(root.sessionId);
  const terminalFreezeAnchorAtMs = requireEpochMs(
    root.terminalFreezeAnchorAtMs
  );
  const completedAtMs = requireEpochMs(root.completedAtMs);
  if (completedAtMs < terminalFreezeAnchorAtMs) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const roundType = requireRoundType(root.roundType);
  const mode = requireMode(root.mode);
  const dimensionRoot = requireRecord(root.dimensions);
  requireExactKeys(dimensionRoot, FEEDBACK_DIMENSIONS);
  const dimensions = {} as ShadowFeedbackBatchAuthorityV1["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const item = requireRecord(dimensionRoot[dimension]);
    requireExactKeys(item, ["score", "facets"]);
    if (!Array.isArray(item.facets) || item.facets.length > 2) {
      throw new ShadowFeedbackComparisonParseError("invalid_shape");
    }
    const facets = item.facets.map((facet) => {
      const facetRoot = requireRecord(facet);
      requireExactKeys(facetRoot, ["facetCode", "trustedBlockFingerprint"]);
      if (
        typeof facetRoot.facetCode !== "string" ||
        !isAllowedFacet(roundType, dimension, facetRoot.facetCode) ||
        !isTrustedBlockFingerprint(facetRoot.trustedBlockFingerprint)
      ) {
        throw new ShadowFeedbackComparisonParseError("invalid_shape");
      }
      return {
        facetCode: facetRoot.facetCode,
        trustedBlockFingerprint: facetRoot.trustedBlockFingerprint,
      };
    });
    if (
      new Set(facets.map(({ facetCode }) => facetCode)).size !== facets.length
    ) {
      throw new ShadowFeedbackComparisonParseError("invalid_shape");
    }
    dimensions[dimension] = {
      score: requireNullableScore(item.score),
      facets: facets.sort(compareFacetAuthority),
    };
  }
  return {
    contractVersion: SHADOW_FEEDBACK_BATCH_AUTHORITY_VERSION,
    sessionId,
    terminalFreezeAnchorAtMs,
    completedAtMs,
    roundType,
    mode,
    dimensions,
  };
}

export function parseShadowFeedbackCostRates(
  value: unknown
): ShadowFeedbackCostRatesV1 {
  const root = requireRecord(value);
  if (root.contractVersion !== SHADOW_FEEDBACK_COST_RATES_VERSION) {
    throw new ShadowFeedbackComparisonParseError("version_unsupported");
  }
  requireExactKeys(root, [
    "contractVersion",
    "inputMicrosPerMillion",
    "cachedInputMicrosPerMillion",
    "outputMicrosPerMillion",
  ]);
  return {
    contractVersion: SHADOW_FEEDBACK_COST_RATES_VERSION,
    inputMicrosPerMillion: requireInteger(
      root.inputMicrosPerMillion,
      0,
      MAX_RATE_MICROS_PER_MILLION
    ),
    cachedInputMicrosPerMillion: requireInteger(
      root.cachedInputMicrosPerMillion,
      0,
      MAX_RATE_MICROS_PER_MILLION
    ),
    outputMicrosPerMillion: requireInteger(
      root.outputMicrosPerMillion,
      0,
      MAX_RATE_MICROS_PER_MILLION
    ),
  };
}

export function compareShadowFeedbackWithBatch(input: {
  batchAuthority: unknown;
  artifactSet: unknown;
  terminalFreezeAnchorAtMs: number;
  costRates?: unknown | null;
}): ShadowFeedbackComparisonReportV1 {
  try {
    const batch = parseShadowFeedbackBatchAuthority(input.batchAuthority);
    const artifactSet = parseArtifactSet(input.artifactSet);
    const terminalFreezeAnchorAtMs = requireEpochMs(
      input.terminalFreezeAnchorAtMs
    );
    if (
      batch.sessionId !== artifactSet.sessionId ||
      batch.terminalFreezeAnchorAtMs !== terminalFreezeAnchorAtMs
    ) {
      return invalidReport();
    }
    const rates =
      input.costRates === null || input.costRates === undefined
        ? null
        : parseShadowFeedbackCostRates(input.costRates);
    const completedArtifacts =
      artifactSet.artifacts.filter(isCompletedArtifact);
    if (
      completedArtifacts.some(
        (artifact) => artifact.outcome.roundType !== batch.roundType
      )
    ) {
      return invalidReport();
    }
    const failedArtifacts = artifactSet.artifacts.filter(
      (artifact) => artifact.outcome.state === "failed"
    );
    const shadowFacetSet = new Set<string>();
    const batchFacetSet = new Set<string>();
    for (const artifact of completedArtifacts) {
      if (artifact.outcome.state !== "completed") continue;
      for (const dimension of FEEDBACK_DIMENSIONS) {
        for (const facetCode of artifact.outcome.dimensions[dimension]
          .facetCodes) {
          shadowFacetSet.add(
            facetIdentity(
              dimension,
              facetCode,
              artifact.key.trustedBlockFingerprint
            )
          );
        }
      }
    }
    for (const dimension of FEEDBACK_DIMENSIONS) {
      for (const facet of batch.dimensions[dimension].facets) {
        batchFacetSet.add(
          facetIdentity(
            dimension,
            facet.facetCode,
            facet.trustedBlockFingerprint
          )
        );
      }
    }
    const matched = [...batchFacetSet].filter((facet) =>
      shadowFacetSet.has(facet)
    ).length;
    const shadowMode = deriveShadowMode(completedArtifacts);
    const scoreCounts = compareScores(batch, completedArtifacts);
    const failures = emptyFailureCounts();
    for (const artifact of failedArtifacts) {
      if (artifact.outcome.state === "failed") {
        failures[artifact.outcome.failureClass] += 1;
      }
    }
    const usage = aggregateUsage(artifactSet, rates);
    const latency = compareLatency(
      batch,
      artifactSet,
      terminalFreezeAnchorAtMs
    );
    return parseShadowFeedbackComparisonReport({
      contractVersion: SHADOW_FEEDBACK_COMPARISON_REPORT_VERSION,
      status:
        artifactSet.status === "complete" && failedArtifacts.length === 0
          ? "complete"
          : "incomplete",
      artifacts: {
        expected: artifactSet.expectedKeyFingerprints.length,
        completed: completedArtifacts.length,
        failed: failedArtifacts.length,
        missing: artifactSet.missingKeyFingerprints.length,
      },
      facets: {
        matched,
        batchOnly: batchFacetSet.size - matched,
        shadowOnly: shadowFacetSet.size - matched,
      },
      mode: {
        agreement:
          shadowMode === null
            ? "unavailable"
            : shadowMode === batch.mode
              ? "agree"
              : "disagree",
        batch: batch.mode,
        shadow: shadowMode,
      },
      scores: scoreCounts,
      failures,
      usage,
      latency,
      execution: {
        replay: "completed_work_deduplicated",
        ambiguousExternalCompletion: "requires_evaluator_idempotency",
      },
    });
  } catch {
    return invalidReport();
  }
}

export function parseShadowFeedbackComparisonReport(
  value: unknown
): ShadowFeedbackComparisonReportV1 {
  const root = requireRecord(value);
  if (root.contractVersion !== SHADOW_FEEDBACK_COMPARISON_REPORT_VERSION) {
    throw new ShadowFeedbackComparisonParseError("version_unsupported");
  }
  requireExactKeys(root, [
    "contractVersion",
    "status",
    "artifacts",
    "facets",
    "mode",
    "scores",
    "failures",
    "usage",
    "latency",
    "execution",
  ]);
  if (
    root.status !== "complete" &&
    root.status !== "incomplete" &&
    root.status !== "invalid"
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const artifacts = parseCountRecord(root.artifacts, [
    "expected",
    "completed",
    "failed",
    "missing",
  ]);
  if (
    artifacts.completed + artifacts.failed + artifacts.missing !==
    artifacts.expected
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  if (
    (root.status === "complete" &&
      (artifacts.expected === 0 ||
        artifacts.missing !== 0 ||
        artifacts.failed !== 0)) ||
    (root.status === "incomplete" &&
      (artifacts.expected === 0 ||
        (artifacts.missing === 0 && artifacts.failed === 0))) ||
    (root.status === "invalid" &&
      (artifacts.expected !== 0 ||
        artifacts.completed !== 0 ||
        artifacts.failed !== 0 ||
        artifacts.missing !== 0))
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const facets = parseCountRecord(root.facets, [
    "matched",
    "batchOnly",
    "shadowOnly",
  ]);
  const modeRoot = requireRecord(root.mode);
  requireExactKeys(modeRoot, ["agreement", "batch", "shadow"]);
  if (
    modeRoot.agreement !== "agree" &&
    modeRoot.agreement !== "disagree" &&
    modeRoot.agreement !== "unavailable"
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const batchMode =
    modeRoot.batch === null ? null : requireMode(modeRoot.batch);
  const shadowMode =
    modeRoot.shadow === null ? null : requireMode(modeRoot.shadow);
  if (
    (modeRoot.agreement === "unavailable") !== (shadowMode === null) ||
    (root.status !== "invalid" && batchMode === null) ||
    (modeRoot.agreement === "agree" && batchMode !== shadowMode) ||
    (modeRoot.agreement === "disagree" && batchMode === shadowMode)
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const scores = parseCountRecord(root.scores, [
    "comparable",
    "exact",
    "withinOne",
    "disagree",
    "notComparable",
  ]);
  if (
    scores.exact + scores.withinOne + scores.disagree !== scores.comparable ||
    scores.comparable + scores.notComparable !== FEEDBACK_DIMENSIONS.length
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const failureRoot = requireRecord(root.failures);
  requireExactKeys(failureRoot, FAILURE_CLASSES);
  const failures = {} as Record<ShadowFeedbackArtifactFailureClass, number>;
  for (const failureClass of FAILURE_CLASSES) {
    failures[failureClass] = requireInteger(
      failureRoot[failureClass],
      0,
      MAX_AGGREGATE_COUNT
    );
  }
  if (
    Object.values(failures).reduce((sum, count) => sum + count, 0) !==
    artifacts.failed
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const usageRoot = requireRecord(root.usage);
  requireExactKeys(usageRoot, [
    "inputTokens",
    "cachedInputTokens",
    "outputTokens",
    "totalTokens",
    "estimatedCostMicros",
  ]);
  const usageValues = [
    usageRoot.inputTokens,
    usageRoot.cachedInputTokens,
    usageRoot.outputTokens,
    usageRoot.totalTokens,
  ];
  const usageAllNull = usageValues.every((item) => item === null);
  const usageAllNumbers = usageValues.every(
    (item) => Number.isSafeInteger(item) && (item as number) >= 0
  );
  if (!usageAllNull && !usageAllNumbers) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const inputTokens = requireNullableInteger(
    usageRoot.inputTokens,
    MAX_TOKEN_COUNT
  );
  const cachedInputTokens = requireNullableInteger(
    usageRoot.cachedInputTokens,
    MAX_TOKEN_COUNT
  );
  const outputTokens = requireNullableInteger(
    usageRoot.outputTokens,
    MAX_TOKEN_COUNT
  );
  const totalTokens = requireNullableInteger(
    usageRoot.totalTokens,
    MAX_TOKEN_COUNT
  );
  if (
    inputTokens !== null &&
    (cachedInputTokens! > inputTokens ||
      totalTokens !== inputTokens + outputTokens!)
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const estimatedCostMicros = requireNullableInteger(
    usageRoot.estimatedCostMicros,
    MAX_COST_MICROS
  );
  if (usageAllNull && estimatedCostMicros !== null) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const latencyRoot = requireRecord(root.latency);
  requireExactKeys(latencyRoot, ["kind", "potentialLeadMs"]);
  if (
    latencyRoot.kind !== "post_freeze_potential" &&
    latencyRoot.kind !== "unavailable"
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const potentialLeadMs = requireNullableInteger(
    latencyRoot.potentialLeadMs,
    MAX_POST_FREEZE_WINDOW_MS
  );
  if (
    (latencyRoot.kind === "post_freeze_potential") !==
      (potentialLeadMs !== null) ||
    (root.status !== "complete" && latencyRoot.kind !== "unavailable")
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  if (
    root.status === "invalid" &&
    (facets.matched !== 0 ||
      facets.batchOnly !== 0 ||
      facets.shadowOnly !== 0 ||
      modeRoot.agreement !== "unavailable" ||
      batchMode !== null ||
      shadowMode !== null ||
      scores.comparable !== 0 ||
      scores.exact !== 0 ||
      scores.withinOne !== 0 ||
      scores.disagree !== 0 ||
      scores.notComparable !== FEEDBACK_DIMENSIONS.length ||
      !usageAllNull ||
      estimatedCostMicros !== null ||
      latencyRoot.kind !== "unavailable" ||
      potentialLeadMs !== null)
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const executionRoot = requireRecord(root.execution);
  requireExactKeys(executionRoot, ["replay", "ambiguousExternalCompletion"]);
  if (
    executionRoot.replay !== "completed_work_deduplicated" ||
    executionRoot.ambiguousExternalCompletion !==
      "requires_evaluator_idempotency"
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const report: ShadowFeedbackComparisonReportV1 = {
    contractVersion: SHADOW_FEEDBACK_COMPARISON_REPORT_VERSION,
    status: root.status,
    artifacts,
    facets,
    mode: {
      agreement: modeRoot.agreement,
      batch: batchMode,
      shadow: shadowMode,
    },
    scores,
    failures,
    usage: {
      inputTokens,
      cachedInputTokens,
      outputTokens,
      totalTokens,
      estimatedCostMicros,
    },
    latency: {
      kind: latencyRoot.kind,
      potentialLeadMs,
    },
    execution: {
      replay: "completed_work_deduplicated",
      ambiguousExternalCompletion: "requires_evaluator_idempotency",
    },
  };
  if (
    new TextEncoder().encode(JSON.stringify(report)).byteLength >
    MAX_REPORT_SERIALIZED_BYTES
  ) {
    throw new ShadowFeedbackComparisonParseError("report_too_large");
  }
  return report;
}

function parseArtifactSet(value: unknown): ShadowFeedbackArtifactSetV1 {
  const root = requireRecord(value);
  if (root.contractVersion !== SHADOW_FEEDBACK_ARTIFACT_SET_VERSION) {
    throw new ShadowFeedbackComparisonParseError("version_unsupported");
  }
  requireExactKeys(root, [
    "contractVersion",
    "sessionId",
    "status",
    "expectedKeyFingerprints",
    "artifacts",
    "missingKeyFingerprints",
    "failedKeyFingerprints",
  ]);
  if (
    root.status !== "complete" &&
    root.status !== "incomplete" &&
    root.status !== "invalid"
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  if (
    !Array.isArray(root.expectedKeyFingerprints) ||
    !Array.isArray(root.artifacts) ||
    !Array.isArray(root.missingKeyFingerprints) ||
    !Array.isArray(root.failedKeyFingerprints) ||
    root.expectedKeyFingerprints.length === 0 ||
    root.expectedKeyFingerprints.length > MAX_ARTIFACTS
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const expectedKeyFingerprints = root.expectedKeyFingerprints.map(
    requireArtifactKeyFingerprint
  );
  const missingKeyFingerprints = root.missingKeyFingerprints.map(
    requireArtifactKeyFingerprint
  );
  const failedKeyFingerprints = root.failedKeyFingerprints.map(
    requireArtifactKeyFingerprint
  );
  const artifacts = root.artifacts.map(parseShadowFeedbackArtifact);
  const sessionId = requireUuid(root.sessionId);
  const expected = new Set(expectedKeyFingerprints);
  const present = new Set(
    artifacts.map((artifact) => artifact.key.keyFingerprint)
  );
  const missing = new Set(missingKeyFingerprints);
  const declaredFailed = new Set(failedKeyFingerprints);
  const actualFailed = new Set(
    artifacts.flatMap((artifact) =>
      artifact.outcome.state === "failed" ? [artifact.key.keyFingerprint] : []
    )
  );
  if (
    root.status === "invalid" ||
    expected.size !== expectedKeyFingerprints.length ||
    present.size !== artifacts.length ||
    missing.size !== missingKeyFingerprints.length ||
    declaredFailed.size !== failedKeyFingerprints.length ||
    artifacts.some((artifact) => artifact.key.sessionId !== sessionId)
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  if (
    [...present].some((fingerprint) => !expected.has(fingerprint)) ||
    [...missing].some(
      (fingerprint) => !expected.has(fingerprint) || present.has(fingerprint)
    ) ||
    expected.size !== present.size + missing.size ||
    [...expected].some(
      (fingerprint) => !present.has(fingerprint) && !missing.has(fingerprint)
    ) ||
    !setsEqual(declaredFailed, actualFailed) ||
    (root.status === "complete" &&
      (missing.size !== 0 || declaredFailed.size !== 0)) ||
    (root.status === "incomplete" &&
      missing.size === 0 &&
      declaredFailed.size === 0)
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  return {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_SET_VERSION,
    sessionId,
    status: root.status,
    expectedKeyFingerprints,
    artifacts,
    missingKeyFingerprints,
    failedKeyFingerprints,
  };
}

function compareScores(
  batch: ShadowFeedbackBatchAuthorityV1,
  completedArtifacts: readonly ReturnType<typeof parseShadowFeedbackArtifact>[]
): ShadowFeedbackComparisonReportV1["scores"] {
  let exact = 0;
  let withinOne = 0;
  let disagree = 0;
  let notComparable = 0;
  const artifactByBlock = new Map(
    completedArtifacts.map((artifact) => [
      artifact.key.trustedBlockFingerprint,
      artifact,
    ])
  );
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const source = batch.dimensions[dimension];
    const blockFingerprints = new Set(
      source.facets.map(({ trustedBlockFingerprint }) =>
        String(trustedBlockFingerprint)
      )
    );
    const blockFingerprint =
      source.score !== null &&
      source.facets.length === 2 &&
      blockFingerprints.size === 1
        ? source.facets[0]!.trustedBlockFingerprint
        : null;
    const artifact = blockFingerprint
      ? artifactByBlock.get(blockFingerprint)
      : undefined;
    if (!artifact || artifact.outcome.state !== "completed") {
      notComparable += 1;
      continue;
    }
    const shadowDimension = artifact.outcome.dimensions[dimension];
    const batchFacets = source.facets.map(({ facetCode }) => facetCode).sort();
    if (
      shadowDimension.score === null ||
      JSON.stringify(shadowDimension.facetCodes) !== JSON.stringify(batchFacets)
    ) {
      notComparable += 1;
      continue;
    }
    const difference = Math.abs(source.score! - shadowDimension.score);
    if (difference === 0) exact += 1;
    else if (difference === 1) withinOne += 1;
    else disagree += 1;
  }
  return {
    comparable: exact + withinOne + disagree,
    exact,
    withinOne,
    disagree,
    notComparable,
  };
}

function deriveShadowMode(
  completedArtifacts: readonly ReturnType<typeof parseShadowFeedbackArtifact>[]
): DimensionCoverageFeedbackMode | null {
  if (completedArtifacts.length === 0) return null;
  const scored = FEEDBACK_DIMENSIONS.filter((dimension) =>
    completedArtifacts.some(
      (artifact) =>
        artifact.outcome.state === "completed" &&
        artifact.outcome.dimensions[dimension].score !== null
    )
  ).length;
  return scored === FEEDBACK_DIMENSIONS.length
    ? "full_scorecard"
    : scored > 0
      ? "partial_scorecard"
      : "coaching_review";
}

function aggregateUsage(
  artifactSet: ShadowFeedbackArtifactSetV1,
  rates: ShadowFeedbackCostRatesV1 | null
): ShadowFeedbackComparisonReportV1["usage"] {
  if (
    artifactSet.artifacts.length !==
      artifactSet.expectedKeyFingerprints.length ||
    artifactSet.artifacts.some(
      (artifact) => artifact.metrics.totalTokens === null
    )
  ) {
    return {
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostMicros: null,
    };
  }
  const inputTokens = artifactSet.artifacts.reduce(
    (sum, artifact) => sum + artifact.metrics.inputTokens!,
    0
  );
  const cachedInputTokens = artifactSet.artifacts.reduce(
    (sum, artifact) => sum + artifact.metrics.cachedInputTokens!,
    0
  );
  const outputTokens = artifactSet.artifacts.reduce(
    (sum, artifact) => sum + artifact.metrics.outputTokens!,
    0
  );
  const totalTokens = inputTokens + outputTokens;
  if (
    inputTokens > MAX_TOKEN_COUNT ||
    cachedInputTokens > MAX_TOKEN_COUNT ||
    outputTokens > MAX_TOKEN_COUNT ||
    totalTokens > MAX_TOKEN_COUNT
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  const estimatedCostMicros = rates
    ? Math.round(
        ((inputTokens - cachedInputTokens) * rates.inputMicrosPerMillion +
          cachedInputTokens * rates.cachedInputMicrosPerMillion +
          outputTokens * rates.outputMicrosPerMillion) /
          1_000_000
      )
    : null;
  if (
    estimatedCostMicros !== null &&
    (!Number.isSafeInteger(estimatedCostMicros) ||
      estimatedCostMicros > MAX_COST_MICROS)
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    estimatedCostMicros,
  };
}

function compareLatency(
  batch: ShadowFeedbackBatchAuthorityV1,
  artifactSet: ShadowFeedbackArtifactSetV1,
  terminalFreezeAnchorAtMs: number
): ShadowFeedbackComparisonReportV1["latency"] {
  if (
    artifactSet.status !== "complete" ||
    batch.terminalFreezeAnchorAtMs !== terminalFreezeAnchorAtMs ||
    artifactSet.artifacts.length !==
      artifactSet.expectedKeyFingerprints.length ||
    batch.completedAtMs < terminalFreezeAnchorAtMs ||
    batch.completedAtMs - terminalFreezeAnchorAtMs > MAX_POST_FREEZE_WINDOW_MS
  ) {
    return { kind: "unavailable", potentialLeadMs: null };
  }
  const completedAt = artifactSet.artifacts.map((artifact) =>
    Date.parse(artifact.completedAt)
  );
  if (
    completedAt.some(
      (value) =>
        !Number.isFinite(value) ||
        value < terminalFreezeAnchorAtMs ||
        value - terminalFreezeAnchorAtMs > MAX_POST_FREEZE_WINDOW_MS
    )
  ) {
    return { kind: "unavailable", potentialLeadMs: null };
  }
  const shadowCompletedAtMs = Math.max(...completedAt);
  return {
    kind: "post_freeze_potential",
    potentialLeadMs: Math.max(0, batch.completedAtMs - shadowCompletedAtMs),
  };
}

function invalidReport(): ShadowFeedbackComparisonReportV1 {
  return {
    contractVersion: SHADOW_FEEDBACK_COMPARISON_REPORT_VERSION,
    status: "invalid",
    artifacts: { expected: 0, completed: 0, failed: 0, missing: 0 },
    facets: { matched: 0, batchOnly: 0, shadowOnly: 0 },
    mode: { agreement: "unavailable", batch: null, shadow: null },
    scores: {
      comparable: 0,
      exact: 0,
      withinOne: 0,
      disagree: 0,
      notComparable: FEEDBACK_DIMENSIONS.length,
    },
    failures: emptyFailureCounts(),
    usage: {
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostMicros: null,
    },
    latency: { kind: "unavailable", potentialLeadMs: null },
    execution: {
      replay: "completed_work_deduplicated",
      ambiguousExternalCompletion: "requires_evaluator_idempotency",
    },
  };
}

function assertSchedulableProjection(
  projection: TrustedAnswerBlockProjection
): void {
  if (
    projection.contractVersion !== TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION ||
    !Array.isArray(projection.trustedBlocks) ||
    !Array.isArray(projection.trustedBlockIdentities) ||
    !Array.isArray(projection.closureAuthorities) ||
    !Array.isArray(projection.excludedBlocks) ||
    projection.trustedBlocks.length !==
      projection.trustedBlockIdentities.length ||
    projection.trustedBlocks.length !== projection.closureAuthorities.length ||
    projection.trustedBlocks.length > MAX_ARTIFACTS
  ) {
    throw new ShadowFeedbackComparisonParseError("authority_mismatch");
  }
  if (
    (projection.status === "complete" ||
      projection.status === "verified_prefix") &&
    projection.trustedBlocks.length === 0
  ) {
    throw new ShadowFeedbackComparisonParseError("authority_mismatch");
  }
}

function emptyFailureCounts(): Record<
  ShadowFeedbackArtifactFailureClass,
  number
> {
  return Object.fromEntries(
    FAILURE_CLASSES.map((failureClass) => [failureClass, 0])
  ) as Record<ShadowFeedbackArtifactFailureClass, number>;
}

function parseCountRecord<const T extends readonly string[]>(
  value: unknown,
  keys: T
): { [K in T[number]]: number } {
  const root = requireRecord(value);
  requireExactKeys(root, keys);
  return Object.fromEntries(
    keys.map((key) => [key, requireInteger(root[key], 0, MAX_AGGREGATE_COUNT)])
  ) as { [K in T[number]]: number };
}

function requireArtifactKeyFingerprint(
  value: unknown
): `shadow-feedback-artifact-key.v1:${string}` {
  if (
    typeof value !== "string" ||
    !/^shadow-feedback-artifact-key\.v1:[a-f0-9]{64}$/u.test(value)
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  return value as `shadow-feedback-artifact-key.v1:${string}`;
}

function isCompletedArtifact(
  artifact: ShadowFeedbackArtifactV1
): artifact is ShadowFeedbackArtifactV1 & {
  outcome: Extract<ShadowFeedbackArtifactV1["outcome"], { state: "completed" }>;
} {
  return artifact.outcome.state === "completed";
}

function facetIdentity(
  dimension: FeedbackDimension,
  facetCode: string,
  trustedBlockFingerprint: string
): string {
  return JSON.stringify([dimension, facetCode, trustedBlockFingerprint]);
}

function compareFacetAuthority(
  left: ShadowFeedbackBatchFacetAuthorityV1,
  right: ShadowFeedbackBatchFacetAuthorityV1
): number {
  return (
    left.facetCode.localeCompare(right.facetCode) ||
    left.trustedBlockFingerprint.localeCompare(right.trustedBlockFingerprint)
  );
}

function setsEqual<T>(left: Set<T>, right: Set<T>): boolean {
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}

function isAllowedFacet(
  roundType: RoundType,
  dimension: FeedbackDimension,
  facetCode: string
): boolean {
  return ROUND_DIMENSION_COVERAGE_CONFIG[roundType][dimension].facets.some(
    ({ code }) => code === facetCode
  );
}

function isTrustedBlockFingerprint(
  value: unknown
): value is `trusted-answer-block.v1:${string}` {
  return (
    typeof value === "string" &&
    /^trusted-answer-block\.v1:[a-f0-9]{64}$/u.test(value)
  );
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
}

function requireUuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
      value
    )
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  return value;
}

function requireVersion(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_VERSION_LENGTH ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value)
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  return value;
}

function requireEpochMs(value: unknown): number {
  return requireInteger(value, 0, MAX_EPOCH_MS);
}

function requireInteger(value: unknown, min: number, max: number): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  return value as number;
}

function requireNullableInteger(value: unknown, max: number): number | null {
  return value === null ? null : requireInteger(value, 0, max);
}

function requireNullableScore(value: unknown): number | null {
  return value === null ? null : requireInteger(value, 0, 10);
}

function requireRoundType(value: unknown): RoundType {
  if (
    value !== "product_sense" &&
    value !== "execution" &&
    value !== "behavioral" &&
    value !== "strategy"
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  return value;
}

function requireMode(value: unknown): DimensionCoverageFeedbackMode {
  if (
    value !== "full_scorecard" &&
    value !== "partial_scorecard" &&
    value !== "coaching_review"
  ) {
    throw new ShadowFeedbackComparisonParseError("invalid_shape");
  }
  return value;
}
