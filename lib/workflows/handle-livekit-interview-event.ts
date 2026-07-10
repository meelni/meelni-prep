import {
  deriveInterviewDeadlineAt,
  deriveInterviewReconnectDeadline,
  normalizeInterviewDurationMinutes,
} from "@/lib/internal/core";
import {
  createDrizzleInterviewReconnectStore,
  type InterviewReconnectSession,
  type InterviewReconnectStore,
} from "@/lib/db/session-reconnects";
import { scheduleInterviewReconnect } from "./schedule-interview-reconnect";

export type LiveKitInterviewTransportEventName =
  | "participant_joined"
  | "participant_left"
  | "participant_connection_aborted";

export interface HandleLiveKitInterviewEventInput {
  eventId: string;
  eventName: LiveKitInterviewTransportEventName;
  roomName: string;
  participantIdentity: string;
  participantKind: number;
  occurredAt: Date;
}

export interface HandleLiveKitInterviewEventDeps {
  store: InterviewReconnectStore;
  scheduleReconnect(input: {
    sessionId: string;
    expectedVersion: number;
    deadlineAt: Date;
  }): Promise<unknown>;
  now(): Date;
}

export type HandleLiveKitInterviewEventResult =
  | {
      ok: true;
      disposition:
        | "activated"
        | "reconnecting"
        | "recovered"
        | "duplicate"
        | "ignored";
      lifecycle: InterviewReconnectSession | null;
    }
  | {
      ok: false;
      disposition: "invalid_event" | "not_found" | "conflict";
      lifecycle: InterviewReconnectSession | null;
    };

export async function handleLiveKitInterviewEventWorkflow(
  input: HandleLiveKitInterviewEventInput,
  deps: HandleLiveKitInterviewEventDeps = createHandleLiveKitInterviewEventDeps()
): Promise<HandleLiveKitInterviewEventResult> {
  if (
    !input.eventId ||
    !input.roomName ||
    !input.participantIdentity ||
    Number.isNaN(input.occurredAt.getTime())
  ) {
    return { ok: false, disposition: "invalid_event", lifecycle: null };
  }

  let current = await deps.store.getByRoom(input.roomName);
  if (!current) {
    return { ok: false, disposition: "not_found", lifecycle: null };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const isCandidate = input.participantIdentity === current.userId;
    const canCompleteInitialActivation =
      isCandidate &&
      input.eventName === "participant_joined" &&
      current.state === "connecting" &&
      current.runtimeReadyAt !== null;
    if (
      isCandidate &&
      current.lastTransportEventId === input.eventId &&
      !canCompleteInitialActivation
    ) {
      await reschedulePersistedReconnect(current, deps);
      return { ok: true, disposition: "duplicate", lifecycle: current };
    }
    if (
      isCandidate &&
      current.lastTransportEventAt &&
      input.occurredAt.getTime() < current.lastTransportEventAt.getTime()
    ) {
      return { ok: true, disposition: "ignored", lifecycle: current };
    }

    const desired = deriveDesiredTransition(input, current, deps.now());
    if (!desired) {
      if (isCandidate) {
        const observation = await deps.store.recordTransportObservation({
          sessionId: current.sessionId,
          expectedState: current.state,
          expectedVersion: current.version,
          transportEventAt: input.occurredAt,
          transportEventId: input.eventId,
          transportEventName: input.eventName,
        });
        if (!observation.applied) {
          if (observation.reason === "not_found" || !observation.current) {
            return { ok: false, disposition: "not_found", lifecycle: null };
          }
          current = observation.current;
          continue;
        }
        current = observation.current;
        if (canActivateFromCandidateJoin(input, current)) continue;
      } else if (
        isAgentReadySignal(input) &&
        current.state === "connecting" &&
        current.runtimeReadyAt === null
      ) {
        const observation = await deps.store.recordRuntimeReady({
          sessionId: current.sessionId,
          expectedState: "connecting",
          expectedVersion: current.version,
          runtimeReadyAt: deps.now(),
        });
        if (!observation.applied) {
          if (observation.reason === "not_found" || !observation.current) {
            return { ok: false, disposition: "not_found", lifecycle: null };
          }
          current = observation.current;
          continue;
        }
        current = observation.current;
        if (current.lastTransportEventName === "participant_joined") continue;
      }
      return { ok: true, disposition: "ignored", lifecycle: current };
    }

    const result = await deps.store.applyTransportTransition({
      sessionId: current.sessionId,
      expectedState: current.state as "connecting" | "active" | "reconnecting",
      expectedVersion: current.version,
      nextState: desired.nextState,
      reconnectDeadlineAt: desired.reconnectDeadlineAt,
      transportEventAt: input.occurredAt,
      transportEventId: input.eventId,
      transportEventName: input.eventName,
      recordTransportEvent: isCandidate,
      runtimeReadyAt: desired.runtimeReadyAt,
      transitionedAt: desired.transitionedAt,
    });

    if (result.applied) {
      await reschedulePersistedReconnect(result.current, deps);
      return {
        ok: true,
        disposition: desired.disposition,
        lifecycle: result.current,
      };
    }
    if (result.reason === "not_found" || !result.current) {
      return { ok: false, disposition: "not_found", lifecycle: null };
    }
    current = result.current;
  }

  return { ok: false, disposition: "conflict", lifecycle: current };
}

function deriveDesiredTransition(
  input: HandleLiveKitInterviewEventInput,
  current: InterviewReconnectSession,
  now: Date
): {
  nextState: "active" | "reconnecting";
  reconnectDeadlineAt: Date | null;
  transitionedAt: Date;
  disposition: "activated" | "reconnecting" | "recovered";
  runtimeReadyAt?: Date;
} | null {
  const isCandidate = input.participantIdentity === current.userId;

  if (input.eventName === "participant_joined") {
    if (
      isAgentReadySignal(input) &&
      current.state === "connecting" &&
      current.lastTransportEventName === "participant_joined"
    ) {
      return {
        nextState: "active",
        reconnectDeadlineAt: null,
        transitionedAt: now,
        disposition: "activated",
        runtimeReadyAt: now,
      };
    }
    if (
      isCandidate &&
      current.state === "connecting" &&
      current.runtimeReadyAt !== null
    ) {
      return {
        nextState: "active",
        reconnectDeadlineAt: null,
        transitionedAt: now,
        disposition: "activated",
      };
    }
    if (isCandidate && current.state === "reconnecting") {
      if (
        current.reconnectDeadlineAt &&
        input.occurredAt.getTime() >= current.reconnectDeadlineAt.getTime()
      ) {
        return null;
      }
      return {
        nextState: "active",
        reconnectDeadlineAt: null,
        transitionedAt: now,
        disposition: "recovered",
      };
    }
    return null;
  }

  if (!isCandidate || current.state !== "active") return null;

  const config = isRecord(current.config) ? current.config : {};
  const hardDeadlineAt = deriveInterviewDeadlineAt({
    startedAt: current.startedAt,
    durationMinutes: normalizeInterviewDurationMinutes(config.duration),
  });
  const reconnect = deriveInterviewReconnectDeadline({
    disconnectedAt: now,
    hardDeadlineAt,
  });

  return {
    nextState: "reconnecting",
    reconnectDeadlineAt: reconnect.deadlineAt,
    transitionedAt: now,
    disposition: "reconnecting",
  };
}

function isAgentReadySignal(input: HandleLiveKitInterviewEventInput): boolean {
  return (
    input.eventName === "participant_joined" && input.participantKind === 4
  );
}

function canActivateFromCandidateJoin(
  input: HandleLiveKitInterviewEventInput,
  current: InterviewReconnectSession
): boolean {
  return (
    input.eventName === "participant_joined" &&
    input.participantIdentity === current.userId &&
    current.state === "connecting" &&
    current.runtimeReadyAt !== null
  );
}

async function reschedulePersistedReconnect(
  current: InterviewReconnectSession,
  deps: HandleLiveKitInterviewEventDeps
): Promise<void> {
  if (current.state !== "reconnecting" || !current.reconnectDeadlineAt) return;
  await deps.scheduleReconnect({
    sessionId: current.sessionId,
    expectedVersion: current.version,
    deadlineAt: current.reconnectDeadlineAt,
  });
}

export function createHandleLiveKitInterviewEventDeps(): HandleLiveKitInterviewEventDeps {
  return {
    store: createDrizzleInterviewReconnectStore(),
    scheduleReconnect: scheduleInterviewReconnect,
    now: () => new Date(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
