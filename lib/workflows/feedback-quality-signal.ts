import {
  isFeedbackQualitySelectionValid,
  parseFeedbackQualitySignalCommand,
  parseFeedbackQualitySignalView,
  type FeedbackQualityOutcome,
  type FeedbackQualitySignalCommand,
  type FeedbackQualitySignalView,
} from "@meelni/core";

export interface FeedbackQualityOwnedState {
  outcome: FeedbackQualityOutcome;
  signal: FeedbackQualitySignalView | null;
}

export type FeedbackQualityReadDisposition =
  | { disposition: "available"; state: FeedbackQualityOwnedState }
  | { disposition: "not_found" }
  | { disposition: "signal_invalid" };

export type FeedbackQualityWriteDisposition =
  | {
      disposition: "created" | "updated" | "unchanged";
      state: FeedbackQualityOwnedState;
    }
  | { disposition: "conflict"; state: FeedbackQualityOwnedState }
  | { disposition: "account_deletion_pending" | "not_found" }
  | { disposition: "signal_invalid" };

export interface FeedbackQualitySignalRepository {
  readOwned(input: {
    userId: string;
    sessionId: string;
  }): Promise<FeedbackQualityReadDisposition>;
  writeOwned(input: {
    userId: string;
    sessionId: string;
    outcome: FeedbackQualityOutcome;
    command: FeedbackQualitySignalCommand;
  }): Promise<FeedbackQualityWriteDisposition>;
}

export interface FeedbackQualityWorkflowDependencies {
  repository: FeedbackQualitySignalRepository;
  isDeletionPending(userId: string): Promise<boolean>;
}

export type ReadFeedbackQualitySignalResult =
  | { ok: true; state: FeedbackQualityOwnedState }
  | {
      ok: false;
      reason:
        | "invalid_request"
        | "account_deletion_pending"
        | "not_found"
        | "signal_invalid";
    };

export type WriteFeedbackQualitySignalResult =
  | {
      ok: true;
      disposition: "created" | "updated" | "unchanged";
      state: FeedbackQualityOwnedState;
    }
  | { ok: false; reason: "conflict"; state: FeedbackQualityOwnedState }
  | {
      ok: false;
      reason:
        | "invalid_request"
        | "account_deletion_pending"
        | "not_found"
        | "signal_invalid";
    };

export async function readFeedbackQualitySignalWorkflow(
  input: unknown,
  deps: FeedbackQualityWorkflowDependencies
): Promise<ReadFeedbackQualitySignalResult> {
  const parsed = parseIdentityInput(input);
  if (!parsed) return { ok: false, reason: "invalid_request" };
  if (await deps.isDeletionPending(parsed.userId)) {
    return { ok: false, reason: "account_deletion_pending" };
  }
  const result = await deps.repository.readOwned(parsed);
  if (await deps.isDeletionPending(parsed.userId)) {
    return { ok: false, reason: "account_deletion_pending" };
  }
  if (result.disposition === "not_found") {
    return { ok: false, reason: "not_found" };
  }
  if (result.disposition === "signal_invalid") {
    return { ok: false, reason: "signal_invalid" };
  }
  if (!isOwnedStateValid(result.state)) {
    return { ok: false, reason: "signal_invalid" };
  }
  return { ok: true, state: result.state };
}

export async function writeFeedbackQualitySignalWorkflow(
  input: unknown,
  deps: FeedbackQualityWorkflowDependencies
): Promise<WriteFeedbackQualitySignalResult> {
  const parsed = parseWriteInput(input);
  if (!parsed) return { ok: false, reason: "invalid_request" };
  if (await deps.isDeletionPending(parsed.userId)) {
    return { ok: false, reason: "account_deletion_pending" };
  }

  const source = await deps.repository.readOwned(parsed);
  if (await deps.isDeletionPending(parsed.userId)) {
    return { ok: false, reason: "account_deletion_pending" };
  }
  if (source.disposition === "not_found") {
    return { ok: false, reason: "not_found" };
  }
  if (source.disposition === "signal_invalid") {
    return { ok: false, reason: "signal_invalid" };
  }
  if (!isOwnedStateValid(source.state)) {
    return { ok: false, reason: "signal_invalid" };
  }
  if (
    !isFeedbackQualitySelectionValid(
      source.state.outcome,
      parsed.command.response,
      parsed.command.reason
    )
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  const written = await deps.repository.writeOwned({
    ...parsed,
    outcome: source.state.outcome,
  });
  if (!("state" in written)) {
    if (written.disposition === "account_deletion_pending") {
      return { ok: false, reason: "account_deletion_pending" };
    }
    if (written.disposition === "not_found") {
      return { ok: false, reason: "not_found" };
    }
    return { ok: false, reason: "signal_invalid" };
  }
  if (!isOwnedStateValid(written.state)) {
    return { ok: false, reason: "signal_invalid" };
  }
  if (written.disposition === "conflict") {
    return { ok: false, reason: "conflict", state: written.state };
  }
  return {
    ok: true,
    disposition: written.disposition,
    state: written.state,
  };
}

function parseIdentityInput(
  value: unknown
): { userId: string; sessionId: string } | null {
  if (!isRecord(value) || !hasExactKeys(value, ["userId", "sessionId"])) {
    return null;
  }
  return isIdentity(value.userId) && isIdentity(value.sessionId)
    ? { userId: value.userId, sessionId: value.sessionId }
    : null;
}

function parseWriteInput(value: unknown): {
  userId: string;
  sessionId: string;
  command: FeedbackQualitySignalCommand;
} | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["userId", "sessionId", "command"]) ||
    !isIdentity(value.userId) ||
    !isIdentity(value.sessionId)
  ) {
    return null;
  }
  const command = parseFeedbackQualitySignalCommand(value.command);
  return command
    ? { userId: value.userId, sessionId: value.sessionId, command }
    : null;
}

function isOwnedStateValid(state: FeedbackQualityOwnedState): boolean {
  return (
    state.signal === null ||
    (parseFeedbackQualitySignalView(state.signal) !== null &&
      state.signal.outcome === state.outcome)
  );
}

function isIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    value.length <= 512 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}
