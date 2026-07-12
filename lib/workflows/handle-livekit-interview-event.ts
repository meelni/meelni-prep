import {
  deriveInterviewDeadlineAt,
  deriveInterviewReconnectDeadline,
  normalizeInterviewDurationMinutes,
} from "@/lib/internal/core";
import {
  compareInterviewTransportEvents,
  createDrizzleInterviewReconnectStore,
  type InterviewTransportEventName,
  type InterviewReconnectSession,
  type InterviewReconnectStore,
} from "@/lib/db/session-reconnects";
import { scheduleInterviewReconnect } from "./schedule-interview-reconnect";

export type LiveKitInterviewTransportEventName = InterviewTransportEventName;

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
  if (!current.startedAt) {
    // Deadline recovery owns quarantine for malformed legacy sessions. Do not
    // let provider presence mutate or activate a row without canonical timing.
    return { ok: false, disposition: "conflict", lifecycle: current };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!current.startedAt) {
      return { ok: false, disposition: "conflict", lifecycle: current };
    }
    const isCandidate = input.participantIdentity === current.userId;
    const canCompleteInitialActivation =
      isCandidate &&
      input.eventName === "participant_joined" &&
      current.state === "connecting" &&
      current.runtimeReadyAt !== null;
    const replaysStoredCandidateEvent =
      isCandidate && current.lastTransportEventId === input.eventId;
    if (replaysStoredCandidateEvent) {
      if (!storedTransportEventMatchesInput(current, input)) {
        return { ok: false, disposition: "conflict", lifecycle: current };
      }
      if (canCompleteInitialActivation) {
        // Candidate presence may be stored before runtime readiness. The exact
        // replay is still allowed to complete that two-signal activation.
      } else {
        await reschedulePersistedReconnect(current, deps);
        return { ok: true, disposition: "duplicate", lifecycle: current };
      }
    }
    if (
      isCandidate &&
      !(replaysStoredCandidateEvent && canCompleteInitialActivation) &&
      compareInterviewTransportEvents(
        {
          occurredAt: input.occurredAt,
          eventId: input.eventId,
          eventName: input.eventName,
        },
        {
          occurredAt: current.lastTransportEventAt,
          eventId: current.lastTransportEventId,
          eventName: current.lastTransportEventName,
        }
      ) <= 0
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
      recordTransportEvent: isCandidate && !replaysStoredCandidateEvent,
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

function storedTransportEventMatchesInput(
  current: InterviewReconnectSession,
  input: HandleLiveKitInterviewEventInput
): boolean {
  return (
    current.lastTransportEventAt?.getTime() === input.occurredAt.getTime() &&
    current.lastTransportEventName === input.eventName
  );
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
  if (!current.startedAt) return null;

  const isCandidate = input.participantIdentity === current.userId;
  const config = isRecord(current.config) ? current.config : {};
  const hardDeadlineAt = deriveInterviewDeadlineAt({
    startedAt: current.startedAt,
    durationMinutes: normalizeInterviewDurationMinutes(config.duration),
  });

  if (
    now.getTime() >= hardDeadlineAt.getTime() ||
    input.occurredAt.getTime() >= hardDeadlineAt.getTime()
  ) {
    return null;
  }

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
        !current.reconnectDeadlineAt ||
        now.getTime() >= current.reconnectDeadlineAt.getTime() ||
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
