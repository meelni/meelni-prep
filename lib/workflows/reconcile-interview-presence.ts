import {
  createDrizzleInterviewReconnectStore,
  type InterviewReconnectStore,
} from "@/lib/db/session-reconnects";
import {
  inspectInterviewParticipantPresence,
  type InterviewParticipantPresence,
  type LiveKitEnvironment,
  type ProviderResult,
} from "@/lib/internal/integrations";
import {
  handleLiveKitInterviewEventWorkflow,
  type HandleLiveKitInterviewEventResult,
} from "./handle-livekit-interview-event";
import { scheduleInterviewReconnect } from "./schedule-interview-reconnect";

export interface ReconcileInterviewPresenceInput {
  sessionId: string;
  deliveryId: string;
  env: LiveKitEnvironment;
}

export interface ReconcileInterviewPresenceDeps {
  store: InterviewReconnectStore;
  inspectPresence(input: {
    roomName: string;
    participantIdentity: string;
    env: LiveKitEnvironment;
  }): Promise<ProviderResult<InterviewParticipantPresence>>;
  handleTransportEvent(input: {
    eventId: string;
    eventName: "participant_joined" | "participant_left";
    roomName: string;
    participantIdentity: string;
    participantKind: number;
    occurredAt: Date;
  }): Promise<HandleLiveKitInterviewEventResult>;
}

export type ReconcileInterviewPresenceResult =
  | {
      ok: false;
      disposition: "invalid_event" | "not_found" | "stale_event";
    }
  | {
      ok: true;
      disposition:
        | "present"
        | "connecting"
        | "activated"
        | "absence_observed"
        | "reconnecting"
        | "recovered"
        | "terminal";
    };

export async function reconcileInterviewPresenceWorkflow(
  input: ReconcileInterviewPresenceInput,
  deps: ReconcileInterviewPresenceDeps = createReconcileInterviewPresenceDeps()
): Promise<ReconcileInterviewPresenceResult> {
  if (!input.sessionId || !input.deliveryId) {
    return { ok: false, disposition: "invalid_event" };
  }

  const current = await deps.store.getById(input.sessionId);
  if (!current) return { ok: false, disposition: "not_found" };
  if (
    current.state !== "connecting" &&
    current.state !== "active" &&
    current.state !== "reconnecting"
  ) {
    return { ok: true, disposition: "terminal" };
  }

  const checkedAt = await deps.store.getDatabaseTime();
  const marked = await deps.store.markPresenceReconciled({
    sessionId: current.sessionId,
    expectedVersion: current.version,
    checkedAt,
  });
  if (!marked.applied) {
    return {
      ok: false,
      disposition: marked.reason === "not_found" ? "not_found" : "stale_event",
    };
  }

  const inspected = await deps.inspectPresence({
    roomName: current.roomName,
    participantIdentity: current.userId,
    env: input.env,
  });
  if (!inspected.ok) {
    throw Object.assign(new Error("LiveKit presence inspection failed"), {
      code: inspected.error.code,
    });
  }

  if (current.state === "connecting") {
    if (
      !inspected.data.present ||
      !inspected.data.joined ||
      !inspected.data.agent
    ) {
      return { ok: true, disposition: "connecting" };
    }

    if (
      current.runtimeReadyAt === null &&
      current.lastTransportEventName !== "participant_joined"
    ) {
      const candidate = await deps.handleTransportEvent({
        eventId: `presence:candidate:${current.sessionId}:${input.deliveryId}`,
        eventName: "participant_joined",
        roomName: current.roomName,
        participantIdentity: current.userId,
        participantKind: 0,
        occurredAt: inspected.data.joinedAt ?? checkedAt,
      });
      if (!candidate.ok) return failedTransportReconciliation(candidate);
    }

    if (current.runtimeReadyAt === null) {
      const agent = await deps.handleTransportEvent({
        eventId: `presence:agent:${current.sessionId}:${input.deliveryId}`,
        eventName: "participant_joined",
        roomName: current.roomName,
        participantIdentity: inspected.data.agent.identity,
        participantKind: 4,
        occurredAt: inspected.data.agent.joinedAt ?? checkedAt,
      });
      if (!agent.ok) return failedTransportReconciliation(agent);
    } else {
      const candidate = await deps.handleTransportEvent({
        eventId: `presence:candidate:${current.sessionId}:${input.deliveryId}`,
        eventName: "participant_joined",
        roomName: current.roomName,
        participantIdentity: current.userId,
        participantKind: 0,
        occurredAt: inspected.data.joinedAt ?? checkedAt,
      });
      if (!candidate.ok) return failedTransportReconciliation(candidate);
    }

    const reconciled = await deps.store.getById(current.sessionId);
    if (!reconciled) return { ok: false, disposition: "not_found" };
    return {
      ok: true,
      disposition: reconciled.state === "active" ? "activated" : "connecting",
    };
  }

  if (current.state === "reconnecting") {
    const recoveryObservedAt = await deps.store.getDatabaseTime();
    if (
      !inspected.data.present ||
      !inspected.data.joined ||
      !inspected.data.joinedAt ||
      !Number.isFinite(inspected.data.joinedAt.getTime()) ||
      !current.reconnectDeadlineAt ||
      recoveryObservedAt.getTime() >= current.reconnectDeadlineAt.getTime()
    ) {
      return { ok: true, disposition: "reconnecting" };
    }
    if (
      inspected.data.joinedAt.getTime() >= current.reconnectDeadlineAt.getTime()
    ) {
      return { ok: true, disposition: "reconnecting" };
    }
    const recovered = await deps.store.recoverFromPresence({
      sessionId: current.sessionId,
      expectedVersion: current.version,
      deadlineAt: current.reconnectDeadlineAt,
      joinedAt: inspected.data.joinedAt,
      transitionedAt: recoveryObservedAt,
    });
    if (!recovered.applied) {
      return {
        ok: false,
        disposition:
          recovered.reason === "not_found" ? "not_found" : "stale_event",
      };
    }
    return { ok: true, disposition: "recovered" };
  }

  if (inspected.data.present) {
    return { ok: true, disposition: "present" };
  }

  const loss = await deps.handleTransportEvent({
    eventId: `presence:${current.sessionId}:${input.deliveryId}`,
    eventName: "participant_left",
    roomName: current.roomName,
    participantIdentity: current.userId,
    participantKind: 0,
    occurredAt: checkedAt,
  });
  if (!loss.ok) {
    return {
      ok: false,
      disposition:
        loss.disposition === "not_found" ? "not_found" : "stale_event",
    };
  }
  return { ok: true, disposition: "absence_observed" };
}

export function createReconcileInterviewPresenceDeps(): ReconcileInterviewPresenceDeps {
  const store = createDrizzleInterviewReconnectStore();
  return {
    store,
    inspectPresence: inspectInterviewParticipantPresence,
    handleTransportEvent: (input) =>
      handleLiveKitInterviewEventWorkflow(input, {
        store,
        scheduleReconnect: scheduleInterviewReconnect,
      }),
  };
}

function failedTransportReconciliation(
  result: Extract<HandleLiveKitInterviewEventResult, { ok: false }>
): ReconcileInterviewPresenceResult {
  return {
    ok: false,
    disposition:
      result.disposition === "not_found" ? "not_found" : "stale_event",
  };
}
