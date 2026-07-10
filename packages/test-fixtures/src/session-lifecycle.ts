import type {
  InterviewLifecycleState,
  InterviewTerminalReason,
  InterviewTerminalState,
} from "@meelni/core";

export type LifecycleSignalSource =
  | "browser_intent"
  | "deadline_worker"
  | "provider_adapter"
  | "session_workflow"
  | "transcript_aggregator";

export type LifecycleSignal =
  | "session_created"
  | "runtime_start_requested"
  | "runtime_ready"
  | "runtime_start_failed"
  | "transport_lost"
  | "transport_restored"
  | "end_requested"
  | "deadline_reached"
  | "disconnect_grace_expired"
  | "signal_declared_insufficient"
  | "terminalize";

export type LifecycleExpectedDisposition =
  | "accepted"
  | "idempotent"
  | "conflict"
  | "rejected";

export interface LifecycleTransitionFixture {
  commandId: string;
  transitionOwner: "session_workflow";
  signalSource: LifecycleSignalSource;
  signal: LifecycleSignal;
  from: InterviewLifecycleState;
  to: InterviewLifecycleState;
  occurredAt: string;
  expectedVersionBefore: number;
  expectedVersionAfter: number;
  activated: boolean;
  terminalReason?: InterviewTerminalReason;
  expectedDisposition: LifecycleExpectedDisposition;
  expectedErrorCode?: "invalid_transition" | "version_conflict";
}

export interface InterviewLifecycleScenarioFixture {
  id: string;
  description: string;
  initialState: InterviewLifecycleState;
  initialVersion: number;
  transitions: LifecycleTransitionFixture[];
  expectedTerminal?: {
    state: InterviewTerminalState;
    reason: InterviewTerminalReason;
  };
}

const lifecycleScenarios: InterviewLifecycleScenarioFixture[] = [
  {
    id: "normal-user-completion",
    description:
      "An activated interview ends through an explicit user request and completes once finalization finishes.",
    initialState: "created",
    initialVersion: 1,
    transitions: [
      transition(
        "normal-1",
        "session_workflow",
        "runtime_start_requested",
        "created",
        "connecting",
        1,
        2,
        false
      ),
      transition(
        "normal-2",
        "provider_adapter",
        "runtime_ready",
        "connecting",
        "active",
        2,
        3,
        true
      ),
      transition(
        "normal-3",
        "browser_intent",
        "end_requested",
        "active",
        "ending",
        3,
        4,
        true,
        "user_end"
      ),
      transition(
        "normal-4",
        "session_workflow",
        "terminalize",
        "ending",
        "completed",
        4,
        5,
        true,
        "user_end"
      ),
    ],
    expectedTerminal: { state: "completed", reason: "user_end" },
  },
  {
    id: "provider-start-failure",
    description:
      "A provider-neutral runtime start failure before activation terminates the interview as failed.",
    initialState: "created",
    initialVersion: 1,
    transitions: [
      transition(
        "start-failure-1",
        "session_workflow",
        "runtime_start_requested",
        "created",
        "connecting",
        1,
        2,
        false
      ),
      transition(
        "start-failure-2",
        "provider_adapter",
        "runtime_start_failed",
        "connecting",
        "ending",
        2,
        3,
        false,
        "provider_failure"
      ),
      transition(
        "start-failure-3",
        "session_workflow",
        "terminalize",
        "ending",
        "failed",
        3,
        4,
        false,
        "provider_failure"
      ),
    ],
    expectedTerminal: { state: "failed", reason: "provider_failure" },
  },
  {
    id: "insufficient-signal-abandonment",
    description:
      "An activated interview without enough durable transcript signal is abandoned rather than scored as completed.",
    initialState: "created",
    initialVersion: 1,
    transitions: [
      transition(
        "insufficient-1",
        "session_workflow",
        "runtime_start_requested",
        "created",
        "connecting",
        1,
        2,
        false
      ),
      transition(
        "insufficient-2",
        "provider_adapter",
        "runtime_ready",
        "connecting",
        "active",
        2,
        3,
        true
      ),
      transition(
        "insufficient-3",
        "transcript_aggregator",
        "signal_declared_insufficient",
        "active",
        "ending",
        3,
        4,
        true,
        "insufficient_signal"
      ),
      transition(
        "insufficient-4",
        "session_workflow",
        "terminalize",
        "ending",
        "abandoned",
        4,
        5,
        true,
        "insufficient_signal"
      ),
    ],
    expectedTerminal: { state: "abandoned", reason: "insufficient_signal" },
  },
  {
    id: "reconnect-recovered",
    description:
      "A temporary transport loss returns to the active state before the interview ends normally.",
    initialState: "created",
    initialVersion: 1,
    transitions: [
      transition(
        "reconnect-1",
        "session_workflow",
        "runtime_start_requested",
        "created",
        "connecting",
        1,
        2,
        false
      ),
      transition(
        "reconnect-2",
        "provider_adapter",
        "runtime_ready",
        "connecting",
        "active",
        2,
        3,
        true
      ),
      transition(
        "reconnect-3",
        "provider_adapter",
        "transport_lost",
        "active",
        "reconnecting",
        3,
        4,
        true
      ),
      transition(
        "reconnect-4",
        "provider_adapter",
        "transport_restored",
        "reconnecting",
        "active",
        4,
        5,
        true
      ),
      transition(
        "reconnect-5",
        "browser_intent",
        "end_requested",
        "active",
        "ending",
        5,
        6,
        true,
        "user_end"
      ),
      transition(
        "reconnect-6",
        "session_workflow",
        "terminalize",
        "ending",
        "completed",
        6,
        7,
        true,
        "user_end"
      ),
    ],
    expectedTerminal: { state: "completed", reason: "user_end" },
  },
  {
    id: "disconnect-timeout-after-activation",
    description:
      "An activated interview that exhausts its reconnect grace period preserves the disconnect timeout reason and completes for downstream policy to evaluate.",
    initialState: "created",
    initialVersion: 1,
    transitions: [
      transition(
        "disconnect-1",
        "session_workflow",
        "runtime_start_requested",
        "created",
        "connecting",
        1,
        2,
        false
      ),
      transition(
        "disconnect-2",
        "provider_adapter",
        "runtime_ready",
        "connecting",
        "active",
        2,
        3,
        true
      ),
      transition(
        "disconnect-3",
        "provider_adapter",
        "transport_lost",
        "active",
        "reconnecting",
        3,
        4,
        true
      ),
      transition(
        "disconnect-4",
        "deadline_worker",
        "disconnect_grace_expired",
        "reconnecting",
        "ending",
        4,
        5,
        true,
        "disconnect_timeout"
      ),
      transition(
        "disconnect-5",
        "session_workflow",
        "terminalize",
        "ending",
        "completed",
        5,
        6,
        true,
        "disconnect_timeout"
      ),
    ],
    expectedTerminal: { state: "completed", reason: "disconnect_timeout" },
  },
  {
    id: "hard-time-limit",
    description:
      "The server-owned deadline ends an activated interview even when the browser does not request completion.",
    initialState: "created",
    initialVersion: 1,
    transitions: [
      transition(
        "time-limit-1",
        "session_workflow",
        "runtime_start_requested",
        "created",
        "connecting",
        1,
        2,
        false
      ),
      transition(
        "time-limit-2",
        "provider_adapter",
        "runtime_ready",
        "connecting",
        "active",
        2,
        3,
        true
      ),
      transition(
        "time-limit-3",
        "deadline_worker",
        "deadline_reached",
        "active",
        "ending",
        3,
        4,
        true,
        "time_limit"
      ),
      transition(
        "time-limit-4",
        "session_workflow",
        "terminalize",
        "ending",
        "completed",
        4,
        5,
        true,
        "time_limit"
      ),
    ],
    expectedTerminal: { state: "completed", reason: "time_limit" },
  },
  {
    id: "invalid-terminal-reopen",
    description:
      "A terminal interview cannot be reopened by a delayed provider-ready signal.",
    initialState: "completed",
    initialVersion: 5,
    transitions: [
      {
        ...transition(
          "invalid-1",
          "provider_adapter",
          "runtime_ready",
          "completed",
          "active",
          5,
          5,
          true
        ),
        expectedDisposition: "rejected",
        expectedErrorCode: "invalid_transition",
      },
    ],
    expectedTerminal: { state: "completed", reason: "user_end" },
  },
  {
    id: "concurrent-terminal-claims",
    description:
      "The first valid ending claim wins; a stale concurrent claim reports conflict and cannot replace the stored outcome.",
    initialState: "active",
    initialVersion: 3,
    transitions: [
      transition(
        "race-user-end",
        "browser_intent",
        "end_requested",
        "active",
        "ending",
        3,
        4,
        true,
        "user_end"
      ),
      {
        ...transition(
          "race-provider-failure",
          "provider_adapter",
          "runtime_start_failed",
          "active",
          "ending",
          3,
          3,
          true,
          "provider_failure"
        ),
        expectedDisposition: "conflict",
        expectedErrorCode: "version_conflict",
      },
      transition(
        "race-finalize",
        "session_workflow",
        "terminalize",
        "ending",
        "completed",
        4,
        5,
        true,
        "user_end"
      ),
    ],
    expectedTerminal: { state: "completed", reason: "user_end" },
  },
] satisfies InterviewLifecycleScenarioFixture[];

export function createInterviewLifecycleScenarioFixtures(): InterviewLifecycleScenarioFixture[] {
  return structuredClone(lifecycleScenarios);
}

function transition(
  commandId: string,
  signalSource: LifecycleSignalSource,
  signal: LifecycleSignal,
  from: InterviewLifecycleState,
  to: InterviewLifecycleState,
  expectedVersionBefore: number,
  expectedVersionAfter: number,
  activated: boolean,
  terminalReason?: InterviewTerminalReason
): LifecycleTransitionFixture {
  return {
    commandId,
    transitionOwner: "session_workflow",
    signalSource,
    signal,
    from,
    to,
    occurredAt: "2026-07-09T20:00:00.000Z",
    expectedVersionBefore,
    expectedVersionAfter,
    activated,
    ...(terminalReason ? { terminalReason } : {}),
    expectedDisposition: "accepted",
  };
}
