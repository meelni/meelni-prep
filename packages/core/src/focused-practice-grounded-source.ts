import type { CandidateAnswerBlock } from "./answer-blocks";
import {
  selectDimensionCoveragePracticeFocus,
  type DimensionCoverageFeedbackResult,
} from "./feedback-dimension-coverage";
import {
  selectEvidenceLimitedPracticeFocus,
  type EvidenceLimitedFeedbackResult,
} from "./feedback-evidence-limited";
import {
  dimensionCoverageSourceNextStep,
  dimensionCoverageSourceObservation,
  type FocusedPracticeGroundedSourceFindingSnapshot,
} from "./focused-practice-grounded-attempt";
import {
  FOCUSED_PRACTICE_DIMENSION_ACTION_CODE,
  type FocusedPracticeGroundedFocusIdentity,
} from "./focused-practice-grounded-plan";

export interface ResolvedFocusedPracticeGroundedSource {
  focusIdentity: FocusedPracticeGroundedFocusIdentity;
  sourceFinding: FocusedPracticeGroundedSourceFindingSnapshot;
}

export function resolveEvidenceLimitedFocusedPracticeSource(
  feedback: EvidenceLimitedFeedbackResult
): ResolvedFocusedPracticeGroundedSource | null {
  const selected = selectEvidenceLimitedPracticeFocus(feedback.improvements);
  const evidence = selected.evidence[0];
  if (
    !evidence ||
    selected.evidence.length !== 1 ||
    selected.transcriptRefs.length !== 1 ||
    selected.transcriptRefs[0] !== evidence.turnRef
  ) {
    return null;
  }
  return {
    focusIdentity: Object.freeze({
      kind: "evidence_limited_improvement",
      dimension: selected.dimension,
      signalCode: selected.signalCode,
      actionCode: selected.actionCode,
    }),
    sourceFinding: Object.freeze({
      kind: "evidence_limited_improvement",
      dimension: selected.dimension,
      observation: selected.observation,
      nextStep: selected.nextStep,
      signalCode: selected.signalCode,
      actionCode: selected.actionCode,
      evidence: Object.freeze({
        kind: "exact_candidate_citation",
        transcriptRefs: Object.freeze([evidence.turnRef]),
        quote: evidence.quote,
      }),
    }),
  };
}

export function resolveDimensionCoverageFocusedPracticeSource(
  feedback: DimensionCoverageFeedbackResult,
  answerBlocks: readonly CandidateAnswerBlock[]
): ResolvedFocusedPracticeGroundedSource | null {
  const selected = selectDimensionCoveragePracticeFocus(feedback);
  if (!selected) return null;
  const block = answerBlocks.find(
    (candidate) => candidate.answerBlockId === selected.answerBlockRef
  );
  const transcriptRefs = block?.response.map((event) => event.eventId) ?? [];
  if (
    !block ||
    transcriptRefs.length === 0 ||
    block.responseText !== selected.evidenceText
  ) {
    return null;
  }
  return {
    focusIdentity: Object.freeze({
      kind: "dimension_coverage_focus",
      dimension: selected.dimension,
      facetCode: selected.facetCode,
      actionCode: FOCUSED_PRACTICE_DIMENSION_ACTION_CODE,
    }),
    sourceFinding: Object.freeze({
      kind: "dimension_coverage_focus",
      dimension: selected.dimension,
      observation: dimensionCoverageSourceObservation(selected.facetLabel),
      nextStep: dimensionCoverageSourceNextStep(selected.facetLabel),
      facetCode: selected.facetCode,
      facetLabel: selected.facetLabel,
      answerBlockRef: selected.answerBlockRef,
      actionCode: FOCUSED_PRACTICE_DIMENSION_ACTION_CODE,
      evidence: Object.freeze({
        kind: "exact_candidate_citation",
        transcriptRefs: Object.freeze(transcriptRefs),
        quote: selected.evidenceText,
      }),
    }),
  };
}
