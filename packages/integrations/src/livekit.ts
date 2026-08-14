import {
  AccessToken,
  AgentDispatchClient,
  DataPacket_Kind,
  RoomAgentDispatch,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import {
  JobStatus,
  JobType,
  ParticipantInfo_Kind,
  ParticipantInfo_State,
  type AgentDispatch,
} from "@livekit/protocol";

import { findMissingRequiredEnv } from "./environment";
import { resolveLiveKitDeploymentCapability } from "./livekit-capability";
import {
  providerFailure,
  providerSuccess,
  type ProviderResult,
} from "./results";

export interface LiveKitEnvironment {
  apiKey: string;
  apiSecret: string;
  url: string;
  interviewAgentName?: string;
}

export type LiveKitAgentKind = "interview" | "demo";

export const INTERVIEW_ROOM_DEPARTURE_TIMEOUT_SECONDS = 60;
const INTERVIEW_PARTICIPANT_TOKEN_TTL_SECONDS = 5 * 60;
const INTERVIEW_PRESENCE_REQUEST_TIMEOUT_SECONDS = 2;
const LIVEKIT_MAX_PARTICIPANT_IDENTITY_BYTES = 256;
export const PUBLIC_DEMO_DURATION_SECONDS = 2 * 60;
export const PUBLIC_DEMO_TOKEN_DELIVERY_MARGIN_SECONDS = 5;

export interface StartInterviewRoomInput {
  agentName: string;
  identity: string;
  participantName: string;
  roomName: string;
  metadata: unknown;
  env: LiveKitEnvironment;
  onStage?: (
    stage: LiveKitInterviewProvisioningStage,
    outcome: LiveKitInterviewProvisioningStageOutcome,
    durationMs: number
  ) => void;
}

export type LiveKitInterviewProvisioningStage =
  | "room_create"
  | "room_verification"
  | "dispatch_verification";
export type LiveKitInterviewProvisioningStageOutcome =
  | "succeeded"
  | "failed"
  | "terminal";

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
  roomPresent?: boolean;
  present: boolean;
  joined: boolean;
  joinedAt: Date | null;
  agent: { identity: string; joinedAt: Date | null } | null;
  targetSource?: LiveKitInterviewTargetSource;
  targetReason?: LiveKitInterviewTargetReason;
}

export type LiveKitInterviewTargetSource = "participant" | "dispatch" | "none";

export type LiveKitInterviewTargetReason =
  | "participant_exact"
  | "dispatch_exact"
  | "agent_absent"
  | "agent_ambiguous"
  | "agent_projection_invalid"
  | "agent_name_conflict"
  | "dispatch_absent"
  | "dispatch_pending"
  | "dispatch_ambiguous"
  | "dispatch_projection_invalid";

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
  monotonicNow?: () => number;
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
  createDispatch(
    roomName: string,
    agentName: string
  ): Promise<AgentDispatchLike>;
  listDispatch(roomName: string): Promise<AgentDispatchLike[]>;
}

type AgentDispatchLike = Pick<AgentDispatch, "id" | "agentName" | "room"> & {
  state?: {
    deletedAt?: bigint;
    jobs: AgentJobLike[];
  };
};

type AgentJobLike = {
  id?: string;
  dispatchId?: string;
  type?: number;
  room?: { name: string };
  agentName?: string;
  participant?: ParticipantInfoLike;
  state?: {
    status: number;
    endedAt?: bigint;
    participantIdentity: string;
  };
};

type ParticipantInfoLike = {
  identity: unknown;
  state: number;
  joinedAtMs: bigint;
  kind: number;
  attributes?: Record<string, string>;
};

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
  listParticipants?(roomName: string): Promise<ParticipantInfoLike[]>;
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
  if (resolveLiveKitDeploymentCapability(envSource).mode === "disabled") {
    return providerFailure("livekit", {
      code: "livekit_disabled_in_generic_preview",
      message: "LiveKit is intentionally disabled in generic Vercel Preview.",
      retryable: false,
    });
  }

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
    ...(envSource.LIVEKIT_INTERVIEW_AGENT_NAME?.trim()
      ? { interviewAgentName: envSource.LIVEKIT_INTERVIEW_AGENT_NAME.trim() }
      : {}),
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
          reportProvisioningStage(
            input,
            "room_create",
            "failed",
            monotonicNow() - roomCreateStartedAt
          );
          return providerFailure("livekit", {
            code: "livekit_room_create_failed",
            message,
            retryable: true,
            cause: error,
          });
        }
      }
      reportProvisioningStage(
        input,
        "room_create",
        "succeeded",
        monotonicNow() - roomCreateStartedAt
      );

      const roomVerificationStartedAt = monotonicNow();
      if (!roomClient.listRooms) {
        reportProvisioningStage(
          input,
          "room_verification",
          "terminal",
          monotonicNow() - roomVerificationStartedAt
        );
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
          reportProvisioningStage(
            input,
            "room_verification",
            "terminal",
            monotonicNow() - roomVerificationStartedAt
          );
          return providerFailure("livekit", {
            code: "livekit_room_metadata_conflict",
            message:
              "Interview room metadata does not match the start request.",
            retryable: false,
          });
        }
        reportProvisioningStage(
          input,
          "room_verification",
          "succeeded",
          monotonicNow() - roomVerificationStartedAt
        );
      } catch (error) {
        reportProvisioningStage(
          input,
          "room_verification",
          "failed",
          monotonicNow() - roomVerificationStartedAt
        );
        return providerFailure("livekit", {
          code: "livekit_room_reconcile_failed",
          message: getErrorMessage(error),
          retryable: true,
          cause: error,
        });
      }

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
          reportProvisioningStage(
            input,
            "dispatch_verification",
            "terminal",
            monotonicNow() - dispatchVerificationStartedAt
          );
          return providerFailure("livekit", {
            code: "livekit_agent_dispatch_conflict",
            message:
              "Interview room does not have exactly one matching named dispatch.",
            retryable: false,
          });
        }
        reportProvisioningStage(
          input,
          "dispatch_verification",
          "succeeded",
          monotonicNow() - dispatchVerificationStartedAt
        );
      } catch (error) {
        reportProvisioningStage(
          input,
          "dispatch_verification",
          "failed",
          monotonicNow() - dispatchVerificationStartedAt
        );
        return providerFailure("livekit", {
          code: "livekit_agent_dispatch_reconcile_failed",
          message: getErrorMessage(error),
          retryable: true,
          cause: error,
        });
      }

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

function reportProvisioningStage(
  input: StartInterviewRoomInput,
  stage: LiveKitInterviewProvisioningStage,
  outcome: LiveKitInterviewProvisioningStageOutcome,
  durationMs: number
): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  try {
    input.onStage?.(stage, outcome, durationMs);
  } catch {
    // Observability must never change room provisioning behavior.
  }
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
  participants: Array<{ identity?: unknown; kind?: number }>,
  localIdentity: string
): boolean {
  return participants.some(
    (participant) =>
      participant.kind === ParticipantInfo_Kind.AGENT &&
      participant.identity !== localIdentity &&
      isBoundedLiveKitParticipantIdentity(participant.identity)
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
    agentDispatchClientFactory = (url, apiKey, apiSecret) =>
      new AgentDispatchClient(url, apiKey, apiSecret, {
        requestTimeout: INTERVIEW_PRESENCE_REQUEST_TIMEOUT_SECONDS,
      }),
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
        candidate.identity === input.participantIdentity &&
        candidate.kind === ParticipantInfo_Kind.STANDARD
    );
    const present = Boolean(
      participant && participant.state !== ParticipantInfo_State.DISCONNECTED
    );
    const joined = Boolean(
      participant && isActiveParticipantState(participant.state)
    );
    const joinedAtMs = participant ? Number(participant.joinedAtMs) : 0;
    const expectedAgentName = input.env.interviewAgentName?.trim() || null;
    const agentParticipants = participants.filter(
      (candidate) =>
        candidate.kind === ParticipantInfo_Kind.AGENT &&
        isActiveParticipantState(candidate.state) &&
        candidate.identity !== input.participantIdentity
    );
    const hasInvalidAgentProjection = agentParticipants.some(
      (candidate) => !isBoundedLiveKitParticipantIdentity(candidate.identity)
    );
    const agentParticipant =
      agentParticipants.length === 1 ? agentParticipants[0] : undefined;
    const agentJoinedAtMs = agentParticipant
      ? Number(agentParticipant.joinedAtMs)
      : 0;
    const projectedAgentName = normalizeProjectedAgentName(agentParticipant);
    const projectedAgentNameConflicts = Boolean(
      expectedAgentName &&
        projectedAgentName &&
        projectedAgentName !== expectedAgentName
    );
    let targetSource: LiveKitInterviewTargetSource = "none";
    let targetReason: LiveKitInterviewTargetReason = !expectedAgentName
      ? "agent_projection_invalid"
      : hasInvalidAgentProjection
        ? "agent_projection_invalid"
        : agentParticipants.length > 1
          ? "agent_ambiguous"
          : "agent_absent";
    let agent =
      expectedAgentName &&
      agentParticipant &&
      !hasInvalidAgentProjection &&
      isBoundedLiveKitParticipantIdentity(agentParticipant.identity) &&
      !projectedAgentNameConflicts &&
      projectedAgentName === expectedAgentName
        ? {
            identity: agentParticipant.identity,
            joinedAt:
              Number.isSafeInteger(agentJoinedAtMs) && agentJoinedAtMs > 0
                ? new Date(agentJoinedAtMs)
                : null,
          }
        : null;
    if (agent) {
      targetSource = "participant";
      targetReason = "participant_exact";
    } else if (projectedAgentNameConflicts) {
      targetReason = "agent_name_conflict";
    } else if (agentParticipant && !projectedAgentName) {
      targetReason = "agent_projection_invalid";
    }
    if (
      expectedAgentName &&
      !hasInvalidAgentProjection &&
      !projectedAgentNameConflicts &&
      agentParticipants.length <= 1 &&
      agent === null
    ) {
      const dispatchClient = agentDispatchClientFactory(
        input.env.url,
        input.env.apiKey,
        input.env.apiSecret
      );
      const dispatches = await dispatchClient.listDispatch(input.roomName);
      const dispatchTarget = resolveRunningDispatchAgentTarget(
        dispatches,
        input.roomName,
        expectedAgentName,
        agentParticipant ?? null
      );
      targetSource = dispatchTarget.source;
      targetReason = dispatchTarget.reason;
      if (dispatchTarget.identity) {
        agent = { identity: dispatchTarget.identity, joinedAt: null };
      }
    }
    return providerSuccess("livekit", {
      roomPresent: true,
      present,
      joined,
      joinedAt:
        present && Number.isSafeInteger(joinedAtMs) && joinedAtMs > 0
          ? new Date(joinedAtMs)
          : null,
      agent,
      targetSource,
      targetReason,
    });
  } catch (error) {
    if (isLiveKitNotFoundError(error)) {
      return providerSuccess("livekit", {
        roomPresent: false,
        present: false,
        joined: false,
        joinedAt: null,
        agent: null,
        targetSource: "none",
        targetReason: "agent_absent",
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

function resolveRunningDispatchAgentTarget(
  dispatches: AgentDispatchLike[],
  roomName: string,
  expectedAgentName: string,
  observedAgent: ParticipantInfoLike | null
): {
  source: LiveKitInterviewTargetSource;
  reason: LiveKitInterviewTargetReason;
  identity: string | null;
} {
  const exactDispatches = dispatches.filter(
    (dispatch) =>
      dispatch.room === roomName && dispatch.agentName === expectedAgentName
  );
  if (exactDispatches.length === 0) {
    return { source: "none", reason: "dispatch_absent", identity: null };
  }

  const candidates: Array<{
    identity: string | null;
    state: "running" | "pending" | "invalid";
  }> = [];
  for (const dispatch of exactDispatches) {
    if (!dispatch.state || typeof dispatch.state.deletedAt !== "bigint") {
      candidates.push({ identity: null, state: "invalid" });
      continue;
    }
    if (dispatch.state.deletedAt > BigInt(0)) {
      continue;
    }
    if (dispatch.state.deletedAt !== BigInt(0)) {
      candidates.push({ identity: null, state: "invalid" });
      continue;
    }
    const jobs = dispatch.state.jobs;
    if (!Array.isArray(jobs) || jobs.length !== 1) {
      candidates.push({ identity: null, state: "invalid" });
      continue;
    }
    const job = jobs[0];
    if (
      !job ||
      job.participant != null ||
      !hasExactRoomJobBinding({
        dispatch,
        job,
        roomName,
        expectedAgentName,
      })
    ) {
      candidates.push({ identity: null, state: "invalid" });
      continue;
    }
    if (
      isStructurallyValidTerminalRoomJob({
        dispatch,
        job,
        roomName,
        expectedAgentName,
      })
    ) {
      continue;
    }
    if (job.state?.status === JobStatus.JS_PENDING) {
      candidates.push({
        identity: null,
        state: job.state.endedAt === BigInt(0) ? "pending" : "invalid",
      });
      continue;
    }
    const identity = validateCurrentRunningRoomJob({
      dispatch,
      job,
      roomName,
      expectedAgentName,
      observedAgent,
    });
    candidates.push({ identity, state: identity ? "running" : "invalid" });
  }

  if (candidates.length === 0) {
    return { source: "none", reason: "dispatch_absent", identity: null };
  }
  if (candidates.length !== 1) {
    return { source: "none", reason: "dispatch_ambiguous", identity: null };
  }
  const candidate = candidates[0];
  if (candidate.state === "pending") {
    return { source: "none", reason: "dispatch_pending", identity: null };
  }
  if (candidate.state !== "running" || !candidate.identity) {
    return {
      source: "none",
      reason: "dispatch_projection_invalid",
      identity: null,
    };
  }
  return {
    source: "dispatch",
    reason: "dispatch_exact",
    identity: candidate.identity,
  };
}

function validateCurrentRunningRoomJob(input: {
  dispatch: AgentDispatchLike;
  job: AgentJobLike;
  roomName: string;
  expectedAgentName: string;
  observedAgent: ParticipantInfoLike | null;
}): string | null {
  const { dispatch, job, roomName, expectedAgentName, observedAgent } = input;
  const state = job.state;
  if (
    !hasExactRoomJobBinding({
      dispatch,
      job,
      roomName,
      expectedAgentName,
    }) ||
    !state ||
    state.status !== JobStatus.JS_RUNNING ||
    state.endedAt !== BigInt(0) ||
    !isBoundedLiveKitParticipantIdentity(state.participantIdentity)
  ) {
    return null;
  }
  const identity = state.participantIdentity;
  if (
    observedAgent &&
    (observedAgent.identity !== identity ||
      normalizeProjectedAgentName(observedAgent) !== null)
  ) {
    return null;
  }
  return identity;
}

function isStructurallyValidTerminalRoomJob(input: {
  dispatch: AgentDispatchLike;
  job: AgentJobLike;
  roomName: string;
  expectedAgentName: string;
}): boolean {
  const { dispatch, job, roomName, expectedAgentName } = input;
  return (
    hasExactRoomJobBinding({
      dispatch,
      job,
      roomName,
      expectedAgentName,
    }) &&
    typeof job.state?.endedAt === "bigint" &&
    job.state.endedAt > BigInt(0) &&
    (job.state.status === JobStatus.JS_SUCCESS ||
      job.state.status === JobStatus.JS_FAILED)
  );
}

function hasExactRoomJobBinding(input: {
  dispatch: AgentDispatchLike;
  job: AgentJobLike;
  roomName: string;
  expectedAgentName: string;
}): boolean {
  const { dispatch, job, roomName, expectedAgentName } = input;
  return (
    typeof dispatch.id === "string" &&
    Boolean(dispatch.id.trim()) &&
    typeof job.id === "string" &&
    Boolean(job.id.trim()) &&
    job.dispatchId === dispatch.id &&
    job.type === JobType.JT_ROOM &&
    job.room?.name === roomName &&
    job.agentName === expectedAgentName &&
    Boolean(job.state)
  );
}

function isActiveParticipantState(state: number): boolean {
  return (
    state === ParticipantInfo_State.JOINED ||
    state === ParticipantInfo_State.ACTIVE
  );
}

function normalizeProjectedAgentName(
  participant: Pick<ParticipantInfoLike, "attributes"> | undefined
): string | null {
  const value = participant?.attributes?.["lk.agent.name"];
  return typeof value === "string" && value.trim() ? value : null;
}

function isBoundedLiveKitParticipantIdentity(
  identity: unknown
): identity is string {
  return (
    typeof identity === "string" &&
    identity.trim().length > 0 &&
    new TextEncoder().encode(identity).byteLength <=
      LIVEKIT_MAX_PARTICIPANT_IDENTITY_BYTES
  );
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
