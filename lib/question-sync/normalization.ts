/**
 * Shared question-identity normalization.
 *
 * NFC composes equivalent Unicode spellings without compatibility-folding
 * meaning-bearing notation such as superscripts, circled numbers, or currency
 * symbols. Dashes and operators are deliberately preserved.
 */
export function normalizeQuestionIdentityText(value: string): string {
  return value.normalize("NFC").toLowerCase().trim().replace(/\s+/gu, " ");
}

/**
 * Near-duplicate prompts additionally normalize only an enumerated set of
 * presentation differences: curly quotes and terminal sentence punctuation.
 */
export function normalizeQuestionPromptForNearDuplicate(value: string): string {
  return normalizeQuestionIdentityText(value)
    .replace(/[\u2018\u2019\u201a\u201b]/gu, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/gu, '"')
    .replace(/[.!?\u2026]+$/gu, "")
    .trim();
}

export function normalizeQuestionPresentationText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}
