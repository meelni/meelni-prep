import { and, desc, eq, sql } from "drizzle-orm";
import type {
  TranscriptRuntimeSettlementCommand,
  TranscriptRuntimeSettlementCommandAck,
  TranscriptRuntimeSettlementCommandPull,
} from "@meelni/agent";

import { db } from "./index";
import {
  interviewSession,
  transcriptRuntimeSettlement,
  transcriptRuntimeSettlementCommand,
  transcriptRuntimeWriter,
} from "./schema";

export const RUNTIME_SETTLEMENT_COMMAND_CONTRACT_VERSION = 1 as const;
export const RUNTIME_SETTLEMENT_COMMAND_EXPIRY_MS = 20_000;

export type PersistedRuntimeSettlementCommand =
  typeof transcriptRuntimeSettlementCommand.$inferSelect;
export type RuntimeSettlementCommandDatabase = Pick<typeof db, "transaction">;
type RuntimeSettlementCommandTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export function buildRuntimeSettlementCommandId(input: {
  sessionId: string;
  lifecycleVersion: number;
}): string {
  return `runtime-settlement:${input.sessionId}:${input.lifecycleVersion}`;
}

export function toRuntimeSettlementCommand(
  command: PersistedRuntimeSettlementCommand
): TranscriptRuntimeSettlementCommand {
  return {
    contract_version: RUNTIME_SETTLEMENT_COMMAND_CONTRACT_VERSION,
    event_type: "runtime_settlement_command",
    command_id: command.commandId,
    session_id: command.sessionId,
    lifecycle_version: command.lifecycleVersion,
    room_name: command.roomName,
    writer_id: command.writerId,
    writer_generation: command.writerGeneration,
    cutoff_at: command.cutoffAt.toISOString(),
    expires_at: command.expiresAt.toISOString(),
  };
}

export type PullRuntimeSettlementCommandResult =
  | {
      ok: true;
      disposition: "pending";
      command: TranscriptRuntimeSettlementCommand;
    }
  | {
      ok: true;
      disposition: "acknowledged" | "terminal";
      reason: NonNullable<PersistedRuntimeSettlementCommand["terminalReason"]>;
    }
  | { ok: false; reason: "not_found" | "fenced" };

export async function pullRuntimeSettlementCommand(
  pull: TranscriptRuntimeSettlementCommandPull,
  database: RuntimeSettlementCommandDatabase = db
): Promise<PullRuntimeSettlementCommandResult> {
  return database.transaction(async (tx) => {
    await configureCommandTimeouts(tx);
    const rows = await tx
      .select()
      .from(transcriptRuntimeSettlementCommand)
      .where(eq(transcriptRuntimeSettlementCommand.sessionId, pull.session_id))
      .orderBy(desc(transcriptRuntimeSettlementCommand.lifecycleVersion))
      .limit(1)
      .for("update");
    const command = rows[0];
    if (!command) return { ok: false, reason: "not_found" } as const;
    if (!runtimeIdentityMatches(command, pull)) {
      return { ok: false, reason: "fenced" } as const;
    }

    const current = await getCurrentWriter(tx, pull.session_id);
    if (
      !current ||
      current.writerId !== pull.writer_id ||
      current.generation !== pull.writer_generation
    ) {
      await fencePendingCommand(tx, command.commandId);
      return { ok: false, reason: "fenced" } as const;
    }
    if (command.state !== "pending") {
      return {
        ok: true,
        disposition: command.state,
        reason: command.terminalReason!,
      } as const;
    }
    const expired = await expireCommandIfDue(tx, command);
    if (expired) {
      return { ok: true, disposition: "terminal", reason: "expired" } as const;
    }
    return {
      ok: true,
      disposition: "pending",
      command: toRuntimeSettlementCommand(command),
    } as const;
  });
}

export type AcknowledgeRuntimeSettlementCommandResult =
  | { ok: true; disposition: "acknowledged" | "existing" }
  | {
      ok: false;
      reason:
        | "not_found"
        | "fenced"
        | "expired"
        | "ack_conflict"
        | "settlement_missing"
        | "settlement_mismatch";
    };

export async function acknowledgeRuntimeSettlementCommand(
  ack: TranscriptRuntimeSettlementCommandAck,
  database: RuntimeSettlementCommandDatabase = db
): Promise<AcknowledgeRuntimeSettlementCommandResult> {
  return database.transaction(async (tx) => {
    await configureCommandTimeouts(tx);
    const rows = await tx
      .select()
      .from(transcriptRuntimeSettlementCommand)
      .where(eq(transcriptRuntimeSettlementCommand.commandId, ack.command_id))
      .limit(1)
      .for("update");
    const command = rows[0];
    if (!command) return { ok: false, reason: "not_found" } as const;
    if (!runtimeIdentityMatches(command, ack)) {
      return { ok: false, reason: "fenced" } as const;
    }
    if (command.state === "acknowledged") {
      return command.terminalReason === ack.outcome
        ? ({ ok: true, disposition: "existing" } as const)
        : ({ ok: false, reason: "ack_conflict" } as const);
    }
    if (command.state === "terminal") {
      return {
        ok: false,
        reason: command.terminalReason === "expired" ? "expired" : "fenced",
      } as const;
    }
    if (await expireCommandIfDue(tx, command)) {
      return { ok: false, reason: "expired" } as const;
    }

    const current = await getCurrentWriter(tx, ack.session_id);
    if (
      !current ||
      current.writerId !== ack.writer_id ||
      current.generation !== ack.writer_generation
    ) {
      await fencePendingCommand(tx, command.commandId);
      return { ok: false, reason: "fenced" } as const;
    }
    const settlements = await tx
      .select({ state: transcriptRuntimeSettlement.state })
      .from(transcriptRuntimeSettlement)
      .where(
        and(
          eq(transcriptRuntimeSettlement.sessionId, ack.session_id),
          eq(
            transcriptRuntimeSettlement.writerGeneration,
            ack.writer_generation
          ),
          eq(transcriptRuntimeSettlement.writerId, ack.writer_id)
        )
      )
      .limit(1);
    const settlement = settlements[0];
    if (!settlement) {
      return { ok: false, reason: "settlement_missing" } as const;
    }
    if (settlement.state !== ack.outcome) {
      return { ok: false, reason: "settlement_mismatch" } as const;
    }

    const updated = await tx
      .update(transcriptRuntimeSettlementCommand)
      .set({
        state: "acknowledged",
        terminalReason: ack.outcome,
        acknowledgedAt: sql`date_trunc('milliseconds', clock_timestamp())`,
        terminalAt: sql`date_trunc('milliseconds', clock_timestamp())`,
      })
      .where(
        and(
          eq(transcriptRuntimeSettlementCommand.commandId, command.commandId),
          eq(transcriptRuntimeSettlementCommand.state, "pending")
        )
      )
      .returning({ commandId: transcriptRuntimeSettlementCommand.commandId });
    return updated[0]
      ? ({ ok: true, disposition: "acknowledged" } as const)
      : ({ ok: false, reason: "ack_conflict" } as const);
  });
}

export async function getRuntimeSettlementCommandForUserEnd(
  input: { sessionId: string; userId: string },
  database: RuntimeSettlementCommandDatabase = db
): Promise<PersistedRuntimeSettlementCommand | undefined> {
  return database.transaction(async (tx) => {
    const rows = await tx
      .select({ command: transcriptRuntimeSettlementCommand })
      .from(transcriptRuntimeSettlementCommand)
      .innerJoin(
        // The owner check stays inside the database boundary without exposing a
        // runtime command through a browser-facing route.
        interviewSession,
        eq(interviewSession.id, transcriptRuntimeSettlementCommand.sessionId)
      )
      .where(
        and(
          eq(transcriptRuntimeSettlementCommand.sessionId, input.sessionId),
          eq(interviewSession.userId, input.userId)
        )
      )
      .orderBy(desc(transcriptRuntimeSettlementCommand.lifecycleVersion))
      .limit(1);
    return rows[0]?.command;
  });
}

export async function expireRuntimeSettlementCommand(
  commandId: string,
  database: RuntimeSettlementCommandDatabase = db
): Promise<void> {
  await database.transaction(async (tx) => {
    await tx
      .update(transcriptRuntimeSettlementCommand)
      .set({
        state: "terminal",
        terminalReason: "expired",
        terminalAt: sql`date_trunc('milliseconds', clock_timestamp())`,
      })
      .where(
        and(
          eq(transcriptRuntimeSettlementCommand.commandId, commandId),
          eq(transcriptRuntimeSettlementCommand.state, "pending")
        )
      );
  });
}

function runtimeIdentityMatches(
  command: PersistedRuntimeSettlementCommand,
  input: {
    session_id: string;
    room_name: string;
    writer_id: string;
    writer_generation: number;
  }
): boolean {
  return (
    command.sessionId === input.session_id &&
    command.roomName === input.room_name &&
    command.writerId === input.writer_id &&
    command.writerGeneration === input.writer_generation
  );
}

async function getCurrentWriter(
  tx: RuntimeSettlementCommandTransaction,
  sessionId: string
) {
  const rows = await tx
    .select({
      writerId: transcriptRuntimeWriter.writerId,
      generation: transcriptRuntimeWriter.generation,
    })
    .from(transcriptRuntimeWriter)
    .where(eq(transcriptRuntimeWriter.sessionId, sessionId))
    .orderBy(desc(transcriptRuntimeWriter.generation))
    .limit(1);
  return rows[0];
}

async function expireCommandIfDue(
  tx: RuntimeSettlementCommandTransaction,
  command: PersistedRuntimeSettlementCommand
): Promise<boolean> {
  const expired = await tx
    .update(transcriptRuntimeSettlementCommand)
    .set({
      state: "terminal",
      terminalReason: "expired",
      terminalAt: sql`date_trunc('milliseconds', clock_timestamp())`,
    })
    .where(
      and(
        eq(transcriptRuntimeSettlementCommand.commandId, command.commandId),
        eq(transcriptRuntimeSettlementCommand.state, "pending"),
        sql`${transcriptRuntimeSettlementCommand.expiresAt} <= clock_timestamp()`
      )
    )
    .returning({ commandId: transcriptRuntimeSettlementCommand.commandId });
  return Boolean(expired[0]);
}

async function fencePendingCommand(
  tx: RuntimeSettlementCommandTransaction,
  commandId: string
): Promise<void> {
  await tx
    .update(transcriptRuntimeSettlementCommand)
    .set({
      state: "terminal",
      terminalReason: "fenced",
      terminalAt: sql`date_trunc('milliseconds', clock_timestamp())`,
    })
    .where(
      and(
        eq(transcriptRuntimeSettlementCommand.commandId, commandId),
        eq(transcriptRuntimeSettlementCommand.state, "pending")
      )
    );
}

async function configureCommandTimeouts(
  tx: RuntimeSettlementCommandTransaction
): Promise<void> {
  await tx.execute(sql.raw("set local lock_timeout = '2000ms'"));
  await tx.execute(sql.raw("set local statement_timeout = '5000ms'"));
}
