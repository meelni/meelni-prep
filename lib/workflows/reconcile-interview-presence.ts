import {
  createInterviewRuntimeEvent,
  type InterviewRuntimeEvent,
} from "@meelni/agent";
import {
  createDrizzleInterviewReconnectStore,
  type InterviewReconnectSession,
  type InterviewReconnectStore,
} from "@/lib/db/session-reconnects";
import { createDrizzleInterviewRuntimeFailureStore } from "@/lib/db/interview-runtime-events";
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
import { convergeDrizzleInterviewCreditSettlement } from "@/lib/db/interview-credit-settlement";
import {
  ingestInterviewRuntimeEvent,
  type IngestInterviewRuntimeEventResult,
} from "./ingest-interview-runtime-event";

export const INTERVIEW_MISSING_RUNTIME_FAILURE_GRACE_MS = 60_000;

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
  failMissingRuntime(input: {
    requestSessionId: string;
    event: InterviewRuntimeEvent;
  }): Promise<IngestInterviewRuntimeEventResult>;
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
        | "agent_absent"
        | "failed"
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
      current.startContractVersion === 1 &&
      inspected.data.roomPresent === false &&
      missingRuntimeFailureIsDue(current, checkedAt)
    ) {
      const failed = await deps.failMissingRuntime({
        requestSessionId: current.sessionId,
        event: createInterviewRuntimeEvent({
          event_id: `presence-room-absent:${current.sessionId}:${current.version}:${checkedAt.getTime()}`,
          session_id: current.sessionId,
          type: "provider_failed",
          occurred_at: checkedAt.toISOString(),
          runtime_ref: { provider: "livekit", id: current.roomName },
          failure: {
            reason: "provider_failure",
            code: "voice_runtime_provider_failed",
            retryable: true,
          },
        }),
      });
      if (failed.ok) return { ok: true, disposition: "failed" };
      if (failed.reason === "not_found") {
        return { ok: false, disposition: "not_found" };
      }
      if (failed.reason === "session_closed") {
        return { ok: true, disposition: "terminal" };
      }
      return { ok: false, disposition: "stale_event" };
    }

    const activeInterviewer =
      inspected.data.targetSource === "participant"
        ? inspected.data.agent
        : null;
    if (
      !inspected.data.present ||
      !inspected.data.joined ||
      !activeInterviewer
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
        participantIdentity: activeInterviewer.identity,
        participantKind: 4,
        occurredAt: activeInterviewer.joinedAt ?? checkedAt,
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
      !hasActiveInterviewerPresence(inspected.data) ||
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
    return {
      ok: true,
      disposition: hasActiveInterviewerPresence(inspected.data)
        ? "present"
        : "agent_absent",
    };
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

function hasActiveInterviewerPresence(
  presence: InterviewParticipantPresence
): boolean {
  return presence.agent !== null && presence.targetSource === "participant";
}

function missingRuntimeFailureIsDue(
  session: InterviewReconnectSession,
  checkedAt: Date
): boolean {
  return (
    checkedAt.getTime() - session.lastTransitionAt.getTime() >=
    INTERVIEW_MISSING_RUNTIME_FAILURE_GRACE_MS
  );
}

export function createReconcileInterviewPresenceDeps(): ReconcileInterviewPresenceDeps {
  const store = createDrizzleInterviewReconnectStore();
  const runtimeFailureStore = createDrizzleInterviewRuntimeFailureStore();
  return {
    store,
    inspectPresence: inspectInterviewParticipantPresence,
    handleTransportEvent: (input) =>
      handleLiveKitInterviewEventWorkflow(input, {
        store,
        scheduleReconnect: scheduleInterviewReconnect,
        settleCredit: convergeDrizzleInterviewCreditSettlement,
      }),
    failMissingRuntime: (input) =>
      ingestInterviewRuntimeEvent({
        ...input,
        store: runtimeFailureStore,
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
