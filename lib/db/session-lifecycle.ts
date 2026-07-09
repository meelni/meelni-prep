import { and, eq, sql } from "drizzle-orm";
import {
  isInterviewTerminalState,
  projectLegacyInterviewSessionStatus,
  type InterviewLifecycleState,
  type InterviewTerminalReason,
  type InterviewTerminalState,
  type LegacyInterviewSessionStatus,
} from "@meelni/core";

import { db } from "./index";
import { interviewSession } from "./schema";

export interface PersistedInterviewLifecycle {
  sessionId: string;
  state: InterviewLifecycleState;
  version: number;
  terminalReason: InterviewTerminalReason | null;
  legacyStatus: LegacyInterviewSessionStatus;
  activatedAt: Date | null;
  endingAt: Date | null;
  lastTransitionAt: Date;
  endedAt: Date | null;
}

interface CompareAndSetBase {
  sessionId: string;
  expectedState: InterviewLifecycleState;
  expectedVersion: number;
  transitionedAt?: Date;
}

type NonTerminalWriteState = Exclude<
  InterviewLifecycleState,
  "ending" | InterviewTerminalState
>;

export type CompareAndSetInterviewLifecycleInput = CompareAndSetBase &
  (
    | {
        nextState: NonTerminalWriteState;
        terminalReason?: null;
      }
    | {
        nextState: "ending" | InterviewTerminalState;
        terminalReason: InterviewTerminalReason;
      }
  );

export type CompareAndSetInterviewLifecycleResult =
  | {
      applied: true;
      current: PersistedInterviewLifecycle;
    }
  | {
      applied: false;
      reason: "conflict" | "not_found";
      current: PersistedInterviewLifecycle | null;
    };

export interface InterviewSessionLifecycleStore {
  get(sessionId: string): Promise<PersistedInterviewLifecycle | null>;
  compareAndSet(
    input: CompareAndSetInterviewLifecycleInput
  ): Promise<CompareAndSetInterviewLifecycleResult>;
}

export type SessionLifecycleDatabase = Pick<typeof db, "select" | "update">;

export function createDrizzleInterviewSessionLifecycleStore(
  database: SessionLifecycleDatabase = db
): InterviewSessionLifecycleStore {
  const store: InterviewSessionLifecycleStore = {
    async get(sessionId) {
      const rows = await database
        .select()
        .from(interviewSession)
        .where(eq(interviewSession.id, sessionId))
        .limit(1);

      return rows[0] ? mapLifecycleRow(rows[0]) : null;
    },

    async compareAndSet(input) {
      const transitionedAt = input.transitionedAt ?? new Date();
      const legacyStatus = projectLegacyInterviewSessionStatus({
        state: input.nextState,
        terminalReason: input.terminalReason ?? null,
      });
      const rows = await database
        .update(interviewSession)
        .set({
          lifecycleState: input.nextState,
          lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 1`,
          terminalReason: input.terminalReason ?? null,
          status: legacyStatus,
          lastTransitionAt: transitionedAt,
          ...(input.nextState === "active"
            ? {
                activatedAt: sql`COALESCE(${interviewSession.activatedAt}, ${transitionedAt})`,
              }
            : {}),
          ...(input.nextState === "ending"
            ? {
                endingAt: sql`COALESCE(${interviewSession.endingAt}, ${transitionedAt})`,
              }
            : {}),
          ...(isInterviewTerminalState(input.nextState)
            ? {
                endedAt: sql`COALESCE(${interviewSession.endedAt}, ${transitionedAt})`,
              }
            : {}),
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, input.expectedState),
            eq(interviewSession.lifecycleVersion, input.expectedVersion)
          )
        )
        .returning();

      if (rows[0]) {
        return { applied: true, current: mapLifecycleRow(rows[0]) };
      }

      const current = await store.get(input.sessionId);
      return {
        applied: false,
        reason: current ? "conflict" : "not_found",
        current,
      };
    },
  };

  return store;
}

function mapLifecycleRow(
  row: typeof interviewSession.$inferSelect
): PersistedInterviewLifecycle {
  return {
    sessionId: row.id,
    state: row.lifecycleState,
    version: row.lifecycleVersion,
    terminalReason: row.terminalReason,
    legacyStatus: row.status,
    activatedAt: row.activatedAt,
    endingAt: row.endingAt,
    lastTransitionAt: row.lastTransitionAt,
    endedAt: row.endedAt,
  };
}
