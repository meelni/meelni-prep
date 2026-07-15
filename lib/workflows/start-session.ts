import {
  buildInterviewRoomMetadata,
  interviewRuntimeSettingsFromEnv,
  normalizeInterviewClientPreferences,
  resolveInterviewRuntimeConfig,
  type InterviewClientPreferences,
  type InterviewRuntimeConfig,
} from "@/lib/internal/agent";
import {
  deriveInterviewDeadlineAt,
  isValidRoundType,
  normalizeQuestionRound,
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
import { createDrizzleInterviewReconnectStore } from "@/lib/db/session-reconnects";
import { createFailedInterviewStartSettler } from "@/lib/billing/failed-interview-start";

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
  config?: unknown;
  questionId?: unknown;
}

export interface StartInterviewSessionInput {
  user: StartInterviewSessionUser;
  body: StartInterviewSessionBody;
  env: LiveKitEnvironment;
  interviewAgentName: string;
  appBaseUrl?: string;
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
  settleFailedReservation(reservationKey: string): Promise<void>;
  scheduleDeadline(input: {
    sessionId: string;
    deadlineAt: Date;
  }): Promise<unknown>;
  terminateRoom(input: {
    roomName: string;
    participantIdentity: string;
    env: LiveKitEnvironment;
  }): Promise<unknown>;
  markRoomCleanupComplete(sessionId: string): Promise<void>;
  completeRoomProvisioning(input: {
    sessionId: string;
    expectedVersion: number;
  }): Promise<boolean>;
  markRoomProvisioningSettled(sessionId: string): Promise<void>;
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
  resolveRuntimeConfig(
    preferences: InterviewClientPreferences
  ): InterviewRuntimeConfig;
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
        config: InterviewClientPreferences;
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

  const { roundType, mode, role, config, questionId } = parsed;
  const preferences = normalizeInterviewClientPreferences(config);
  const runtimeConfig = deps.resolveRuntimeConfig(preferences);

  const question = await selectQuestion({
    roundType,
    questionId,
    recentDays: getRecentDays(runtimeConfig),
    deps,
  });

  if (!question.ok) {
    return question;
  }
  const resolvedRoundType = question.roundType;

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
  let connectingVersion: number | undefined;

  try {
    session = await deps.createSession({
      userId: input.user.id,
      role,
      roundType: resolvedRoundType,
      mode,
      livekitRoomName: roomName,
      config: { ...runtimeConfig },
    });
    deadlineAt = deriveInterviewDeadlineAt({
      startedAt: requireSessionStartedAt(session.startedAt),
      durationMinutes: runtimeConfig.duration,
    });

    if (question.value) {
      await deps.recordQuestionUsage(session.id, question.value.id);
    }

    const connecting = await requireLifecycleTransition(
      { sessionId: session.id, to: "connecting" },
      deps
    );
    connectingVersion = connecting.version;
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
  if (connectingVersion === undefined) {
    throw new Error("Interview room provisioning lease was not established");
  }

  const roomMetadata = buildInterviewRoomMetadata({
    session_id: session.id,
    transcript_ingest_url: buildTranscriptIngestUrl(
      input.appBaseUrl ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3000"
    ),
    round_type: resolvedRoundType,
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

  let livekitResult;
  try {
    livekitResult = await deps.livekitProvider.startInterviewRoom({
      agentName: input.interviewAgentName,
      identity: input.user.id,
      participantName: "Candidate",
      roomName,
      metadata: roomMetadata,
      env: input.env,
    });
  } catch (error) {
    logStartFailure("livekit_start_exception", error);
    await terminalizeCleanupAndRelease(
      session.id,
      roomName,
      input.user.id,
      input.env,
      reservationKey,
      deps
    );
    return {
      ok: false,
      status: 503,
      body: { error: "Failed to start voice interview" },
    };
  }

  if (!livekitResult.ok) {
    console.error("[Session Start] livekit_start_failed", {
      retryable: livekitResult.error.retryable,
    });
    await terminalizeCleanupAndRelease(
      session.id,
      roomName,
      input.user.id,
      input.env,
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
    logStartFailure("deadline_schedule_failed", error);
    await terminalizeCleanupAndRelease(
      session.id,
      roomName,
      input.user.id,
      input.env,
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
    const completed = await deps.completeRoomProvisioning({
      sessionId: session.id,
      expectedVersion: connectingVersion,
    });
    if (!completed) {
      throw new Error("room_provisioning_lease_lost");
    }
  } catch (error) {
    logStartFailure("credit_consume_failed", error);
    await terminalizeCleanupAndRelease(
      session.id,
      roomName,
      input.user.id,
      input.env,
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
      config: preferences,
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

function buildTranscriptIngestUrl(appBaseUrl: string): string {
  try {
    return new URL("/api/internal/transcript", appBaseUrl).toString();
  } catch {
    throw new Error("Application URL is invalid for runtime transcript ingest");
  }
}

export function createStartInterviewSessionDeps(): StartInterviewSessionDeps {
  const localCreditBypass = isLocalDevCreditBypassEnabled();
  const persistentCreditLedger = localCreditBypass
    ? null
    : createCreditLedgerService({ store: createDrizzleCreditLedgerStore() });
  const creditLedger =
    persistentCreditLedger ?? createLocalDevCreditLedgerService();
  const reconnectStore = createDrizzleInterviewReconnectStore();
  const settleFailedReservation = createFailedInterviewStartSettler();

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
    settleFailedReservation,
    scheduleDeadline: scheduleInterviewDeadline,
    terminateRoom: async (input) => {
      const result = await terminateInterviewRoom(input);
      if (!result.ok) throw new Error(result.error.code);
      return result;
    },
    markRoomCleanupComplete: (sessionId) =>
      reconnectStore.markRoomCleanupComplete({ sessionId }),
    completeRoomProvisioning: async (input) =>
      (await reconnectStore.completeRoomProvisioning(input)).applied,
    markRoomProvisioningSettled: (sessionId) =>
      reconnectStore.markRoomProvisioningSettled({ sessionId }),
    livekitProvider: createLiveKitInterviewProvider(),
    transitionLifecycle: transitionInterviewSessionWorkflow,
    recordQuestionUsage,
    upsertUser,
    resolveRuntimeConfig: (preferences) =>
      resolveInterviewRuntimeConfig(
        preferences,
        interviewRuntimeSettingsFromEnv(process.env)
      ),
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
    logStartFailure("trial_credit_grant_failed", error);
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

async function attemptProvisionedRoomCleanup(
  sessionId: string,
  roomName: string,
  participantIdentity: string,
  env: LiveKitEnvironment,
  deps: StartInterviewSessionDeps
): Promise<boolean> {
  try {
    await deps.terminateRoom({ roomName, participantIdentity, env });
    await deps.markRoomCleanupComplete(sessionId);
    return true;
  } catch (error) {
    logStartFailure("room_cleanup_failed", error);
    return false;
  }
}

async function requireLifecycleTransition(
  input: TransitionInterviewSessionInput,
  deps: StartInterviewSessionDeps
): Promise<
  Extract<TransitionInterviewSessionResult, { ok: true }>["lifecycle"]
> {
  const result = await deps.transitionLifecycle(input);
  if (!result.ok) {
    throw new Error(`session_lifecycle_${result.disposition}`);
  }
  return result.lifecycle;
}

async function terminalizeProviderFailure(
  sessionId: string,
  deps: StartInterviewSessionDeps
): Promise<void> {
  const direct = await deps.transitionLifecycle({
    sessionId,
    to: "failed",
    terminalReason: "provider_failure",
  });
  if (direct.ok) return;

  const current = direct.lifecycle;
  if (!current) throw new Error(`session_lifecycle_${direct.disposition}`);
  if (current.state === "ending") {
    if (current.terminalReason !== "provider_failure") {
      throw new Error(`session_lifecycle_${direct.disposition}`);
    }
  } else {
    await requireLifecycleTransition(
      { sessionId, to: "ending", terminalReason: "provider_failure" },
      deps
    );
  }
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
  let terminalized = false;
  try {
    await terminalizeProviderFailure(sessionId, deps);
    terminalized = true;
  } finally {
    if (terminalized && (await releaseInterviewCredit(reservationKey, deps))) {
      await deps.markRoomProvisioningSettled(sessionId);
    } else if (!terminalized) {
      await releaseInterviewCredit(reservationKey, deps);
    }
  }
}

async function terminalizeCleanupAndRelease(
  sessionId: string,
  roomName: string,
  participantIdentity: string,
  env: LiveKitEnvironment,
  reservationKey: string,
  deps: StartInterviewSessionDeps
): Promise<void> {
  let lifecycleError: unknown;
  try {
    await terminalizeProviderFailure(sessionId, deps);
  } catch (error) {
    lifecycleError = error;
  }

  let cleanupSucceeded = false;
  let creditSettled = false;
  try {
    cleanupSucceeded = await attemptProvisionedRoomCleanup(
      sessionId,
      roomName,
      participantIdentity,
      env,
      deps
    );
  } finally {
    creditSettled = await releaseInterviewCredit(reservationKey, deps);
  }
  if (creditSettled && cleanupSucceeded && !lifecycleError) {
    await deps.markRoomProvisioningSettled(sessionId);
  }

  if (lifecycleError) {
    throw lifecycleError;
  }
}

type ParsedStartInterviewBody = {
  ok: true;
  roundType: RoundType;
  mode: "voice_video" | "text";
  role: "pm";
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

  if (body.role !== undefined && body.role !== "pm") {
    return {
      ok: false,
      status: 400,
      body: { error: "Invalid role" },
    };
  }

  return {
    ok: true,
    roundType: body.roundType,
    mode: body.mode === "text" ? "text" : "voice_video",
    role: "pm",
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

    logStartFailure("credit_reservation_failed", error);
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
): Promise<boolean> {
  try {
    await deps.settleFailedReservation(reservationKey);
    return true;
  } catch (error) {
    logStartFailure("credit_release_failed", error);
    return false;
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
  | {
      ok: true;
      value: QuestionBankRecord | null;
      roundType: RoundType;
    }
  | StartInterviewSessionErrorResult
> {
  if (questionId) {
    const question = await deps.getQuestionById(questionId);

    if (!question || !question.isActive) {
      return {
        ok: false,
        status: 404,
        body: { error: `Question not found: ${questionId}` },
      };
    }

    const selectedQuestionRoundType = normalizeQuestionRound(
      question.questionType
    );
    if (!selectedQuestionRoundType) {
      return {
        ok: false,
        status: 409,
        body: {
          error: "selected_question_round_unavailable",
          message:
            "This question cannot be started because its interview round is unavailable.",
        },
      };
    }

    logQuestion("Using pre-selected question", question);
    return {
      ok: true,
      value: question,
      roundType: selectedQuestionRoundType,
    };
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

  return { ok: true, value: question, roundType };
}

function getRecentDays(config: InterviewClientPreferences): number | undefined {
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
    ...extra,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInsufficientCreditsError(error: unknown): boolean {
  return error instanceof Error && error.message === "insufficient_credits";
}

function logStartFailure(event: string, error: unknown) {
  console.error(`[Session Start] ${event}`, {
    error_class: safeErrorClass(error),
  });
}

function safeErrorClass(error: unknown): string {
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof RangeError) return "RangeError";
  if (error instanceof SyntaxError) return "SyntaxError";
  if (error instanceof Error) return "Error";
  return "NonError";
}
