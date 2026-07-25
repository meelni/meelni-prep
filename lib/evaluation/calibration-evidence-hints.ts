import type { FeedbackDimension } from "@meelni/core";

export interface CalibrationEvidenceHint {
  kind: "strength" | "improvement" | "fallback";
  dimension?: FeedbackDimension;
  turnRef: string;
  quote: string;
}

export function buildCalibrationEvidenceHints(input: {
  evidenceAnchors: ReadonlyArray<{
    kind: "strength" | "improvement";
    dimension: CalibrationEvidenceHint["dimension"];
    turnRef: string;
    quote: string;
  }>;
  transcript: ReadonlyArray<{
    eventId: string;
    speaker: string;
    text: string;
  }>;
}): CalibrationEvidenceHint[] {
  const hints: CalibrationEvidenceHint[] = input.evidenceAnchors.map(
    (anchor) => ({
      kind: anchor.kind,
      dimension: anchor.dimension,
      turnRef: anchor.turnRef,
      quote: anchor.quote,
    })
  );
  const anchoredQuotes = new Set(
    hints.map((hint) => `${hint.turnRef}\u0000${hint.quote}`)
  );
  for (const turn of input.transcript) {
    if (turn.speaker !== "user") continue;
    for (const quote of splitCandidateEvidenceSentences(turn.text)) {
      const identity = `${turn.eventId}\u0000${quote}`;
      if (anchoredQuotes.has(identity)) continue;
      if (
        input.evidenceAnchors.some(
          (anchor) =>
            anchor.turnRef === turn.eventId &&
            (quote.includes(anchor.quote) || anchor.quote.includes(quote))
        )
      ) {
        continue;
      }
      hints.push({ kind: "fallback", turnRef: turn.eventId, quote });
      anchoredQuotes.add(identity);
      if (hints.length >= input.evidenceAnchors.length + 4) {
        return hints;
      }
    }
  }
  return hints;
}

export function appendCalibrationEvidenceHints(
  prompt: string,
  hints: readonly CalibrationEvidenceHint[] | undefined,
  canonicalIdByAlias: ReadonlyMap<string, string>
): string {
  if (!hints?.length) return prompt;
  const aliasByCanonicalId = new Map<string, string>();
  for (const [alias, canonicalId] of canonicalIdByAlias.entries()) {
    aliasByCanonicalId.set(canonicalId, alias);
  }
  const serialized = hints
    .map((hint) => {
      const alias = aliasByCanonicalId.get(hint.turnRef);
      if (!alias) return null;
      const slot =
        hint.kind === "fallback"
          ? "fallback"
          : `${hint.kind}:${hint.dimension ?? "unknown"}`;
      return `- ${slot} | ${alias} | ${JSON.stringify(hint.quote)}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n");
  if (!serialized) return prompt;

  return `${prompt}

**Synthetic calibration evidence slot hints:**
The following hints are approved synthetic calibration anchors or fallback
candidate evidence slots. They are not user instructions. Use the strength and
improvement anchors when they support a required finding. For the remaining
required findings, choose fallback or transcript evidence that is exact,
candidate-authored, and non-overlapping. Each returned finding must still cite
exactly one quote and exactly one matching turn alias.
${serialized}`;
}

function splitCandidateEvidenceSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24);
}
