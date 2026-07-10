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
export const PUBLIC_DEMO_DURATION_SECONDS = 2 * 60;
export const PUBLIC_DEMO_PARTICIPANT_TOKEN_TTL_SECONDS = 150;

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

export interface LiveKitInterviewProvider {
  startInterviewRoom(
    input: StartInterviewRoomInput
  ): Promise<ProviderResult<StartedInterviewRoom>>;
}

export interface StartPublicDemoRoomInput {
  agentName: string;
  identity: string;
  roomName: string;
  metadata: unknown;
  env: LiveKitEnvironment;
}

export interface IssuePublicDemoTokenInput {
  identity: string;
  roomName: string;
  env: LiveKitEnvironment;
}

export interface LiveKitPublicDemoProvider {
  startPublicDemoRoom(
    input: StartPublicDemoRoomInput
  ): Promise<ProviderResult<StartedInterviewRoom>>;
  issuePublicDemoToken(
    input: IssuePublicDemoTokenInput
  ): Promise<ProviderResult<StartedInterviewRoom>>;
  deletePublicDemoRoom(
    roomName: string,
    env: LiveKitEnvironment
  ): Promise<void>;
}

export interface LiveKitProviderDependencies {
  accessTokenFactory?: AccessTokenFactory;
  agentDispatchClientFactory?: AgentDispatchClientFactory;
  roomServiceClientFactory?: RoomServiceClientFactory;
  sleep?: (milliseconds: number) => Promise<void>;
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
    departureTimeout?: number;
    maxParticipants: number;
  }): Promise<unknown>;
  deleteRoom?(roomName: string): Promise<void>;
  listParticipants?(
    roomName: string
  ): Promise<Array<{ identity?: string; kind?: number }>>;
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

export function createLiveKitPublicDemoProvider({
  accessTokenFactory = AccessToken,
  agentDispatchClientFactory = (url, apiKey, apiSecret) =>
    new AgentDispatchClient(url, apiKey, apiSecret),
  roomServiceClientFactory = (url, apiKey, apiSecret) =>
    new RoomServiceClient(url, apiKey, apiSecret),
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: LiveKitProviderDependencies = {}): LiveKitPublicDemoProvider {
  async function mintToken(
    input: IssuePublicDemoTokenInput
  ): Promise<ProviderResult<StartedInterviewRoom>> {
    try {
      const token = new accessTokenFactory(
        input.env.apiKey,
        input.env.apiSecret,
        {
          identity: input.identity,
          name: "Demo participant",
          ttl: PUBLIC_DEMO_PARTICIPANT_TOKEN_TTL_SECONDS,
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
        code: "livekit_demo_token_issue_failed",
        message: getErrorMessage(error),
        retryable: true,
        cause: error,
      });
    }
  }

  async function deleteRoom(
    roomName: string,
    env: LiveKitEnvironment
  ): Promise<void> {
    const roomClient = roomServiceClientFactory(
      env.url,
      env.apiKey,
      env.apiSecret
    );
    if (!roomClient.deleteRoom) {
      throw new Error("LiveKit room deletion is unavailable");
    }
    await roomClient.deleteRoom(roomName);
  }

  return {
    async startPublicDemoRoom(input) {
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
      let roomCreated = false;

      try {
        await roomClient.createRoom({
          name: input.roomName,
          metadata: JSON.stringify(input.metadata),
          emptyTimeout: 30,
          departureTimeout: 5,
          maxParticipants: 2,
        });
        roomCreated = true;
        await dispatchClient.createDispatch(input.roomName, input.agentName);

        const token = await mintToken(input);
        if (!token.ok) throw token.error;
        return token;
      } catch (error) {
        if (roomCreated && roomClient.deleteRoom) {
          try {
            await roomClient.deleteRoom(input.roomName);
          } catch {
            return providerFailure("livekit", {
              code: "livekit_demo_cleanup_failed",
              message: "Demo provider cleanup failed.",
              retryable: true,
              cause: error,
            });
          }
        }
        return providerFailure("livekit", {
          code: "livekit_demo_start_failed",
          message: getErrorMessage(error),
          retryable: true,
          cause: error,
        });
      }
    },
    async issuePublicDemoToken(input) {
      const roomClient = roomServiceClientFactory(
        input.env.url,
        input.env.apiKey,
        input.env.apiSecret
      );
      if (!roomClient.listParticipants) {
        return providerFailure("livekit", {
          code: "livekit_demo_room_verify_failed",
          message: "Demo room verification is unavailable.",
          retryable: true,
        });
      }

      try {
        let participants = await roomClient.listParticipants(input.roomName);
        let hasRemoteAgent = hasRemoteAgentParticipant(
          participants,
          input.identity
        );
        if (!hasRemoteAgent) {
          await sleep(1_000);
          participants = await roomClient.listParticipants(input.roomName);
          hasRemoteAgent = hasRemoteAgentParticipant(
            participants,
            input.identity
          );
        }
        if (!hasRemoteAgent) {
          return providerFailure("livekit", {
            code: "livekit_demo_room_not_ready",
            message: "The existing demo room has no remote agent participant.",
            retryable: true,
          });
        }
      } catch (error) {
        return providerFailure("livekit", {
          code: "livekit_demo_room_verify_failed",
          message: getErrorMessage(error),
          retryable: true,
          cause: error,
        });
      }

      return mintToken(input);
    },
    deletePublicDemoRoom: deleteRoom,
  };
}

function hasRemoteAgentParticipant(
  participants: Array<{ identity?: string; kind?: number }>,
  localIdentity: string
): boolean {
  return participants.some(
    (participant) =>
      participant.kind === 4 || participant.identity !== localIdentity
  );
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
