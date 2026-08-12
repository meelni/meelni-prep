export type TranscriptInterruptionEvidence = {
  speaker: "user" | "interviewer";
  reason: "no_provider_confirmed_prefix" | "canonicalization_failed";
};

export type TranscriptInterruptionIntegrityImpact = "preserve" | "degrade";

/**
 * A textless interviewer turn with no provider-confirmed prefix contains no
 * candidate evidence to corrupt. Every other marker remains fail-closed.
 */
export function classifyTranscriptInterruptionIntegrity(
  evidence: TranscriptInterruptionEvidence
): TranscriptInterruptionIntegrityImpact {
  return evidence.speaker === "interviewer" &&
    evidence.reason === "no_provider_confirmed_prefix"
    ? "preserve"
    : "degrade";
}

export function transcriptInterruptionDegradesCandidateEvidence(
  evidence: TranscriptInterruptionEvidence
): boolean {
  return classifyTranscriptInterruptionIntegrity(evidence) === "degrade";
}
