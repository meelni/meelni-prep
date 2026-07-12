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
  handleTransportLoss(input: {
    eventId: string;
    roomName: string;
    participantIdentity: string;
    occurredAt: Date;
  }): Promise<HandleLiveKitInterviewEventResult>;
  now(): Date;
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
  if (current.state !== "active" && current.state !== "reconnecting") {
    return { ok: true, disposition: "terminal" };
  }

  const checkedAt = deps.now();
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

  if (current.state === "reconnecting") {
    if (!inspected.data.present) {
      return { ok: true, disposition: "reconnecting" };
    }
    if (!current.reconnectDeadlineAt) {
      return { ok: false, disposition: "stale_event" };
    }
    const recovered = await deps.store.recoverFromPresence({
      sessionId: current.sessionId,
      expectedVersion: current.version,
      deadlineAt: current.reconnectDeadlineAt,
      transitionedAt: checkedAt,
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

  const loss = await deps.handleTransportLoss({
    eventId: `presence:${current.sessionId}:${input.deliveryId}`,
    roomName: current.roomName,
    participantIdentity: current.userId,
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
    handleTransportLoss: (input) =>
      handleLiveKitInterviewEventWorkflow(
        {
          ...input,
          eventName: "participant_left",
          participantKind: 0,
        },
        {
          store,
          scheduleReconnect: scheduleInterviewReconnect,
          now: () => new Date(),
        }
      ),
    now: () => new Date(),
  };
}
