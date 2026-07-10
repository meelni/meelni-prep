import { WebhookReceiver } from "livekit-server-sdk";

import type { LiveKitEnvironment } from "./livekit";
import {
  providerFailure,
  providerSuccess,
  type ProviderResult,
} from "./results";

export type LiveKitParticipantEventName =
  | "participant_joined"
  | "participant_left"
  | "participant_connection_aborted";

export interface NormalizedLiveKitParticipantEvent {
  eventId: string;
  eventName: LiveKitParticipantEventName;
  roomName: string;
  participantIdentity: string;
  participantKind: number;
  occurredAt: Date;
}

interface WebhookReceiverLike {
  receive(
    body: string,
    authorization?: string
  ): Promise<{
    id: string;
    event: string;
    createdAt: bigint;
    room?: { name: string };
    participant?: { identity: string; joinedAtMs: bigint; kind: number };
  }>;
}

export async function receiveLiveKitParticipantWebhook(
  input: {
    body: string;
    authorization: string | null;
    env: LiveKitEnvironment;
  },
  receiver: WebhookReceiverLike = new WebhookReceiver(
    input.env.apiKey,
    input.env.apiSecret
  )
): Promise<ProviderResult<NormalizedLiveKitParticipantEvent | null>> {
  try {
    const event = await receiver.receive(
      input.body,
      input.authorization ?? undefined
    );
    if (!isParticipantEventName(event.event)) {
      return providerSuccess("livekit", null);
    }

    const roomName = event.room?.name.trim() ?? "";
    const participantIdentity = event.participant?.identity.trim() ?? "";
    if (!event.id || !roomName || !participantIdentity) {
      return providerFailure("livekit", {
        code: "livekit_webhook_invalid",
        message: "LiveKit participant webhook is missing correlation fields.",
        retryable: false,
      });
    }

    const joinedAtMs = event.participant?.joinedAtMs ?? BigInt(0);
    const eventCreatedAtMs = Number(event.createdAt) * 1000;
    const participantJoinedAtMs = Number(joinedAtMs);
    const occurredAtMs =
      event.event === "participant_joined" && joinedAtMs > BigInt(0)
        ? participantJoinedAtMs
        : Math.max(
            eventCreatedAtMs,
            joinedAtMs > BigInt(0)
              ? participantJoinedAtMs + 1
              : eventCreatedAtMs
          );
    const occurredAt = new Date(occurredAtMs);
    if (Number.isNaN(occurredAt.getTime())) {
      return providerFailure("livekit", {
        code: "livekit_webhook_invalid",
        message: "LiveKit participant webhook has an invalid timestamp.",
        retryable: false,
      });
    }

    return providerSuccess("livekit", {
      eventId: event.id,
      eventName: event.event,
      roomName,
      participantIdentity,
      participantKind: event.participant?.kind ?? -1,
      occurredAt,
    });
  } catch (error) {
    return providerFailure("livekit", {
      code: "livekit_webhook_signature_invalid",
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
      cause: error,
    });
  }
}

function isParticipantEventName(
  value: string
): value is LiveKitParticipantEventName {
  return (
    value === "participant_joined" ||
    value === "participant_left" ||
    value === "participant_connection_aborted"
  );
}
