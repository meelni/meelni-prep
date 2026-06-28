import {
  buildInterviewRoomMetadata,
  type InterviewRuntimeConfig,
} from "@/lib/internal/agent";
import {
  canAccessInterviewType,
  getAllowedInterviewTypes,
  INTERVIEW_TYPE_LABELS,
  isValidRoundType,
  type RoundType,
  type SubscriptionTier,
} from "@/lib/internal/core";
import {
  buildInterviewRoomName,
  createLiveKitInterviewProvider,
  type LiveKitEnvironment,
  type LiveKitInterviewProvider,
} from "@/lib/internal/integrations";
import { createSession, type CreateSessionInput } from "@/lib/db/sessions";
import {
  getQuestionById,
  getRandomQuestion,
  getRandomRecentQuestion,
  type QuestionBankRecord,
  recordQuestionUsage,
} from "@/lib/db/questions";
import { upsertUser } from "@/lib/db/users";
import { incrementUsage } from "@/lib/services/usage-service";
import { getUserTier } from "@/lib/services/permissions-service.server";

export const INTERVIEW_AGENT_ID = "CA_yawKG67rCMG4";

const QUESTION_TYPE_MAP: Record<RoundType, string[]> = {
  behavioral: ["Behavioral"],
  product_sense: ["Product Sense", "Product design/strategy"],
  execution: ["Execution", "Estimation", "A/B Testing", "Pricing"],
  strategy: ["Product Strategy"],
};

export interface StartInterviewSessionUser {
  id: string;
  email?: string | null;
  metadata?: {
    name?: string | null;
    full_name?: string | null;
  } | null;
}

export interface StartInterviewSessionBody {
  roundType?: unknown;
  mode?: unknown;
  role?: unknown;
  persona?: unknown;
  config?: unknown;
  questionId?: unknown;
}

export interface StartInterviewSessionInput {
  user: StartInterviewSessionUser;
  body: StartInterviewSessionBody;
  env: LiveKitEnvironment;
}

export interface StartInterviewSessionDeps {
  buildRoomName(): string;
  createSession(
    input: CreateSessionInput
  ): Promise<{ id: string; config: unknown }>;
  getQuestionById(questionId: string): Promise<QuestionBankRecord | null>;
  getRandomQuestion(
    questionTypes: string[]
  ): Promise<QuestionBankRecord | null>;
  getRandomRecentQuestion(
    days: number,
    questionTypes: string[]
  ): Promise<QuestionBankRecord | null>;
  getUserTier(userId: string): Promise<SubscriptionTier>;
  incrementUsage(userId: string): Promise<{
    success: boolean;
    reason?: string;
    currentUsage?: number;
    limit?: number;
  }>;
  livekitProvider: LiveKitInterviewProvider;
  recordQuestionUsage(sessionId: string, questionId: string): Promise<void>;
  upsertUser(input: {
    id: string;
    email: string;
    name: string | null;
  }): Promise<unknown>;
}

export type StartInterviewSessionResult =
  | {
      ok: true;
      body: {
        sessionId: string;
        roomName: string;
        token: string;
        url: string;
        config: unknown;
        question: {
          id: string;
          text: string;
          company: string | null;
        } | null;
      };
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

type StartInterviewSessionErrorResult = Extract<
  StartInterviewSessionResult,
  { ok: false }
>;

export async function startInterviewSessionWorkflow(
  input: StartInterviewSessionInput,
  deps: StartInterviewSessionDeps = createStartInterviewSessionDeps()
): Promise<StartInterviewSessionResult> {
  const parsed = parseStartInterviewBody(input.body);

  if (!parsed.ok) {
    return parsed;
  }

  const { roundType, mode, role, persona, config, questionId } = parsed;

  const access = await checkInterviewTypeAccess(input.user.id, roundType, deps);
  if (!access.ok) {
    return access;
  }

  const quota = await incrementInterviewUsage(input.user.id, deps);
  if (!quota.ok) {
    return quota;
  }

  const question = await selectQuestion({
    roundType,
    questionId,
    recentDays: getRecentDays(config),
    deps,
  });

  if (!question.ok) {
    return question;
  }

  await deps.upsertUser({
    id: input.user.id,
    email: input.user.email!,
    name: input.user.metadata?.name || input.user.metadata?.full_name || null,
  });

  const roomName = deps.buildRoomName();
  const session = await deps.createSession({
    userId: input.user.id,
    role,
    roundType,
    mode,
    persona,
    livekitRoomName: roomName,
    config,
  });

  if (question.value) {
    await deps.recordQuestionUsage(session.id, question.value.id);
  }

  const roomMetadata = buildInterviewRoomMetadata({
    session_id: session.id,
    round_type: roundType,
    mode,
    config: config as InterviewRuntimeConfig,
    question: question.value
      ? {
          id: question.value.id,
          text: question.value.questionText,
          company: question.value.company,
          type: question.value.questionType,
          askedAt: question.value.askedAt,
        }
      : null,
  });

  const livekitResult = await deps.livekitProvider.startInterviewRoom({
    agentId: INTERVIEW_AGENT_ID,
    identity: input.user.id,
    participantName: input.user.email || input.user.id,
    roomName,
    metadata: roomMetadata,
    env: input.env,
  });

  if (!livekitResult.ok) {
    console.error("LiveKit interview start error:", livekitResult.error);
    return {
      ok: false,
      status: livekitResult.error.retryable ? 503 : 500,
      body: { error: "Failed to start voice interview" },
    };
  }

  return {
    ok: true,
    body: {
      sessionId: session.id,
      roomName,
      token: livekitResult.data.token,
      url: livekitResult.data.url,
      config: session.config,
      question: question.value
        ? {
            id: question.value.id,
            text: question.value.questionText,
            company: question.value.company,
          }
        : null,
    },
  };
}

export function createStartInterviewSessionDeps(): StartInterviewSessionDeps {
  return {
    buildRoomName: buildInterviewRoomName,
    createSession,
    getQuestionById,
    getRandomQuestion,
    getRandomRecentQuestion,
    getUserTier,
    incrementUsage,
    livekitProvider: createLiveKitInterviewProvider(),
    recordQuestionUsage,
    upsertUser,
  };
}

type ParsedStartInterviewBody = {
  ok: true;
  roundType: RoundType;
  mode: "voice_video" | "text";
  role: string;
  persona?: string;
  config: Record<string, unknown>;
  questionId?: string;
};

function parseStartInterviewBody(
  body: StartInterviewSessionBody
): ParsedStartInterviewBody | StartInterviewSessionErrorResult {
  if (!body.roundType) {
    return {
      ok: false,
      status: 400,
      body: { error: "roundType is required" },
    };
  }

  if (typeof body.roundType !== "string" || !isValidRoundType(body.roundType)) {
    return {
      ok: false,
      status: 400,
      body: { error: "Invalid roundType" },
    };
  }

  return {
    ok: true,
    roundType: body.roundType,
    mode: body.mode === "text" ? "text" : "voice_video",
    role: typeof body.role === "string" && body.role ? body.role : "pm",
    persona: typeof body.persona === "string" ? body.persona : undefined,
    config: isRecord(body.config) ? body.config : {},
    questionId:
      typeof body.questionId === "string" ? body.questionId : undefined,
  };
}

async function checkInterviewTypeAccess(
  userId: string,
  roundType: RoundType,
  deps: StartInterviewSessionDeps
): Promise<{ ok: true } | StartInterviewSessionErrorResult> {
  try {
    const userTier = await deps.getUserTier(userId);

    if (canAccessInterviewType(userTier, roundType)) {
      return { ok: true };
    }

    return {
      ok: false,
      status: 403,
      body: {
        error: "interview_type_locked",
        message: `${INTERVIEW_TYPE_LABELS[roundType]} interviews require a Pro subscription. Upgrade to unlock all 4 interview types.`,
        currentTier: userTier,
        requestedType: roundType,
        allowedTypes: getAllowedInterviewTypes(userTier),
        upgradeUrl: "/pricing",
      },
    };
  } catch (error) {
    console.error("Permissions check error:", getErrorMessage(error));
    return {
      ok: false,
      status: 503,
      body: {
        error: "service_unavailable",
        message:
          "Unable to verify interview type access. Please try again in a moment.",
      },
    };
  }
}

async function incrementInterviewUsage(
  userId: string,
  deps: StartInterviewSessionDeps
): Promise<{ ok: true } | StartInterviewSessionErrorResult> {
  try {
    const incrementResult = await deps.incrementUsage(userId);

    if (incrementResult.success) {
      return { ok: true };
    }

    return {
      ok: false,
      status: 403,
      body: {
        error: "quota_exceeded",
        message: incrementResult.reason || "Monthly interview quota exceeded",
        currentUsage: incrementResult.currentUsage || 0,
        limit: incrementResult.limit || 0,
        upgradeUrl: "/pricing",
      },
    };
  } catch (error) {
    console.error("Quota check error:", getErrorMessage(error));
    return {
      ok: false,
      status: 503,
      body: {
        error: "service_unavailable",
        message:
          "Unable to verify interview quota. Please try again in a moment.",
      },
    };
  }
}

async function selectQuestion({
  roundType,
  questionId,
  recentDays,
  deps,
}: {
  roundType: RoundType;
  questionId?: string;
  recentDays?: number;
  deps: StartInterviewSessionDeps;
}): Promise<
  | { ok: true; value: QuestionBankRecord | null }
  | StartInterviewSessionErrorResult
> {
  if (questionId) {
    const question = await deps.getQuestionById(questionId);

    if (!question) {
      return {
        ok: false,
        status: 404,
        body: { error: `Question not found: ${questionId}` },
      };
    }

    logQuestion("Using pre-selected question", question);
    return { ok: true, value: question };
  }

  const dbQuestionTypes = QUESTION_TYPE_MAP[roundType];
  const question = recentDays
    ? await deps.getRandomRecentQuestion(recentDays, dbQuestionTypes)
    : await deps.getRandomQuestion(dbQuestionTypes);

  if (!question) {
    const typesList = dbQuestionTypes.join('" or "');
    const errorMsg = `No questions available for interview type "${roundType}" (looks for: "${typesList}")${
      recentDays ? ` from the last ${recentDays} days` : ""
    }. Try selecting "All Questions" or a different interview type.`;
    console.warn(`[Session Start] ${errorMsg}`);

    return {
      ok: false,
      status: 404,
      body: { error: errorMsg },
    };
  }

  logQuestion("Random question selected", question, {
    user_selected_round_type: roundType,
    mapped_db_types: dbQuestionTypes.join(", "),
    total_available_types: dbQuestionTypes.length,
  });

  return { ok: true, value: question };
}

function getRecentDays(config: Record<string, unknown>): number | undefined {
  const questionPreference = config.questionPreference;

  if (!isRecord(questionPreference)) {
    return undefined;
  }

  return typeof questionPreference.recentDays === "number"
    ? questionPreference.recentDays
    : undefined;
}

function logQuestion(
  message: string,
  question: QuestionBankRecord,
  extra: Record<string, unknown> = {}
) {
  console.log(`[Session Start] ${message}:`, {
    id: question.id,
    type: question.questionType,
    company: question.company,
    text_preview: `${question.questionText.substring(0, 100)}...`,
    ...extra,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
