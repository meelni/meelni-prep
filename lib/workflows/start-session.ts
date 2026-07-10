import {
  buildInterviewRoomMetadata,
  normalizeInterviewRuntimeConfig,
  type InterviewRuntimeConfig,
} from "@/lib/internal/agent";
import {
  deriveInterviewDeadlineAt,
  isValidRoundType,
  questionTypeStorageAliasesForRound,
  serializeInterviewDeadlineAt,
  type RoundType,
} from "@/lib/internal/core";
import {
  buildInterviewRoomName,
  createLiveKitInterviewProvider,
  terminateInterviewRoom,
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
import {
  createCreditLedgerService,
  type CompleteReservationInput,
  type ReserveCreditInput,
  type ReserveCreditResult,
} from "@/lib/billing/credits";
import { createDrizzleCreditLedgerStore } from "@/lib/billing/credit-ledger-store";
import {
  createLocalDevCreditLedgerService,
  isLocalDevCreditBypassEnabled,
} from "@/lib/billing/local-dev-bypass";
import { ensureCanonicalTrialGrant } from "@/lib/billing/trial";
import {
  transitionInterviewSessionWorkflow,
  type TransitionInterviewSessionInput,
  type TransitionInterviewSessionResult,
} from "./transition-interview-session";
import { scheduleInterviewDeadline } from "./schedule-interview-deadline";

const QUESTION_TYPE_MAP: Record<RoundType, string[]> = {
  behavioral: [...questionTypeStorageAliasesForRound("behavioral")],
  product_sense: [...questionTypeStorageAliasesForRound("product_sense")],
  execution: [...questionTypeStorageAliasesForRound("execution")],
  strategy: [...questionTypeStorageAliasesForRound("strategy")],
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
  interviewAgentName: string;
}

export interface StartInterviewSessionDeps {
  buildRoomName(): string;
  createSession(
    input: CreateSessionInput
  ): Promise<{ id: string; config: unknown; startedAt: Date | null }>;
  getQuestionById(questionId: string): Promise<QuestionBankRecord | null>;
  getRandomQuestion(
    questionTypes: string[]
  ): Promise<QuestionBankRecord | null>;
  getRandomRecentQuestion(
    days: number,
    questionTypes: string[]
  ): Promise<QuestionBankRecord | null>;
  ensureTrialGrant(userId: string): Promise<unknown>;
  reserveCredit(input: ReserveCreditInput): Promise<ReserveCreditResult>;
  consumeReservation(input: CompleteReservationInput): Promise<unknown>;
  releaseReservation(input: CompleteReservationInput): Promise<unknown>;
  scheduleDeadline(input: {
    sessionId: string;
    deadlineAt: Date;
  }): Promise<unknown>;
  terminateRoom(input: {
    roomName: string;
    env: LiveKitEnvironment;
  }): Promise<unknown>;
  livekitProvider: LiveKitInterviewProvider;
  transitionLifecycle(
    input: TransitionInterviewSessionInput
  ): Promise<TransitionInterviewSessionResult>;
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
        deadlineAt: string;
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
  const runtimeConfig = normalizeInterviewRuntimeConfig(
    config as Partial<InterviewRuntimeConfig>
  );

  const question = await selectQuestion({
    roundType,
    questionId,
    recentDays: getRecentDays(runtimeConfig),
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

  const trialGrant = await ensureTrialGrantForStart(input.user.id, deps);
  if (!trialGrant.ok) {
    return trialGrant;
  }

  const roomName = deps.buildRoomName();
  const reservationKey = `interview-start:${input.user.id}:${roomName}`;
  const reservation = await reserveInterviewCredit({
    userId: input.user.id,
    reservationKey,
    deps,
  });

  if (!reservation.ok) {
    return reservation;
  }

  let session:
    | Awaited<ReturnType<StartInterviewSessionDeps["createSession"]>>
    | undefined;
  let deadlineAt: Date | undefined;

  try {
    session = await deps.createSession({
      userId: input.user.id,
      role,
      roundType,
      mode,
      persona,
      livekitRoomName: roomName,
      config: runtimeConfig,
    });
    deadlineAt = deriveInterviewDeadlineAt({
      startedAt: requireSessionStartedAt(session.startedAt),
      durationMinutes: runtimeConfig.duration,
    });

    if (question.value) {
      await deps.recordQuestionUsage(session.id, question.value.id);
    }

    await requireLifecycleTransition(
      { sessionId: session.id, to: "connecting" },
      deps
    );
  } catch (error) {
    if (session) {
      await terminalizeProviderFailureAndRelease(
        session.id,
        reservationKey,
        deps
      );
    } else {
      await releaseInterviewCredit(reservationKey, deps);
    }
    throw error;
  }

  if (!deadlineAt) {
    throw new Error("Interview session deadline was not established");
  }

  const roomMetadata = buildInterviewRoomMetadata({
    session_id: session.id,
    round_type: roundType,
    mode,
    deadline_at: serializeInterviewDeadlineAt(deadlineAt),
    config: runtimeConfig,
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
    agentName: input.interviewAgentName,
    identity: input.user.id,
    participantName: "Candidate",
    roomName,
    metadata: roomMetadata,
    env: input.env,
  });

  if (!livekitResult.ok) {
    console.error("LiveKit interview start error:", livekitResult.error);
    await terminalizeProviderFailureAndRelease(
      session.id,
      reservationKey,
      deps
    );
    return {
      ok: false,
      status: livekitResult.error.retryable ? 503 : 500,
      body: { error: "Failed to start voice interview" },
    };
  }

  try {
    await deps.scheduleDeadline({ sessionId: session.id, deadlineAt });
  } catch (error) {
    console.error("Interview deadline schedule error:", getErrorMessage(error));
    await safelyTerminateInterviewRoom(roomName, input.env, deps);
    await safelyTerminalizeProviderFailureAndRelease(
      session.id,
      reservationKey,
      deps
    );
    return {
      ok: false,
      status: 503,
      body: {
        error: "service_unavailable",
        message:
          "Unable to establish the interview time limit. Please try again in a moment.",
      },
    };
  }

  try {
    await deps.consumeReservation({
      reservationKey,
      idempotencyKey: `consume:${reservationKey}`,
    });
  } catch (error) {
    console.error("Credit consume error:", getErrorMessage(error));
    await safelyTerminateInterviewRoom(roomName, input.env, deps);
    await safelyTerminalizeProviderFailureAndRelease(
      session.id,
      reservationKey,
      deps
    );
    return {
      ok: false,
      status: 503,
      body: {
        error: "service_unavailable",
        message:
          "Unable to confirm interview credit usage. Please try again in a moment.",
      },
    };
  }

  return {
    ok: true,
    body: {
      sessionId: session.id,
      roomName,
      token: livekitResult.data.token,
      url: livekitResult.data.url,
      deadlineAt: serializeInterviewDeadlineAt(deadlineAt),
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
  const localCreditBypass = isLocalDevCreditBypassEnabled();
  const persistentCreditLedger = localCreditBypass
    ? null
    : createCreditLedgerService({ store: createDrizzleCreditLedgerStore() });
  const creditLedger =
    persistentCreditLedger ?? createLocalDevCreditLedgerService();

  return {
    buildRoomName: buildInterviewRoomName,
    createSession,
    getQuestionById,
    getRandomQuestion,
    getRandomRecentQuestion,
    ensureTrialGrant: async (userId) => {
      if (!persistentCreditLedger) {
        return;
      }
      await ensureCanonicalTrialGrant(persistentCreditLedger, userId);
    },
    reserveCredit: creditLedger.reserveCredit,
    consumeReservation: creditLedger.consumeReservation,
    releaseReservation: creditLedger.releaseReservation,
    scheduleDeadline: scheduleInterviewDeadline,
    terminateRoom: async (input) => {
      const result = await terminateInterviewRoom(input);
      if (!result.ok) throw new Error(result.error.code);
      return result;
    },
    livekitProvider: createLiveKitInterviewProvider(),
    transitionLifecycle: transitionInterviewSessionWorkflow,
    recordQuestionUsage,
    upsertUser,
  };
}

async function ensureTrialGrantForStart(
  userId: string,
  deps: StartInterviewSessionDeps
): Promise<{ ok: true } | StartInterviewSessionErrorResult> {
  try {
    await deps.ensureTrialGrant(userId);
    return { ok: true };
  } catch (error) {
    console.error("Trial credit grant error:", getErrorMessage(error));
    return {
      ok: false,
      status: 503,
      body: {
        error: "service_unavailable",
        message:
          "Unable to activate interview credits. Please try again in a moment.",
      },
    };
  }
}

function requireSessionStartedAt(startedAt: Date | null): Date {
  if (!startedAt) {
    throw new Error("Interview session is missing its server start time");
  }
  return startedAt;
}

async function safelyTerminateInterviewRoom(
  roomName: string,
  env: LiveKitEnvironment,
  deps: StartInterviewSessionDeps
): Promise<void> {
  try {
    await deps.terminateRoom({ roomName, env });
  } catch (error) {
    console.error("Interview room cleanup error:", getErrorMessage(error));
  }
}

async function requireLifecycleTransition(
  input: TransitionInterviewSessionInput,
  deps: StartInterviewSessionDeps
): Promise<void> {
  const result = await deps.transitionLifecycle(input);
  if (!result.ok) {
    throw new Error(`session_lifecycle_${result.disposition}`);
  }
}

async function terminalizeProviderFailure(
  sessionId: string,
  deps: StartInterviewSessionDeps
): Promise<void> {
  await requireLifecycleTransition(
    { sessionId, to: "failed", terminalReason: "provider_failure" },
    deps
  );
}

async function terminalizeProviderFailureAndRelease(
  sessionId: string,
  reservationKey: string,
  deps: StartInterviewSessionDeps
): Promise<void> {
  try {
    await terminalizeProviderFailure(sessionId, deps);
  } finally {
    await releaseInterviewCredit(reservationKey, deps);
  }
}

async function safelyTerminalizeProviderFailureAndRelease(
  sessionId: string,
  reservationKey: string,
  deps: StartInterviewSessionDeps
): Promise<void> {
  try {
    await terminalizeProviderFailureAndRelease(sessionId, reservationKey, deps);
  } catch (error) {
    console.error(
      "Session cleanup after credit consume failure error:",
      getErrorMessage(error)
    );
  }
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

async function reserveInterviewCredit({
  userId,
  reservationKey,
  deps,
}: {
  userId: string;
  reservationKey: string;
  deps: StartInterviewSessionDeps;
}): Promise<{ ok: true } | StartInterviewSessionErrorResult> {
  try {
    await deps.reserveCredit({ userId, reservationKey });
    return { ok: true };
  } catch (error) {
    if (isInsufficientCreditsError(error)) {
      return {
        ok: false,
        status: 402,
        body: {
          error: "no_credits_remaining",
          message: "You need an interview credit to start a full interview.",
          upgradeUrl: "/pricing",
        },
      };
    }

    console.error("Credit reservation error:", getErrorMessage(error));
    return {
      ok: false,
      status: 503,
      body: {
        error: "service_unavailable",
        message:
          "Unable to verify interview credits. Please try again in a moment.",
      },
    };
  }
}

async function releaseInterviewCredit(
  reservationKey: string,
  deps: StartInterviewSessionDeps
) {
  try {
    await deps.releaseReservation({
      reservationKey,
      idempotencyKey: `release:${reservationKey}`,
    });
  } catch (error) {
    console.error("Credit release error:", getErrorMessage(error));
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

function isInsufficientCreditsError(error: unknown): boolean {
  return error instanceof Error && error.message === "insufficient_credits";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
