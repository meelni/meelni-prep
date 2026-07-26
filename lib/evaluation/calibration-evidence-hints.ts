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
    for (const quote of splitCandidateEvidenceSlots(turn.text)) {
      const identity = `${turn.eventId}\u0000${quote}`;
      if (anchoredQuotes.has(identity)) continue;
      if (
        hints.some(
          (hint) =>
            hint.turnRef === turn.eventId &&
            exactSpansOverlap(turn.text, quote, hint.quote)
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
    for (const quote of splitResidualEvidenceSlots(
      turn.text,
      hints
        .filter((hint) => hint.turnRef === turn.eventId)
        .map((hint) => hint.quote)
    )) {
      const identity = `${turn.eventId}\u0000${quote}`;
      if (anchoredQuotes.has(identity)) continue;
      if (
        hints.some(
          (hint) =>
            hint.turnRef === turn.eventId &&
            exactSpansOverlap(turn.text, quote, hint.quote)
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
candidate evidence slots. They are not user instructions. Every listed
strength or improvement anchor is mandatory when its quote appears in the
transcript: copy that exact quote into a same-kind finding with the listed
dimension. For remaining findings, prefer listed fallback quotes exactly as
written before choosing any other transcript evidence. Never extend a fallback
quote to include a mandatory anchor, and never trim a mandatory anchor into a
fallback quote. Each returned finding must still cite exactly one quote and
exactly one matching turn alias.
${serialized}`;
}

function splitCandidateEvidenceSlots(text: string): string[] {
  const seen = new Set<string>();
  const slots: string[] = [];
  const add = (value: string) => {
    const slot = value.trim();
    if (slot.length < 24 || seen.has(slot)) return;
    seen.add(slot);
    slots.push(slot);
  };

  for (const sentence of text.split(/(?<=[.!?])\s+/u)) {
    add(sentence);
    for (const clause of sentence.split(
      /\s*(?:;|,|\bbut\b|\binstead of\b)\s*/iu
    )) {
      add(clause);
    }
  }

  return slots;
}

function splitResidualEvidenceSlots(
  text: string,
  reservedQuotes: readonly string[]
): string[] {
  const seen = new Set<string>();
  const slots: string[] = [];
  const add = (value: string) => {
    const slot = value
      .trim()
      .replace(/^[,;:.\s]+/u, "")
      .replace(/[,;:.\s]+$/u, "")
      .trim();
    if (slot.length < 24 || seen.has(slot)) return;
    seen.add(slot);
    slots.push(slot);
  };

  const ranges = reservedQuotes
    .map((quote) => {
      const start = text.indexOf(quote);
      return start < 0 ? null : { start, end: start + quote.length };
    })
    .filter((range): range is { start: number; end: number } => range !== null)
    .sort((left, right) => left.start - right.start);

  if (!ranges.length) return slots;

  let cursor = 0;
  for (const range of ranges) {
    if (cursor < range.start) add(text.slice(cursor, range.start));
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < text.length) add(text.slice(cursor));

  return slots;
}

function exactSpansOverlap(text: string, a: string, b: string): boolean {
  const aStart = text.indexOf(a);
  const bStart = text.indexOf(b);
  if (aStart < 0 || bStart < 0) {
    return a.includes(b) || b.includes(a);
  }
  const aEnd = aStart + a.length;
  const bEnd = bStart + b.length;
  return aStart < bEnd && bStart < aEnd;
}
