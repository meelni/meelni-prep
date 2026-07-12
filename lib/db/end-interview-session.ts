import { and, eq, sql } from "drizzle-orm";
import {
  canTransitionInterviewLifecycle,
  deriveInterviewTerminalState,
  isInterviewTerminalState,
  projectLegacyInterviewSessionStatus,
  type InterviewLifecycleState,
  type InterviewTerminalReason,
} from "@meelni/core";

import type { SessionValidation } from "@/lib/evaluation/session-validator";
import { feedbackGenerationEventId } from "./feedback-event-id";
import { db } from "./index";
import { feedback, interviewSession } from "./schema";

export type EndInterviewSessionCommand = { sessionId: string } & (
  | {
      actor: { type: "user"; userId: string };
      requestedTerminalReason: "user_end";
    }
  | {
      actor: { type: "system"; source: "hard_deadline" };
      requestedTerminalReason: "time_limit";
    }
  | {
      actor: { type: "system"; source: "invalid_session_recovery" };
      requestedTerminalReason: "provider_failure";
    }
);

export type FinalizeInterviewSessionInput = EndInterviewSessionCommand & {
  validation: SessionValidation;
  now?: Date;
};

export type FinalizeInterviewSessionResult =
  | { ok: false; reason: "not_found" }
  | {
      ok: true;
      disposition: "applied" | "existing" | "repaired";
      userId: string;
      roomName: string | null;
      lifecycle: {
        state: InterviewLifecycleState;
        version: number;
        terminalReason: InterviewTerminalReason;
        endedAt: Date;
      };
      feedback: typeof feedback.$inferSelect;
      deadlineRoomCleanupStatus:
        | "pending"
        | "deleted"
        | "already_absent"
        | null;
      stats: SessionValidation["stats"];
      tier: SessionValidation["tier"];
      recommendations: string[];
    };

export type EndInterviewSessionDatabase = Pick<typeof db, "transaction">;
export type AuthorizeInterviewSessionEndDatabase = Pick<typeof db, "select">;

export async function authorizeInterviewSessionEnd(
  input: EndInterviewSessionCommand,
  database: AuthorizeInterviewSessionEndDatabase = db
): Promise<boolean> {
  const authorizationCondition =
    input.actor.type === "user"
      ? and(
          eq(interviewSession.id, input.sessionId),
          eq(interviewSession.userId, input.actor.userId)
        )
      : eq(interviewSession.id, input.sessionId);
  const rows = await database
    .select({ id: interviewSession.id })
    .from(interviewSession)
    .where(authorizationCondition)
    .limit(1);
  return Boolean(rows[0]);
}

export async function finalizeInterviewSession(
  input: FinalizeInterviewSessionInput,
  database: EndInterviewSessionDatabase = db
): Promise<FinalizeInterviewSessionResult> {
  const now = input.now ?? new Date();

  return database.transaction(async (tx) => {
    const ownershipCondition =
      input.actor.type === "user"
        ? and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.userId, input.actor.userId)
          )
        : eq(interviewSession.id, input.sessionId);
    const rows = await tx
      .select()
      .from(interviewSession)
      .where(ownershipCondition)
      .limit(1)
      .for("update");
    const stored = rows[0];
    if (!stored) return { ok: false, reason: "not_found" } as const;

    let state = stored.lifecycleState;
    let version = stored.lifecycleVersion;
    let terminalReason = stored.terminalReason;
    let activatedAt = stored.activatedAt;
    let endingAt = stored.endingAt;
    let endedAt = stored.endedAt;
    const wasTerminal = isInterviewTerminalState(state);
    const hardDeadlineOwnsCleanup =
      !wasTerminal &&
      input.actor.type === "system" &&
      input.actor.source === "hard_deadline" &&
      stored.terminalReason === null;

    const advance = async (
      nextState: InterviewLifecycleState,
      reason: InterviewTerminalReason | null
    ) => {
      if (!canTransitionInterviewLifecycle(state, nextState)) {
        throw new Error(
          `Invalid stored interview lifecycle transition: ${state} -> ${nextState}`
        );
      }

      const nextActivatedAt =
        nextState === "active" ? (activatedAt ?? now) : activatedAt;
      const nextEndedAt = isInterviewTerminalState(nextState)
        ? (endedAt ?? now)
        : endedAt;
      const nextEndingAt =
        nextState === "ending" ? (endingAt ?? now) : endingAt;
      const updated = await tx
        .update(interviewSession)
        .set({
          lifecycleState: nextState,
          lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 1`,
          terminalReason: reason,
          status: projectLegacyInterviewSessionStatus({
            state: nextState,
            terminalReason: reason,
          }),
          lastTransitionAt: now,
          ...(nextState === "active" ? { activatedAt: nextActivatedAt } : {}),
          ...(nextState === "ending" ? { endingAt: nextEndingAt } : {}),
          ...(isInterviewTerminalState(nextState)
            ? { endedAt: nextEndedAt }
            : {}),
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, state),
            eq(interviewSession.lifecycleVersion, version)
          )
        )
        .returning({
          state: interviewSession.lifecycleState,
          version: interviewSession.lifecycleVersion,
          terminalReason: interviewSession.terminalReason,
          activatedAt: interviewSession.activatedAt,
          endedAt: interviewSession.endedAt,
        });

      if (!updated[0]) {
        throw new Error("Interview lifecycle changed while its row was locked");
      }
      state = updated[0].state;
      version = updated[0].version;
      terminalReason = updated[0].terminalReason;
      activatedAt = nextActivatedAt;
      endingAt = nextEndingAt;
      endedAt = nextEndedAt;
    };

    if (!wasTerminal) {
      if (state !== "ending" && input.validation.stats.totalTurns > 0) {
        if (state === "created") await advance("connecting", null);
        if (state === "connecting" || state === "reconnecting") {
          await advance("active", null);
        }
      }

      if (state !== "ending") {
        const requestedReason = resolveInterviewTerminalReason(
          input.validation,
          input.requestedTerminalReason
        );
        await advance("ending", requestedReason);
      }

      if (state === "ending") {
        if (!terminalReason) {
          throw new Error("Ending interview is missing its terminal reason");
        }
        await advance(
          deriveInterviewTerminalState({
            reason: terminalReason,
            activated: activatedAt !== null,
          }),
          terminalReason
        );
      }
    }

    if (!isInterviewTerminalState(state) || !terminalReason || !endedAt) {
      throw new Error("Interview completion did not reach a terminal outcome");
    }

    if (hardDeadlineOwnsCleanup && stored.deadlineRoomCleanupStatus === null) {
      await tx
        .update(interviewSession)
        .set({ deadlineRoomCleanupStatus: "pending" })
        .where(eq(interviewSession.id, input.sessionId));
    }

    if (!wasTerminal) {
      await tx
        .update(interviewSession)
        .set({
          totalTurns: input.validation.stats.totalTurns,
          totalWords: input.validation.stats.totalWords,
          durationSeconds: input.validation.stats.durationSeconds,
        })
        .where(eq(interviewSession.id, input.sessionId));
    }

    const shouldGenerate = state === "completed" && input.validation.isValid;
    const skippedReason = shouldGenerate
      ? null
      : input.validation.reasons[0] ||
        `Interview ended as ${state} (${terminalReason})`;
    const inserted = await tx
      .insert(feedback)
      .values({
        sessionId: input.sessionId,
        status: shouldGenerate ? "pending" : "skipped",
        statusReason: skippedReason,
        rubricVersion: "1.0.0",
        completionTier: input.validation.tier,
        completionStats: input.validation.stats,
        completionRecommendations: input.validation.recommendations,
        dispatchStatus: shouldGenerate ? "pending" : "not_required",
        dispatchEventId: shouldGenerate
          ? feedbackGenerationEventId(input.sessionId, 0)
          : null,
      })
      .onConflictDoNothing({ target: feedback.sessionId })
      .returning();

    const feedbackRecord =
      inserted[0] ??
      (
        await tx
          .select()
          .from(feedback)
          .where(eq(feedback.sessionId, input.sessionId))
          .limit(1)
      )[0];
    if (!feedbackRecord) {
      throw new Error("Interview completion is missing its feedback result");
    }

    return {
      ok: true,
      disposition: wasTerminal
        ? inserted[0]
          ? "repaired"
          : "existing"
        : "applied",
      userId: stored.userId,
      roomName: stored.livekitRoomName,
      lifecycle: { state, version, terminalReason, endedAt },
      feedback: feedbackRecord,
      deadlineRoomCleanupStatus: hardDeadlineOwnsCleanup
        ? (stored.deadlineRoomCleanupStatus ?? "pending")
        : stored.deadlineRoomCleanupStatus,
      stats: feedbackRecord.completionStats ?? input.validation.stats,
      tier:
        (feedbackRecord.completionTier as SessionValidation["tier"] | null) ??
        input.validation.tier,
      recommendations:
        feedbackRecord.completionRecommendations ??
        input.validation.recommendations,
    } as const;
  });
}

export function resolveInterviewTerminalReason(
  validation: Pick<SessionValidation, "isValid">,
  requestedTerminalReason: "user_end" | "time_limit" | "provider_failure"
): InterviewTerminalReason {
  if (requestedTerminalReason === "provider_failure") {
    return "provider_failure";
  }
  return validation.isValid ? requestedTerminalReason : "insufficient_signal";
}
