import {
  AccessToken,
  AgentDispatchClient,
  DataPacket_Kind,
  RoomAgentDispatch,
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

export const INTERVIEW_ROOM_DEPARTURE_TIMEOUT_SECONDS = 60;
const INTERVIEW_PARTICIPANT_TOKEN_TTL_SECONDS = 5 * 60;
const INTERVIEW_PRESENCE_REQUEST_TIMEOUT_SECONDS = 2;
export const PUBLIC_DEMO_DURATION_SECONDS = 2 * 60;
export const PUBLIC_DEMO_TOKEN_DELIVERY_MARGIN_SECONDS = 5;

export interface StartInterviewRoomInput {
  agentName: string;
  identity: string;
  participantName: string;
  roomName: string;
  metadata: unknown;
  env: LiveKitEnvironment;
  onStage?(event: LiveKitInterviewStartStageEvent): void;
}

export type LiveKitInterviewStartStage =
  | "room_create"
  | "room_verification"
  | "dispatch_verification";

export interface LiveKitInterviewStartStageEvent {
  stage: LiveKitInterviewStartStage;
  outcome: "succeeded" | "terminal" | "failed";
  durationMs: number;
}

export interface StartedInterviewRoom {
  roomName: string;
  token: string;
  url: string;
}

export interface StartedPublicDemoRoom extends StartedInterviewRoom {
  expiresAt: Date;
}

export interface StartPublicDemoRoomInput {
  agentName: string;
  identity: string;
  roomName: string;
  metadata: unknown;
  observedAt: Date;
  expiresAt: Date;
  env: LiveKitEnvironment;
}

export interface IssuePublicDemoTokenInput {
  agentName: string;
  identity: string;
  roomName: string;
  observedAt: Date;
  expiresAt: Date;
  env: LiveKitEnvironment;
}

export interface IssueInterviewParticipantTokenInput {
  identity: string;
  participantName: string;
  roomName: string;
  ttlSeconds: number;
  observedAt: Date;
  expiresAt: Date;
  env: LiveKitEnvironment;
}

export interface IssuedInterviewParticipantToken {
  roomName: string;
  token: string;
  url: string;
  expiresAt: Date;
}

export interface TerminateInterviewRoomInput {
  roomName: string;
  participantIdentity: string;
  env: LiveKitEnvironment;
}

export interface TerminatedInterviewRoom {
  roomName: string;
  disposition: "deleted" | "already_absent";
}

export interface SentInterviewRoomData {
  roomName: string;
  destinationIdentity: string;
  topic: string;
}

export interface InterviewParticipantPresence {
  present: boolean;
  joined: boolean;
  joinedAt: Date | null;
  agent: { identity: string; joinedAt: Date | null } | null;
}

export interface LiveKitInterviewProvider {
  startInterviewRoom(
    input: StartInterviewRoomInput
  ): Promise<ProviderResult<StartedInterviewRoom>>;
}

export interface LiveKitRoomTerminationProvider {
  terminateInterviewRoom(
    input: TerminateInterviewRoomInput
  ): Promise<ProviderResult<TerminatedInterviewRoom>>;
}

export interface LiveKitPublicDemoProvider {
  startPublicDemoRoom(
    input: StartPublicDemoRoomInput
  ): Promise<ProviderResult<StartedPublicDemoRoom>>;
  issuePublicDemoToken(
    input: IssuePublicDemoTokenInput
  ): Promise<ProviderResult<StartedPublicDemoRoom>>;
  deletePublicDemoRoom(
    roomName: string,
    env: LiveKitEnvironment
  ): Promise<void>;
}

export interface LiveKitProvider
  extends LiveKitInterviewProvider,
    LiveKitRoomTerminationProvider {}

export interface LiveKitProviderDependencies {
  accessTokenFactory?: AccessTokenFactory;
  agentDispatchClientFactory?: AgentDispatchClientFactory;
  roomServiceClientFactory?: RoomServiceClientFactory;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  monotonicNow?: () => number;
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
  createDispatch(
    roomName: string,
    agentName: string
  ): Promise<AgentDispatchLike>;
  listDispatch(roomName: string): Promise<AgentDispatchLike[]>;
}

interface AgentDispatchLike {
  id: string;
  agentName: string;
  room: string;
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
    agents?: RoomAgentDispatch[];
  }): Promise<unknown>;
  listRooms?(
    names?: string[]
  ): Promise<Array<{ name: string; metadata: string }>>;
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
      kind: number;
    }>
  >;
  sendData?(
    roomName: string,
    data: Uint8Array,
    kind: DataPacket_Kind,
    options: { destinationIdentities?: string[]; topic?: string }
  ): Promise<void>;
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
  now = () => new Date(),
  monotonicNow = () => performance.now(),
}: LiveKitProviderDependencies = {}): LiveKitProvider {
  return {
    async startInterviewRoom(input) {
      let signedToken: string;
      try {
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
        signedToken = await token.toJwt();
      } catch (error) {
        return providerFailure("livekit", {
          code: "livekit_token_issue_failed",
          message: getErrorMessage(error),
          retryable: true,
          cause: error,
        });
      }

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

      const roomCreateStartedAt = monotonicNow();
      try {
        await roomClient.createRoom({
          name: input.roomName,
          metadata: JSON.stringify(input.metadata),
          emptyTimeout: 3600,
          maxParticipants: 2,
          departureTimeout: INTERVIEW_ROOM_DEPARTURE_TIMEOUT_SECONDS,
          agents: [
            new RoomAgentDispatch({
              agentName: input.agentName,
            }),
          ],
        });
      } catch (error) {
        const message = getErrorMessage(error);
        if (!message.includes("already exists")) {
          input.onStage?.({
            stage: "room_create",
            outcome: "failed",
            durationMs: monotonicNow() - roomCreateStartedAt,
          });
          return providerFailure("livekit", {
            code: "livekit_room_create_failed",
            message,
            retryable: true,
            cause: error,
          });
        }
      }
      input.onStage?.({
        stage: "room_create",
        outcome: "succeeded",
        durationMs: monotonicNow() - roomCreateStartedAt,
      });

      const roomVerificationStartedAt = monotonicNow();
      if (!roomClient.listRooms) {
        input.onStage?.({
          stage: "room_verification",
          outcome: "terminal",
          durationMs: monotonicNow() - roomVerificationStartedAt,
        });
        return providerFailure("livekit", {
          code: "livekit_room_reconcile_unsupported",
          message: "The LiveKit room adapter cannot reconcile room metadata.",
          retryable: false,
        });
      }
      try {
        const rooms = await roomClient.listRooms([input.roomName]);
        const expectedMetadata = JSON.stringify(input.metadata);
        if (
          rooms.length !== 1 ||
          rooms[0].name !== input.roomName ||
          rooms[0].metadata !== expectedMetadata
        ) {
          input.onStage?.({
            stage: "room_verification",
            outcome: "terminal",
            durationMs: monotonicNow() - roomVerificationStartedAt,
          });
          return providerFailure("livekit", {
            code: "livekit_room_metadata_conflict",
            message:
              "Interview room metadata does not match the start request.",
            retryable: false,
          });
        }
      } catch (error) {
        input.onStage?.({
          stage: "room_verification",
          outcome: "failed",
          durationMs: monotonicNow() - roomVerificationStartedAt,
        });
        return providerFailure("livekit", {
          code: "livekit_room_reconcile_failed",
          message: getErrorMessage(error),
          retryable: true,
          cause: error,
        });
      }
      input.onStage?.({
        stage: "room_verification",
        outcome: "succeeded",
        durationMs: monotonicNow() - roomVerificationStartedAt,
      });

      const dispatchVerificationStartedAt = monotonicNow();
      try {
        const existingDispatches = await dispatchClient.listDispatch(
          input.roomName
        );

        if (
          existingDispatches.length !== 1 ||
          typeof existingDispatches[0].id !== "string" ||
          !existingDispatches[0].id.trim() ||
          existingDispatches[0].agentName !== input.agentName ||
          existingDispatches[0].room !== input.roomName
        ) {
          input.onStage?.({
            stage: "dispatch_verification",
            outcome: "terminal",
            durationMs: monotonicNow() - dispatchVerificationStartedAt,
          });
          return providerFailure("livekit", {
            code: "livekit_agent_dispatch_conflict",
            message:
              "Interview room does not have exactly one matching named dispatch.",
            retryable: false,
          });
        }
      } catch (error) {
        input.onStage?.({
          stage: "dispatch_verification",
          outcome: "failed",
          durationMs: monotonicNow() - dispatchVerificationStartedAt,
        });
        return providerFailure("livekit", {
          code: "livekit_agent_dispatch_reconcile_failed",
          message: getErrorMessage(error),
          retryable: true,
          cause: error,
        });
      }
      input.onStage?.({
        stage: "dispatch_verification",
        outcome: "succeeded",
        durationMs: monotonicNow() - dispatchVerificationStartedAt,
      });

      return providerSuccess("livekit", {
        roomName: input.roomName,
        token: signedToken,
        url: input.env.url,
      });
    },
    async terminateInterviewRoom(input) {
      return terminateInterviewRoom(input, {
        roomServiceClientFactory,
        now,
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
  now = () => new Date(),
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: LiveKitProviderDependencies = {}): LiveKitPublicDemoProvider {
  async function mintToken(
    input: IssuePublicDemoTokenInput
  ): Promise<ProviderResult<StartedPublicDemoRoom>> {
    try {
      const signingAtSeconds = Math.floor(now().getTime() / 1_000);
      const observedAtMilliseconds = input.observedAt.getTime();
      const observedAtSeconds = Math.floor(observedAtMilliseconds / 1_000);
      const expirationSeconds = Math.floor(input.expiresAt.getTime() / 1_000);
      const ttlSeconds = expirationSeconds - signingAtSeconds;
      if (
        !Number.isSafeInteger(signingAtSeconds) ||
        !Number.isFinite(observedAtMilliseconds) ||
        !Number.isSafeInteger(observedAtSeconds) ||
        !Number.isSafeInteger(expirationSeconds) ||
        expirationSeconds <= observedAtSeconds ||
        ttlSeconds < PUBLIC_DEMO_TOKEN_DELIVERY_MARGIN_SECONDS ||
        ttlSeconds > PUBLIC_DEMO_DURATION_SECONDS
      ) {
        return providerFailure("livekit", {
          code: "livekit_demo_token_deadline_invalid",
          message: "The public demo token deadline is invalid or expired.",
          retryable: false,
        });
      }
      const token = new accessTokenFactory(
        input.env.apiKey,
        input.env.apiSecret,
        {
          identity: input.identity,
          name: "Demo participant",
          ttl: ttlSeconds,
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
      const signedAtMilliseconds = now().getTime();
      if (
        actualExpiration === null ||
        !Number.isFinite(signedAtMilliseconds) ||
        actualExpiration !== expirationSeconds ||
        actualExpiration * 1_000 - observedAtMilliseconds <
          PUBLIC_DEMO_TOKEN_DELIVERY_MARGIN_SECONDS * 1_000 ||
        actualExpiration * 1_000 - signedAtMilliseconds <
          PUBLIC_DEMO_TOKEN_DELIVERY_MARGIN_SECONDS * 1_000
      ) {
        return providerFailure("livekit", {
          code: "livekit_demo_token_deadline_invalid",
          message: "The signed public demo token exceeded its deadline.",
          retryable: false,
        });
      }
      return providerSuccess("livekit", {
        roomName: input.roomName,
        token: signedToken,
        url: input.env.url,
        expiresAt: new Date(actualExpiration * 1_000),
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

  async function verifyPublicDemoDispatch(
    input: IssuePublicDemoTokenInput,
    roomClient: RoomServiceClientLike,
    dispatchClient: AgentDispatchClientLike
  ): Promise<ProviderResult<true>> {
    let dispatches: AgentDispatchLike[];
    try {
      dispatches = await dispatchClient.listDispatch(input.roomName);
    } catch (error) {
      return providerFailure("livekit", {
        code: "livekit_demo_dispatch_verify_failed",
        message: getErrorMessage(error),
        retryable: true,
        cause: error,
      });
    }

    if (
      dispatches.length === 1 &&
      typeof dispatches[0].id === "string" &&
      dispatches[0].id.trim() &&
      dispatches[0].agentName === input.agentName &&
      dispatches[0].room === input.roomName
    ) {
      return providerSuccess("livekit", true);
    }

    if (!roomClient.deleteRoom) {
      return providerFailure("livekit", {
        code: "livekit_demo_cleanup_failed",
        message: "Demo provider cleanup is unavailable.",
        retryable: true,
      });
    }
    try {
      await roomClient.deleteRoom(input.roomName);
    } catch (error) {
      return providerFailure("livekit", {
        code: "livekit_demo_cleanup_failed",
        message: "Demo provider cleanup failed.",
        retryable: true,
        cause: error,
      });
    }
    return providerFailure("livekit", {
      code: "livekit_demo_dispatch_invalid",
      message: "The public demo dispatch does not match the ready session.",
      retryable: false,
    });
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
      let roomCreationAttempted = false;

      try {
        roomCreationAttempted = true;
        await roomClient.createRoom({
          name: input.roomName,
          metadata: JSON.stringify(input.metadata),
          emptyTimeout: 30,
          departureTimeout: 5,
          maxParticipants: 2,
          agents: [
            new RoomAgentDispatch({
              agentName: input.agentName,
            }),
          ],
        });
        const reconciled = await dispatchClient.listDispatch(input.roomName);
        if (
          reconciled.length !== 1 ||
          typeof reconciled[0].id !== "string" ||
          !reconciled[0].id.trim() ||
          reconciled[0].agentName !== input.agentName ||
          reconciled[0].room !== input.roomName
        ) {
          throw new Error(
            "Public demo dispatch could not be reconciled uniquely."
          );
        }

        const token = await mintToken(input);
        if (!token.ok) throw token.error;
        return token;
      } catch (error) {
        if (roomCreationAttempted) {
          if (!roomClient.deleteRoom) {
            return providerFailure("livekit", {
              code: "livekit_demo_cleanup_failed",
              message: "Demo provider cleanup is unavailable.",
              retryable: true,
              cause: error,
            });
          }
          try {
            await roomClient.deleteRoom(input.roomName);
          } catch (cleanupError) {
            if (!isStructuredLiveKitNotFoundError(cleanupError)) {
              return providerFailure("livekit", {
                code: "livekit_demo_cleanup_failed",
                message: "Demo provider cleanup failed.",
                retryable: true,
                cause: cleanupError,
              });
            }
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
      const dispatchClient = agentDispatchClientFactory(
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

      const initialDispatch = await verifyPublicDemoDispatch(
        input,
        roomClient,
        dispatchClient
      );
      if (!initialDispatch.ok) return initialDispatch;

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

      const finalDispatch = await verifyPublicDemoDispatch(
        input,
        roomClient,
        dispatchClient
      );
      if (!finalDispatch.ok) return finalDispatch;

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
      participant.kind === 4 && participant.identity !== localIdentity
  );
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
    const observedAtMilliseconds = input.observedAt.getTime();
    const observedAtSeconds = Math.floor(observedAtMilliseconds / 1_000);
    const deadlineSeconds = Math.floor(input.expiresAt.getTime() / 1_000);
    const expirationSeconds = Math.min(
      deadlineSeconds,
      observedAtSeconds + input.ttlSeconds
    );
    if (
      !Number.isFinite(observedAtMilliseconds) ||
      !Number.isSafeInteger(signingAtSeconds) ||
      !Number.isSafeInteger(observedAtSeconds) ||
      !Number.isSafeInteger(deadlineSeconds) ||
      !Number.isSafeInteger(expirationSeconds) ||
      expirationSeconds <= observedAtSeconds ||
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
    const signedAtMilliseconds = now().getTime();
    if (
      actualExpiration === null ||
      !Number.isFinite(signedAtMilliseconds) ||
      actualExpiration > expirationSeconds ||
      actualExpiration * 1_000 <= observedAtMilliseconds ||
      actualExpiration * 1_000 <= signedAtMilliseconds
    ) {
      return invalidTokenExpiration();
    }

    return providerSuccess("livekit", {
      roomName: input.roomName,
      token: signedToken,
      url: input.env.url,
      expiresAt: new Date(actualExpiration * 1_000),
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

  if (!input.participantIdentity.trim()) {
    return providerFailure("livekit", {
      code: "livekit_participant_revoke_invalid",
      message: "The LiveKit participant revocation input is invalid.",
      retryable: false,
    });
  }

  try {
    // Omitting revokeTokenTs makes LiveKit Cloud own the cutoff. A missing
    // participant still has its cached tokens revoked before the 404 response.
    await roomClient.removeParticipant(
      input.roomName,
      input.participantIdentity
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

export async function sendReliableInterviewRoomData(
  input: {
    roomName: string;
    destinationIdentity: string;
    topic: string;
    data: Uint8Array;
    env: LiveKitEnvironment;
  },
  {
    roomServiceClientFactory = (url, apiKey, apiSecret) =>
      new RoomServiceClient(url, apiKey, apiSecret),
  }: LiveKitProviderDependencies = {}
): Promise<ProviderResult<SentInterviewRoomData>> {
  const roomClient = roomServiceClientFactory(
    input.env.url,
    input.env.apiKey,
    input.env.apiSecret
  );
  if (!roomClient.sendData) {
    return providerFailure("livekit", {
      code: "livekit_room_data_unsupported",
      message: "The LiveKit room adapter cannot send reliable data.",
      retryable: false,
    });
  }
  if (
    !input.roomName.trim() ||
    !input.destinationIdentity.trim() ||
    !input.topic.trim() ||
    input.data.byteLength === 0
  ) {
    return providerFailure("livekit", {
      code: "livekit_room_data_invalid",
      message: "The LiveKit reliable data request is invalid.",
      retryable: false,
    });
  }
  try {
    await roomClient.sendData(
      input.roomName,
      input.data,
      DataPacket_Kind.RELIABLE,
      {
        destinationIdentities: [input.destinationIdentity],
        topic: input.topic,
      }
    );
    return providerSuccess("livekit", {
      roomName: input.roomName,
      destinationIdentity: input.destinationIdentity,
      topic: input.topic,
    });
  } catch (error) {
    return providerFailure("livekit", {
      code: "livekit_room_data_send_failed",
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
      new RoomServiceClient(url, apiKey, apiSecret, {
        requestTimeout: INTERVIEW_PRESENCE_REQUEST_TIMEOUT_SECONDS,
      }),
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
      (candidate) =>
        candidate.identity === input.participantIdentity && candidate.kind === 0
    );
    const present = Boolean(participant && participant.state !== 3);
    const joined = Boolean(
      participant && (participant.state === 1 || participant.state === 2)
    );
    const joinedAtMs = participant ? Number(participant.joinedAtMs) : 0;
    const agentParticipant = participants.find(
      (candidate) =>
        candidate.kind === 4 &&
        (candidate.state === 1 || candidate.state === 2) &&
        candidate.identity !== input.participantIdentity &&
        candidate.identity.trim().length > 0
    );
    const agentJoinedAtMs = agentParticipant
      ? Number(agentParticipant.joinedAtMs)
      : 0;
    return providerSuccess("livekit", {
      present,
      joined,
      joinedAt:
        present && Number.isSafeInteger(joinedAtMs) && joinedAtMs > 0
          ? new Date(joinedAtMs)
          : null,
      agent: agentParticipant
        ? {
            identity: agentParticipant.identity,
            joinedAt:
              Number.isSafeInteger(agentJoinedAtMs) && agentJoinedAtMs > 0
                ? new Date(agentJoinedAtMs)
                : null,
          }
        : null,
    });
  } catch (error) {
    if (isLiveKitNotFoundError(error)) {
      return providerSuccess("livekit", {
        present: false,
        joined: false,
        joinedAt: null,
        agent: null,
      });
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

function isStructuredLiveKitNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" && code.toLowerCase() === "not_found";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
