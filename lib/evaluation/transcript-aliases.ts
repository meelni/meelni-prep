import type {
  FeedbackTranscriptTurn,
  FeedbackV2Item,
  FeedbackV2Result,
} from "@meelni/core";

const TRANSCRIPT_ALIAS_PATTERN = /^turn_\d{4,}$/;

export interface EvaluationTranscriptAliasProjection {
  transcript: FeedbackTranscriptTurn[];
  canonicalIdByAlias: ReadonlyMap<string, string>;
}

/**
 * Keep provider event identities out of model traffic while preserving their
 * exact values for the validated result returned to persistence.
 */
export function projectEvaluationTranscriptAliases(
  transcript: readonly FeedbackTranscriptTurn[]
): EvaluationTranscriptAliasProjection {
  const width = Math.max(4, String(transcript.length).length);
  const canonicalIdByAlias = new Map<string, string>();
  const aliasedTranscript = transcript.map((turn, index) => {
    const alias = `turn_${String(index + 1).padStart(width, "0")}`;
    canonicalIdByAlias.set(alias, turn.eventId);
    return { ...turn, eventId: alias };
  });

  return {
    transcript: aliasedTranscript,
    canonicalIdByAlias,
  };
}

export function serializeEvaluationTranscript(
  transcript: readonly FeedbackTranscriptTurn[]
): string {
  const records = transcript.map((turn) => {
    if (!TRANSCRIPT_ALIAS_PATTERN.test(turn.eventId)) {
      throw new Error(
        "Evaluation prompt transcript requires canonical aliases"
      );
    }
    return {
      turnRef: turn.eventId,
      speaker: turn.speaker,
      deliveryState: turn.deliveryState ?? "delivered",
      text: turn.text,
    };
  });

  return JSON.stringify(records, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function restoreCanonicalTranscriptIds(
  result: FeedbackV2Result,
  canonicalIdByAlias: ReadonlyMap<string, string>
): FeedbackV2Result {
  return {
    ...result,
    strengths: result.strengths.map((item) =>
      restoreItemIds(item, canonicalIdByAlias)
    ),
    improvements: result.improvements.map((item) =>
      restoreItemIds(item, canonicalIdByAlias)
    ),
  };
}

function restoreItemIds(
  item: FeedbackV2Item,
  canonicalIdByAlias: ReadonlyMap<string, string>
): FeedbackV2Item {
  return {
    ...item,
    transcriptRefs: item.transcriptRefs.map((alias) =>
      requireCanonicalId(alias, canonicalIdByAlias)
    ),
    evidence: item.evidence.map((evidence) => ({
      ...evidence,
      turnRef: requireCanonicalId(evidence.turnRef, canonicalIdByAlias),
    })),
  };
}

function requireCanonicalId(
  alias: string,
  canonicalIdByAlias: ReadonlyMap<string, string>
): string {
  const canonicalId = canonicalIdByAlias.get(alias);
  if (canonicalId === undefined) {
    throw new Error(`Unknown evaluation transcript alias: ${alias}`);
  }
  return canonicalId;
}
