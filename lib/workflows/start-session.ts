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
  normalizeInterviewDurationMinutes,
  questionTypeStorageAliasesForRound,
  serializeInterviewDeadlineAt,
  type RoundType,
} from "@/lib/internal/core";
import {
  createLiveKitInterviewProvider,
  issueInterviewParticipantToken,
  terminateInterviewRoom,
  type LiveKitEnvironment,
  type LiveKitInterviewProvider,
} from "@/lib/internal/integrations";
import {
  getQuestionById,
  getRandomQuestion,
  getRandomRecentQuestion,
  type QuestionBankRecord,
} from "@/lib/db/questions";
import {
  createDrizzleInterviewStartStore,
  InterviewProvisioningLeaseLostError,
  InterviewStartConflictError,
  InterviewStartFailedError,
  type InterviewStartStore,
  type PersistedStableInterviewStart,
  type StableInterviewStartInput,
} from "@/lib/db/interview-starts";
import { upsertUser } from "@/lib/db/users";
import {
  createCreditLedgerService,
  trackReservedCreditEvents,
  type ReserveCreditInput,
} from "@/lib/billing/credits";
import { createDrizzleCreditLedgerStore } from "@/lib/billing/credit-ledger-store";
import {
  createLocalDevCreditLedgerService,
  isLocalDevCreditBypassEnabled,
} from "@/lib/billing/local-dev-bypass";
import { ensureCanonicalTrialGrant } from "@/lib/billing/trial";
import {
  type TransitionInterviewSessionInput,
  type TransitionInterviewSessionResult,
} from "./transition-interview-session";
import { transitionInterviewSessionWorkflow } from "./transition-interview-session";
import { scheduleInterviewDeadline } from "./schedule-interview-deadline";
import { createDrizzleInterviewReconnectStore } from "@/lib/db/session-reconnects";
import { convergeDrizzleInterviewCreditSettlement } from "@/lib/db/interview-credit-settlement";

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
  startAttemptId?: unknown;
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
  appBaseUrl: string;
}

export interface StartInterviewSessionDeps {
  startStore: InterviewStartStore;
  prepareStart(input: {
    start: StableInterviewStartInput;
    reservation: ReserveCreditInput;
  }): Promise<PersistedStableInterviewStart>;
  getQuestionById(questionId: string): Promise<QuestionBankRecord | null>;
  getRandomQuestion(
    questionTypes: string[]
  ): Promise<QuestionBankRecord | null>;
  getRandomRecentQuestion(
    days: number,
    questionTypes: string[]
  ): Promise<QuestionBankRecord | null>;
  ensureTrialGrant(userId: string): Promise<unknown>;
  releaseReservation(input: {
    reservationKey: string;
    idempotencyKey: string;
  }): Promise<unknown>;
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
  settleCredit(sessionId: string): Promise<unknown>;
  livekitProvider: LiveKitInterviewProvider;
  issueParticipantToken(input: {
    identity: string;
    participantName: string;
    roomName: string;
    ttlSeconds: number;
    observedAt: Date;
    expiresAt: Date;
    env: LiveKitEnvironment;
  }): ReturnType<typeof issueInterviewParticipantToken>;
  transitionLifecycle(
    input: TransitionInterviewSessionInput
  ): Promise<TransitionInterviewSessionResult>;
  upsertUser(input: {
    id: string;
    email: string;
    name: string | null;
  }): Promise<unknown>;
  resolveRuntimeConfig(
    preferences: InterviewClientPreferences
  ): InterviewRuntimeConfig;
  now(): Date;
  createLeaseId(): string;
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

  const { startAttemptId, roundType, mode, role, config, questionId } = parsed;
  const preferences = normalizeInterviewClientPreferences(config);
  const runtimeConfig = deps.resolveRuntimeConfig(preferences);
  const requestFingerprint = fingerprintStartRequest({
    roundType,
    mode,
    role,
    config: runtimeConfig,
    questionId: questionId ?? null,
  });
  const roomName = buildInterviewRoomNameForAttempt(startAttemptId);
  const reservationKey = buildInterviewReservationKey(
    input.user.id,
    startAttemptId
  );

  await deps.upsertUser({
    id: input.user.id,
    email: input.user.email!,
    name: input.user.metadata?.name || input.user.metadata?.full_name || null,
  });

  const trialGrant = await ensureTrialGrantForStart(input.user.id, deps);
  if (!trialGrant.ok) {
    return trialGrant;
  }

  let start: PersistedStableInterviewStart;
  let deadlineAt: Date;
  try {
    const existing = await deps.startStore.find({
      startAttemptId,
      userId: input.user.id,
      requestFingerprint,
    });
    let question = existing?.question;
    let resolvedRoundType = existing?.roundType ?? roundType;
    if (!question) {
      const selection = await selectQuestion({
        roundType,
        questionId,
        recentDays: getRecentDays(preferences),
        deps,
      });
      if (!selection.ok) return selection;
      if (!selection.value) throw new Error("interview_start_question_missing");
      question = selection.value;
      resolvedRoundType = selection.roundType;
    }
    const startedAt = existing?.startedAt ?? deps.now();
    start = await deps.prepareStart({
      start: {
        startAttemptId,
        userId: input.user.id,
        requestFingerprint,
        role,
        roundType: resolvedRoundType,
        mode,
        roomName,
        config: { ...runtimeConfig },
        startedAt,
        question,
      },
      reservation: {
        userId: input.user.id,
        reservationKey,
        sessionId: startAttemptId,
        startContractVersion: 1,
        startAttemptId,
      },
    });
    deadlineAt = deriveInterviewDeadlineAt({
      startedAt: start.startedAt,
      durationMinutes: runtimeConfig.duration,
    });
  } catch (error) {
    if (error instanceof InterviewStartConflictError) {
      return {
        ok: false,
        status: 409,
        body: {
          error: "interview_start_attempt_conflict",
          message: "This interview start attempt does not match the request.",
          retryable: false,
        },
      };
    }
    const creditError = mapCreditReservationError(error);
    if (creditError) return creditError;
    throw error;
  }

  const leaseId = deps.createLeaseId();
  let claim;
  try {
    claim = await deps.startStore.claimProvisioning({
      startAttemptId,
      userId: input.user.id,
      requestFingerprint,
      leaseId,
      now: deps.now(),
      deadlineAt,
    });
  } catch (error) {
    if (error instanceof InterviewStartFailedError) {
      try {
        await cleanupFailedStart(start, reservationKey, input.env, deps);
      } catch (cleanupError) {
        console.error(
          "Failed interview start cleanup remains pending:",
          getErrorMessage(cleanupError)
        );
        return {
          ok: false,
          status: 503,
          body: {
            error: "interview_start_cleanup_pending",
            message:
              "The failed interview is still being reconciled. Please try again.",
            retryable: true,
          },
        };
      }
      return {
        ok: false,
        status: 409,
        body: {
          error: error.message,
          message: "This interview start attempt cannot be resumed.",
          retryable: false,
        },
      };
    }
    if (error instanceof InterviewStartConflictError) {
      return {
        ok: false,
        status: 409,
        body: {
          error: error.message,
          message: "This interview start attempt cannot be resumed.",
          retryable: false,
        },
      };
    }
    throw error;
  }

  if (claim.disposition === "busy") {
    return {
      ok: false,
      status: 503,
      body: {
        error: "interview_start_in_progress",
        message: "The interview is still starting. Please try again.",
        retryable: true,
        retryAfterMs: claim.retryAfterMs,
      },
    };
  }

  if (claim.disposition === "not_joinable") {
    await reconcileLateProvisionedRoom(claim.start, input.env, deps);
    return terminalStartResult("interview_start_not_joinable");
  }

  if (claim.disposition === "failed") {
    try {
      await cleanupFailedStart(start, reservationKey, input.env, deps);
    } catch (cleanupError) {
      console.error(
        "Expired interview start cleanup remains pending:",
        getErrorMessage(cleanupError)
      );
      return {
        ok: false,
        status: 503,
        body: {
          error: "interview_start_cleanup_pending",
          message:
            "The expired interview start is still being reconciled. Please try again.",
          retryable: true,
        },
      };
    }
    return terminalStartResult("interview_start_attempt_expired");
  }

  if (claim.disposition === "claimed") {
    start = claim.start;
    try {
      await requireLifecycleTransition(
        { sessionId: start.sessionId, to: "connecting" },
        deps
      );
      await deps.scheduleDeadline({ sessionId: start.sessionId, deadlineAt });
    } catch {
      await deps.startStore.releaseProvisioningClaim({
        startAttemptId,
        leaseId: claim.leaseId,
      });
      return {
        ok: false,
        status: 503,
        body: {
          error: "interview_lifecycle_start_pending",
          message: "The interview is still starting. Please try again.",
          retryable: true,
        },
      };
    }
    const roomMetadata = buildInterviewRoomMetadata({
      session_id: start.sessionId,
      candidate_identity: input.user.id,
      transcript_ingest_url: buildTranscriptIngestUrl(input.appBaseUrl),
      round_type: start.roundType,
      mode,
      deadline_at: serializeInterviewDeadlineAt(deadlineAt),
      config: runtimeConfig,
      question: toRoomQuestion(start.question),
    });
    let livekitResult;
    try {
      livekitResult = await deps.livekitProvider.startInterviewRoom({
        agentName: input.interviewAgentName,
        identity: input.user.id,
        participantName: "Candidate",
        roomName: start.roomName,
        metadata: roomMetadata,
        env: input.env,
      });
    } catch (error) {
      console.error(
        "LiveKit interview provisioning threw:",
        getErrorMessage(error)
      );
      await safelyTerminateProvisioningRoom(
        start.roomName,
        input.user.id,
        input.env,
        deps
      );
      await deps.startStore.releaseProvisioningClaim({
        startAttemptId,
        leaseId: claim.leaseId,
      });
      return {
        ok: false,
        status: 503,
        body: {
          error: "voice_interview_start_unavailable",
          message: "The voice interview is still starting. Please try again.",
          retryable: true,
        },
      };
    }
    if (!livekitResult.ok) {
      console.error("LiveKit interview start error:", livekitResult.error);
      if (livekitResult.error.retryable) {
        await safelyTerminateProvisioningRoom(
          start.roomName,
          input.user.id,
          input.env,
          deps
        );
        await deps.startStore.releaseProvisioningClaim({
          startAttemptId,
          leaseId: claim.leaseId,
        });
        return {
          ok: false,
          status: 503,
          body: {
            error: "voice_interview_start_unavailable",
            message: "The voice interview is still starting. Please try again.",
            retryable: true,
          },
        };
      }
      try {
        await failProvisioningAndRelease({
          start,
          leaseId: claim.leaseId,
          reservationKey,
          env: input.env,
          deps,
        });
      } catch (cleanupError) {
        console.error(
          "Failed interview start cleanup remains pending:",
          getErrorMessage(cleanupError)
        );
        return {
          ok: false,
          status: 503,
          body: {
            error: "interview_start_cleanup_pending",
            message:
              "The failed interview is still being reconciled. Please try again.",
            retryable: true,
          },
        };
      }
      return {
        ok: false,
        status: 409,
        body: {
          error: livekitResult.error.code,
          message: "The voice interview could not be started safely.",
          retryable: false,
        },
      };
    }

    try {
      start = await deps.startStore.markProvisioned({
        startAttemptId,
        leaseId: claim.leaseId,
        provisionedAt: deps.now(),
        deadlineAt,
      });
      const completed = await deps.completeRoomProvisioning({
        sessionId: start.sessionId,
        expectedVersion: start.lifecycleVersion,
      });
      if (!completed) {
        throw new InterviewProvisioningLeaseLostError();
      }
    } catch (error) {
      console.error(
        "Interview provisioning acknowledgement error:",
        getErrorMessage(error)
      );

      let durableStart: PersistedStableInterviewStart | null;
      try {
        durableStart = await deps.startStore.find({
          startAttemptId,
          userId: input.user.id,
          requestFingerprint,
        });
      } catch (reconciliationError) {
        console.error(
          "Interview provisioning acknowledgement reconciliation error:",
          getErrorMessage(reconciliationError)
        );
        return {
          ok: false,
          status: 503,
          body: {
            error: "interview_start_acknowledgement_pending",
            message: "The interview is still starting. Please try again.",
            retryable: true,
          },
        };
      }

      // A commit can succeed even when its acknowledgement is lost. Preserve
      // the reconciled ready room rather than deleting durable provider state.
      if (durableStart?.provisioningState === "ready") {
        const authorization = await authorizeProvisionedOrReconcile(
          {
            startAttemptId,
            userId: input.user.id,
            requestFingerprint,
            deadlineAt,
          },
          durableStart,
          input.env,
          deps
        );
        if (!authorization) {
          return acknowledgementPendingResult();
        }
        if (!authorization.joinable) {
          await reconcileLateProvisionedRoom(
            authorization.start,
            input.env,
            deps
          );
          return terminalStartResult("interview_start_not_joinable");
        }
        start = authorization.start;
        await deps.markRoomProvisioningSettled(start.sessionId);
      } else {
        if (!(error instanceof InterviewProvisioningLeaseLostError)) {
          await deps.startStore.releaseProvisioningClaim({
            startAttemptId,
            leaseId: claim.leaseId,
          });
        }
        await reconcileLateProvisionedRoom(
          durableStart ?? start,
          input.env,
          deps
        );
        return {
          ok: false,
          status: 503,
          body: {
            error: "interview_start_acknowledgement_pending",
            message: "The interview is still starting. Please try again.",
            retryable: true,
          },
        };
      }
    }
  }

  const authorization = await authorizeProvisionedOrReconcile(
    {
      startAttemptId,
      userId: input.user.id,
      requestFingerprint,
      deadlineAt,
    },
    start,
    input.env,
    deps
  );
  if (!authorization) {
    return acknowledgementPendingResult();
  }
  start = authorization.start;
  const tokenNow = authorization.databaseNow;
  if (!authorization.joinable) {
    await reconcileLateProvisionedRoom(start, input.env, deps);
    return terminalStartResult("interview_start_not_joinable");
  }
  const remainingSeconds = Math.floor(
    (deadlineAt.getTime() - tokenNow.getTime()) / 1000
  );
  if (remainingSeconds < 1) {
    return terminalStartResult("interview_start_not_joinable");
  }

  const tokenResult = await deps.issueParticipantToken({
    identity: input.user.id,
    participantName: "Candidate",
    roomName: start.roomName,
    ttlSeconds: Math.min(5 * 60, remainingSeconds),
    observedAt: tokenNow,
    expiresAt: deadlineAt,
    env: input.env,
  });
  if (!tokenResult.ok) {
    return {
      ok: false,
      status: 503,
      body: {
        error: "interview_token_unavailable",
        message:
          "The interview is ready, but access is temporarily unavailable.",
        retryable: true,
      },
    };
  }

  const finalAuthorization = await authorizeProvisionedOrReconcile(
    {
      startAttemptId,
      userId: input.user.id,
      requestFingerprint,
      deadlineAt,
    },
    start,
    input.env,
    deps
  );
  if (!finalAuthorization) {
    return acknowledgementPendingResult();
  }
  if (!finalAuthorization.joinable) {
    await reconcileLateProvisionedRoom(
      finalAuthorization.start,
      input.env,
      deps
    );
    return terminalStartResult("interview_start_not_joinable");
  }
  start = finalAuthorization.start;

  return {
    ok: true,
    body: {
      sessionId: start.sessionId,
      roomName: start.roomName,
      token: tokenResult.data.token,
      url: tokenResult.data.url,
      deadlineAt: serializeInterviewDeadlineAt(deadlineAt),
      config: preferences,
      question: {
        id: start.question.id,
        text: start.question.questionText,
        company: start.question.company,
      },
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
  const startStore = createDrizzleInterviewStartStore();
  const persistentCreditLedger = localCreditBypass
    ? null
    : createCreditLedgerService({ store: createDrizzleCreditLedgerStore() });
  const creditLedger =
    persistentCreditLedger ?? createLocalDevCreditLedgerService();
  const reconnectStore = createDrizzleInterviewReconnectStore();

  return {
    startStore,
    prepareStart: async ({ start, reservation }) => {
      if (localCreditBypass) {
        const persisted = await startStore.createOrLoad(start);
        const localDeadlineAt = deriveInterviewDeadlineAt({
          startedAt: persisted.startedAt,
          durationMinutes: normalizeInterviewDurationMinutes(
            persisted.config.duration
          ),
        });
        await creditLedger.reserveCredit({
          ...reservation,
          expiresAt: new Date(localDeadlineAt.getTime() + 10 * 60_000),
        });
        return persisted;
      }
      const result = await startStore.createOrLoadAndReserve({
        start,
        reservation,
        currentTime: new Date(),
      });
      trackReservedCreditEvents(reservation, result.credit);
      return result.start;
    },
    getQuestionById,
    getRandomQuestion,
    getRandomRecentQuestion,
    ensureTrialGrant: async (userId) => {
      if (!persistentCreditLedger) {
        return;
      }
      await ensureCanonicalTrialGrant(persistentCreditLedger, userId);
    },
    releaseReservation: creditLedger.releaseReservation,
    scheduleDeadline: scheduleInterviewDeadline,
    terminateRoom: async (input) => {
      const result = await terminateInterviewRoom(input);
      if (!result.ok) throw new Error(result.error.code);
    },
    markRoomCleanupComplete: (sessionId) =>
      reconnectStore.markRoomCleanupComplete({ sessionId }),
    completeRoomProvisioning: async (input) =>
      (await reconnectStore.completeRoomProvisioning(input)).applied,
    markRoomProvisioningSettled: (sessionId) =>
      reconnectStore.markRoomProvisioningSettled({ sessionId }),
    settleCredit: convergeDrizzleInterviewCreditSettlement,
    livekitProvider: createLiveKitInterviewProvider(),
    issueParticipantToken: issueInterviewParticipantToken,
    transitionLifecycle: transitionInterviewSessionWorkflow,
    upsertUser,
    resolveRuntimeConfig: (preferences) =>
      resolveInterviewRuntimeConfig(
        preferences,
        interviewRuntimeSettingsFromEnv(process.env)
      ),
    now: () => new Date(),
    createLeaseId: randomUUID,
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

type ParsedStartInterviewBody = {
  ok: true;
  startAttemptId: string;
  roundType: RoundType;
  mode: "voice_video" | "text";
  role: "pm";
  config: Record<string, unknown>;
  questionId?: string;
};

function parseStartInterviewBody(
  body: StartInterviewSessionBody
): ParsedStartInterviewBody | StartInterviewSessionErrorResult {
  if (typeof body.startAttemptId !== "string" || !isUuid(body.startAttemptId)) {
    return {
      ok: false,
      status: 400,
      body: { error: "startAttemptId must be a UUID", retryable: false },
    };
  }
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
    startAttemptId: body.startAttemptId,
    roundType: body.roundType,
    mode: body.mode === "text" ? "text" : "voice_video",
    role: "pm",
    config: isRecord(body.config) ? body.config : {},
    questionId:
      typeof body.questionId === "string" ? body.questionId : undefined,
  };
}

function mapCreditReservationError(
  error: unknown
): StartInterviewSessionErrorResult | null {
  if (isInsufficientCreditsError(error)) {
    return {
      ok: false,
      status: 402,
      body: {
        error: "no_credits_remaining",
        message: "You need an interview credit to start a full interview.",
        upgradeUrl: "/pricing",
        retryable: false,
      },
    };
  }
  return null;
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
    company: question.company,
    text_preview: `${question.questionText.substring(0, 100)}...`,
    ...extra,
  });
}

export function fingerprintStartRequest(
  input: Record<string, unknown>
): string {
  return createHash("sha256").update(stableSerialize(input)).digest("hex");
}

export function buildInterviewRoomNameForAttempt(
  startAttemptId: string
): string {
  return `interview-${startAttemptId}`;
}

export function buildInterviewReservationKey(
  userId: string,
  startAttemptId: string
): string {
  return `interview-start:${userId}:${startAttemptId}`;
}

function toRoomQuestion(question: QuestionBankRecord) {
  return {
    id: question.id,
    text: question.questionText,
    company: question.company,
    type: question.questionType,
    askedAt: question.askedAt,
  };
}

async function failProvisioningAndRelease({
  start,
  leaseId,
  reservationKey,
  env,
  deps,
}: {
  start: PersistedStableInterviewStart;
  leaseId: string;
  reservationKey: string;
  env: LiveKitEnvironment;
  deps: StartInterviewSessionDeps;
}) {
  await deps.startStore.markProvisioningFailed({
    startAttemptId: start.startAttemptId,
    leaseId,
  });
  await cleanupFailedStart(start, reservationKey, env, deps);
}

async function cleanupFailedStart(
  start: PersistedStableInterviewStart,
  reservationKey: string,
  env: LiveKitEnvironment,
  deps: StartInterviewSessionDeps
) {
  await deps.terminateRoom({
    roomName: start.roomName,
    participantIdentity: start.userId,
    env,
  });
  await terminalizeProviderFailure(start.sessionId, deps);
  await deps.releaseReservation({
    reservationKey,
    idempotencyKey: `release:${reservationKey}`,
  });
}

async function reconcileLateProvisionedRoom(
  start: PersistedStableInterviewStart,
  env: LiveKitEnvironment,
  deps: StartInterviewSessionDeps
): Promise<void> {
  try {
    await deps.terminateRoom({
      roomName: start.roomName,
      participantIdentity: start.userId,
      env,
    });
    await deps.markRoomCleanupComplete(start.sessionId);
  } catch {
    // The terminal/deadline winner retains durable cleanup intent. Never log
    // provider details, room identity, or credentials from this path.
    console.error("Late interview provisioning cleanup remains pending");
  }

  try {
    await deps.settleCredit(start.sessionId);
  } catch {
    console.error(
      "Late interview provisioning credit settlement remains pending"
    );
  }
}

async function authorizeProvisionedOrReconcile(
  input: Parameters<InterviewStartStore["authorizeProvisioned"]>[0],
  fallbackStart: PersistedStableInterviewStart,
  env: LiveKitEnvironment,
  deps: StartInterviewSessionDeps
): Promise<Awaited<
  ReturnType<InterviewStartStore["authorizeProvisioned"]>
> | null> {
  try {
    return await deps.startStore.authorizeProvisioned(input);
  } catch {
    console.error("Interview provisioning authorization remains pending");
    await reconcileLateProvisionedRoom(fallbackStart, env, deps);
    return null;
  }
}

function acknowledgementPendingResult(): StartInterviewSessionErrorResult {
  return {
    ok: false,
    status: 503,
    body: {
      error: "interview_start_acknowledgement_pending",
      message: "The interview is still starting. Please try again.",
      retryable: true,
    },
  };
}

function terminalStartResult(error: string): StartInterviewSessionErrorResult {
  return {
    ok: false,
    status: 409,
    body: {
      error,
      message: "This interview start attempt is no longer active.",
      retryable: false,
    },
  };
}

async function safelyTerminateProvisioningRoom(
  roomName: string,
  participantIdentity: string,
  env: LiveKitEnvironment,
  deps: StartInterviewSessionDeps
): Promise<void> {
  try {
    await deps.terminateRoom({ roomName, participantIdentity, env });
  } catch (error) {
    console.error(
      "Interview provisioning room cleanup failed:",
      getErrorMessage(error)
    );
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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
import { createHash, randomUUID } from "node:crypto";
