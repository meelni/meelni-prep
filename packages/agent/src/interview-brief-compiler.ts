import {
  getPmInterviewRoundPack,
  type DifficultyLevel,
  type RoundType,
} from "@meelni/core";

import { calculateInterviewBriefV2PayloadDigest } from "./interview-brief-canonicalization";
import { parseInterviewBriefV2 } from "./interviewer-contract-validation";
import {
  FULL_INTERVIEW_POLICY_CONTRACT_VERSION,
  FULL_INTERVIEW_PROMPT_CONTRACT_VERSION,
  INTERVIEW_BRIEF_V2_CONTRACT_VERSION,
  INTERVIEW_ROUND_PACK_CONTRACT_VERSION,
  type InterviewBriefQuestionV2,
  type InterviewBriefV2,
} from "./interviewer-contract-types";

export const INTERVIEW_BRIEF_V2_START_CONFIG_KEY =
  "interviewBriefV2Wire" as const;

export interface CompileInterviewBriefV2Input {
  sessionId: string;
  sessionStartFingerprint: string;
  deadlineAt: string;
  roundType: RoundType;
  difficulty: DifficultyLevel;
  durationMinutes: 15 | 30 | 45;
  selectedQuestion: InterviewBriefQuestionV2;
  companyContext?: InterviewBriefV2["company_context"];
  candidatePracticeGoal?: string | null;
}

export interface CompiledInterviewBriefV2 {
  brief: InterviewBriefV2;
  wire: string;
}

export function compileInterviewBriefV2(
  input: CompileInterviewBriefV2Input
): CompiledInterviewBriefV2 {
  const pack = getPmInterviewRoundPack(input.roundType);
  const provisional: InterviewBriefV2 = {
    contract_version: INTERVIEW_BRIEF_V2_CONTRACT_VERSION,
    brief_id: `brief:${"0".repeat(64)}`,
    payload_digest: `sha256:${"0".repeat(64)}`,
    session_id: input.sessionId,
    session_start_fingerprint: input.sessionStartFingerprint,
    deadline_at: input.deadlineAt,
    round_type: input.roundType,
    difficulty: input.difficulty,
    duration_minutes: input.durationMinutes,
    selected_question: { ...input.selectedQuestion },
    company_context: input.companyContext ?? null,
    candidate_practice_goal: input.candidatePracticeGoal ?? null,
    round_pack: {
      contract_version: INTERVIEW_ROUND_PACK_CONTRACT_VERSION,
      round_type: input.roundType,
      objectives: [...pack.objectives],
      probe_families: [...pack.probeFamilies],
      transition_guidance: [...pack.transitionGuidance],
      close_guidance: [...pack.closeGuidance],
      forbidden_behaviors: ["coaching", "hinting", "mid_session_evaluation"],
    },
    policy: {
      contract_version: FULL_INTERVIEW_POLICY_CONTRACT_VERSION,
      prompt_contract_version: FULL_INTERVIEW_PROMPT_CONTRACT_VERSION,
      interviewer_mode: "full_interview",
      coaching: "forbidden",
      hints: "forbidden",
      evaluation_timing: "post_interview_only",
      selected_question_policy: "exact_first_turn",
      one_substantive_question_per_turn: true,
    },
  };
  const payloadDigest = calculateInterviewBriefV2PayloadDigest(provisional);
  const brief = parseInterviewBriefV2({
    ...provisional,
    brief_id: `brief:${payloadDigest.slice("sha256:".length)}`,
    payload_digest: payloadDigest,
  });
  return { brief, wire: JSON.stringify(brief) };
}

export function addInterviewBriefV2ToStartConfig(
  config: Record<string, unknown>,
  compiled: CompiledInterviewBriefV2
): Record<string, unknown> {
  return { ...config, [INTERVIEW_BRIEF_V2_START_CONFIG_KEY]: compiled.wire };
}

export function readInterviewBriefV2FromStartConfig(
  config: Record<string, unknown>
): InterviewBriefV2 | null {
  const wire = config[INTERVIEW_BRIEF_V2_START_CONFIG_KEY];
  if (typeof wire !== "string") return null;
  try {
    return parseInterviewBriefV2(wire);
  } catch {
    return null;
  }
}

export function isInterviewBriefV2EmissionEnabled(
  env: Record<string, string | undefined>
): boolean {
  return env.MEELNI_INTERVIEW_BRIEF_V2_ENABLED === "true";
}
