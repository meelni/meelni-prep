import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";

import { findMissingRequiredEnv } from "./environment";
import {
  providerFailure,
  providerSuccess,
  type ProviderResult,
} from "./results";

export interface LiveKitEnvironment {
  apiKey: string;
  apiSecret: string;
  url: string;
}

export type LiveKitAgentKind = "interview" | "demo";

const INTERVIEW_PARTICIPANT_TOKEN_TTL_SECONDS = 5 * 60;

export interface StartInterviewRoomInput {
  agentName: string;
  identity: string;
  participantName: string;
  roomName: string;
  metadata: unknown;
  env: LiveKitEnvironment;
}

export interface StartedInterviewRoom {
  roomName: string;
  token: string;
  url: string;
}

export interface IssueInterviewParticipantTokenInput {
  identity: string;
  participantName: string;
  roomName: string;
  ttlSeconds: number;
  env: LiveKitEnvironment;
}

export interface IssuedInterviewParticipantToken {
  roomName: string;
  token: string;
  url: string;
}

export interface TerminateInterviewRoomInput {
  roomName: string;
  env: LiveKitEnvironment;
}

export interface TerminatedInterviewRoom {
  roomName: string;
  disposition: "deleted" | "already_absent";
}

export interface LiveKitInterviewProvider {
  startInterviewRoom(
    input: StartInterviewRoomInput
  ): Promise<ProviderResult<StartedInterviewRoom>>;
}

export interface LiveKitProviderDependencies {
  accessTokenFactory?: AccessTokenFactory;
  agentDispatchClientFactory?: AgentDispatchClientFactory;
  roomServiceClientFactory?: RoomServiceClientFactory;
}

interface AccessTokenLike {
  addGrant(grant: {
    room: string;
    roomJoin: boolean;
    canPublish: boolean;
    canPublishData: boolean;
    canPublishSources: TrackSource[];
    canSubscribe: boolean;
  }): void;
  toJwt(): Promise<string>;
}

type AccessTokenFactory = new (
  apiKey: string,
  apiSecret: string,
  options: { identity: string; name: string; ttl?: number }
) => AccessTokenLike;

interface AgentDispatchClientLike {
  createDispatch(roomName: string, agentName: string): Promise<unknown>;
}

type AgentDispatchClientFactory = (
  url: string,
  apiKey: string,
  apiSecret: string
) => AgentDispatchClientLike;

interface RoomServiceClientLike {
  createRoom(input: {
    name: string;
    metadata: string;
    emptyTimeout: number;
    maxParticipants: number;
  }): Promise<unknown>;
  deleteRoom?(roomName: string): Promise<void>;
}

type RoomServiceClientFactory = (
  url: string,
  apiKey: string,
  apiSecret: string
) => RoomServiceClientLike;

export function getLiveKitEnvironment(
  envSource: Record<string, string | undefined> = process.env
): ProviderResult<LiveKitEnvironment> {
  const missing = findMissingRequiredEnv("livekit", envSource);

  if (missing.length > 0) {
    return providerFailure("livekit", {
      code: "livekit_env_missing",
      message: `Missing LiveKit environment variables: ${missing.join(", ")}`,
      retryable: false,
    });
  }

  const url = envSource.NEXT_PUBLIC_LIVEKIT_URL || envSource.LIVEKIT_URL;

  return providerSuccess("livekit", {
    apiKey: envSource.LIVEKIT_API_KEY!,
    apiSecret: envSource.LIVEKIT_API_SECRET!,
    url: url!,
  });
}

export function getLiveKitAgentName(
  kind: LiveKitAgentKind,
  envSource: Record<string, string | undefined> = process.env
): ProviderResult<string> {
  const envName =
    kind === "interview"
      ? "LIVEKIT_INTERVIEW_AGENT_NAME"
      : "LIVEKIT_DEMO_AGENT_NAME";
  const value = envSource[envName];

  if (!value?.trim()) {
    return providerFailure("livekit", {
      code: "livekit_agent_name_missing",
      message: `Missing LiveKit ${kind} agent name: ${envName}`,
      retryable: false,
    });
  }

  return providerSuccess("livekit", value.trim());
}

export function buildInterviewRoomName({
  now = Date.now(),
  random = Math.random,
}: {
  now?: number;
  random?: () => number;
} = {}): string {
  const suffix = random().toString(36).slice(2, 8).padEnd(6, "0");
  return `interview-${now}-${suffix}`;
}

export function createLiveKitInterviewProvider({
  accessTokenFactory = AccessToken,
  agentDispatchClientFactory = (url, apiKey, apiSecret) =>
    new AgentDispatchClient(url, apiKey, apiSecret),
  roomServiceClientFactory = (url, apiKey, apiSecret) =>
    new RoomServiceClient(url, apiKey, apiSecret),
}: LiveKitProviderDependencies = {}): LiveKitInterviewProvider {
  return {
    async startInterviewRoom(input) {
      const roomClient = roomServiceClientFactory(
        input.env.url,
        input.env.apiKey,
        input.env.apiSecret
      );
      const dispatchClient = agentDispatchClientFactory(
        input.env.url,
        input.env.apiKey,
        input.env.apiSecret
      );

      try {
        await roomClient.createRoom({
          name: input.roomName,
          metadata: JSON.stringify(input.metadata),
          emptyTimeout: 3600,
          maxParticipants: 2,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        if (!message.includes("already exists")) {
          return providerFailure("livekit", {
            code: "livekit_room_create_failed",
            message,
            retryable: true,
            cause: error,
          });
        }
      }

      try {
        await dispatchClient.createDispatch(input.roomName, input.agentName);
      } catch (error) {
        return providerFailure("livekit", {
          code: "livekit_agent_dispatch_failed",
          message: getErrorMessage(error),
          retryable: true,
          cause: error,
        });
      }

      const token = new accessTokenFactory(
        input.env.apiKey,
        input.env.apiSecret,
        {
          identity: input.identity,
          name: input.participantName,
          ttl: INTERVIEW_PARTICIPANT_TOKEN_TTL_SECONDS,
        }
      );

      token.addGrant({
        room: input.roomName,
        roomJoin: true,
        canPublish: true,
        canPublishData: false,
        canPublishSources: [TrackSource.MICROPHONE],
        canSubscribe: true,
      });

      return providerSuccess("livekit", {
        roomName: input.roomName,
        token: await token.toJwt(),
        url: input.env.url,
      });
    },
  };
}

export async function issueInterviewParticipantToken(
  input: IssueInterviewParticipantTokenInput,
  { accessTokenFactory = AccessToken }: LiveKitProviderDependencies = {}
): Promise<ProviderResult<IssuedInterviewParticipantToken>> {
  try {
    const token = new accessTokenFactory(
      input.env.apiKey,
      input.env.apiSecret,
      {
        identity: input.identity,
        name: input.participantName,
        ttl: input.ttlSeconds,
      }
    );

    token.addGrant({
      room: input.roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: false,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
    });

    return providerSuccess("livekit", {
      roomName: input.roomName,
      token: await token.toJwt(),
      url: input.env.url,
    });
  } catch (error) {
    return providerFailure("livekit", {
      code: "livekit_token_issue_failed",
      message: getErrorMessage(error),
      retryable: true,
      cause: error,
    });
  }
}

export async function terminateInterviewRoom(
  input: TerminateInterviewRoomInput,
  {
    roomServiceClientFactory = (url, apiKey, apiSecret) =>
      new RoomServiceClient(url, apiKey, apiSecret),
  }: LiveKitProviderDependencies = {}
): Promise<ProviderResult<TerminatedInterviewRoom>> {
  const roomClient = roomServiceClientFactory(
    input.env.url,
    input.env.apiKey,
    input.env.apiSecret
  );

  if (!roomClient.deleteRoom) {
    return providerFailure("livekit", {
      code: "livekit_room_delete_unsupported",
      message: "The LiveKit room adapter cannot delete rooms.",
      retryable: false,
    });
  }

  try {
    await roomClient.deleteRoom(input.roomName);
    return providerSuccess("livekit", {
      roomName: input.roomName,
      disposition: "deleted",
    });
  } catch (error) {
    if (isLiveKitNotFoundError(error)) {
      return providerSuccess("livekit", {
        roomName: input.roomName,
        disposition: "already_absent",
      });
    }

    return providerFailure("livekit", {
      code: "livekit_room_delete_failed",
      message: getErrorMessage(error),
      retryable: true,
      cause: error,
    });
  }
}

function isLiveKitNotFoundError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const code = "code" in error ? String(error.code).toLowerCase() : "";
    const status = "status" in error ? Number(error.status) : undefined;
    if (code === "not_found" || status === 404) return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return message.includes("not found") || message.includes("does not exist");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
