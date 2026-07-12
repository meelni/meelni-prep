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
export const INTERVIEW_ROOM_DEPARTURE_TIMEOUT_SECONDS = 60;

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
  expiresAt: Date;
  env: LiveKitEnvironment;
}

export interface IssuedInterviewParticipantToken {
  roomName: string;
  token: string;
  url: string;
}

export interface TerminateInterviewRoomInput {
  roomName: string;
  participantIdentity: string;
  revokedAt?: Date;
  env: LiveKitEnvironment;
}

export interface TerminatedInterviewRoom {
  roomName: string;
  disposition: "deleted" | "already_absent";
}

export interface InterviewParticipantPresence {
  present: boolean;
  joinedAt: Date | null;
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
  now?: () => Date;
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
    departureTimeout: number;
  }): Promise<unknown>;
  deleteRoom?(roomName: string): Promise<void>;
  removeParticipant?(
    roomName: string,
    identity: string,
    options?: { revokeTokenTs?: bigint }
  ): Promise<void>;
  listParticipants?(roomName: string): Promise<
    Array<{
      identity: string;
      state: number;
      joinedAtMs: bigint;
    }>
  >;
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
          departureTimeout: INTERVIEW_ROOM_DEPARTURE_TIMEOUT_SECONDS,
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
  {
    accessTokenFactory = AccessToken,
    now = () => new Date(),
  }: LiveKitProviderDependencies = {}
): Promise<ProviderResult<IssuedInterviewParticipantToken>> {
  try {
    const signingAtSeconds = Math.floor(now().getTime() / 1_000);
    const deadlineSeconds = Math.floor(input.expiresAt.getTime() / 1_000);
    const expirationSeconds = Math.min(
      deadlineSeconds,
      signingAtSeconds + input.ttlSeconds
    );
    if (
      !Number.isSafeInteger(deadlineSeconds) ||
      !Number.isSafeInteger(expirationSeconds) ||
      expirationSeconds <= signingAtSeconds
    ) {
      return invalidTokenExpiration();
    }
    const token = new accessTokenFactory(
      input.env.apiKey,
      input.env.apiSecret,
      {
        identity: input.identity,
        name: input.participantName,
        ttl: expirationSeconds - signingAtSeconds,
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

    const signedToken = await token.toJwt();
    const actualExpiration = readJwtExpiration(signedToken);
    if (
      actualExpiration === null ||
      actualExpiration > expirationSeconds ||
      actualExpiration <= Math.floor(now().getTime() / 1_000)
    ) {
      return invalidTokenExpiration();
    }

    return providerSuccess("livekit", {
      roomName: input.roomName,
      token: signedToken,
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

function readJwtExpiration(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { exp?: unknown };
    return Number.isSafeInteger(parsed.exp) ? (parsed.exp as number) : null;
  } catch {
    return null;
  }
}

function invalidTokenExpiration(): ProviderResult<IssuedInterviewParticipantToken> {
  return providerFailure("livekit", {
    code: "livekit_token_expiry_invalid",
    message: "The signed LiveKit token exceeded its authorization window.",
    retryable: true,
  });
}

export async function terminateInterviewRoom(
  input: TerminateInterviewRoomInput,
  {
    roomServiceClientFactory = (url, apiKey, apiSecret) =>
      new RoomServiceClient(url, apiKey, apiSecret),
    now = () => new Date(),
  }: LiveKitProviderDependencies = {}
): Promise<ProviderResult<TerminatedInterviewRoom>> {
  const roomClient = roomServiceClientFactory(
    input.env.url,
    input.env.apiKey,
    input.env.apiSecret
  );

  if (!roomClient.deleteRoom || !roomClient.removeParticipant) {
    return providerFailure("livekit", {
      code: "livekit_room_termination_unsupported",
      message: "The LiveKit room adapter cannot revoke and delete rooms.",
      retryable: false,
    });
  }

  const revokedAt = input.revokedAt ?? now();
  if (
    !input.participantIdentity.trim() ||
    !Number.isFinite(revokedAt.getTime())
  ) {
    return providerFailure("livekit", {
      code: "livekit_participant_revoke_invalid",
      message: "The LiveKit participant revocation input is invalid.",
      retryable: false,
    });
  }

  try {
    await roomClient.removeParticipant(
      input.roomName,
      input.participantIdentity,
      { revokeTokenTs: BigInt(Math.floor(revokedAt.getTime() / 1_000) + 1) }
    );
  } catch (error) {
    if (!isLiveKitNotFoundError(error)) {
      return providerFailure("livekit", {
        code: "livekit_participant_revoke_failed",
        message: getErrorMessage(error),
        retryable: true,
        cause: error,
      });
    }
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

export async function inspectInterviewParticipantPresence(
  input: {
    roomName: string;
    participantIdentity: string;
    env: LiveKitEnvironment;
  },
  {
    roomServiceClientFactory = (url, apiKey, apiSecret) =>
      new RoomServiceClient(url, apiKey, apiSecret),
  }: LiveKitProviderDependencies = {}
): Promise<ProviderResult<InterviewParticipantPresence>> {
  const roomClient = roomServiceClientFactory(
    input.env.url,
    input.env.apiKey,
    input.env.apiSecret
  );
  if (!roomClient.listParticipants) {
    return providerFailure("livekit", {
      code: "livekit_participant_presence_unsupported",
      message: "The LiveKit room adapter cannot inspect participant presence.",
      retryable: false,
    });
  }

  try {
    const participants = await roomClient.listParticipants(input.roomName);
    const participant = participants.find(
      (candidate) => candidate.identity === input.participantIdentity
    );
    const present = Boolean(participant && participant.state !== 3);
    const joinedAtMs = participant ? Number(participant.joinedAtMs) : 0;
    return providerSuccess("livekit", {
      present,
      joinedAt:
        present && Number.isSafeInteger(joinedAtMs) && joinedAtMs > 0
          ? new Date(joinedAtMs)
          : null,
    });
  } catch (error) {
    if (isLiveKitNotFoundError(error)) {
      return providerSuccess("livekit", { present: false, joinedAt: null });
    }
    return providerFailure("livekit", {
      code: "livekit_participant_presence_failed",
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
