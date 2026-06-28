import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
} from "livekit-server-sdk";

export const INTEGRATION_PROVIDERS = [
  "supabase",
  "livekit",
  "stripe",
  "posthog",
  "google_sheets",
  "inngest",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export function isIntegrationProvider(value: unknown): value is IntegrationProvider {
  return (
    typeof value === "string" &&
    (INTEGRATION_PROVIDERS as readonly string[]).includes(value)
  );
}

export type EnvScope = "server" | "client" | "shared";

export interface EnvRequirement {
  name: string;
  description: string;
  scope: EnvScope;
  required: boolean;
}

export interface EnvAlternativeGroup {
  label: string;
  names: string[];
}

export interface ProviderEnvContract {
  provider: IntegrationProvider;
  required: EnvRequirement[];
  optional: EnvRequirement[];
  atLeastOne?: EnvAlternativeGroup[];
}

export const PROVIDER_ENV_CONTRACTS: Record<IntegrationProvider, ProviderEnvContract> = {
  supabase: {
    provider: "supabase",
    required: [
      env("DATABASE_URL", "Postgres connection string for Drizzle and server jobs.", "server"),
      env("NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL for auth clients.", "shared"),
      env("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anonymous browser key.", "client"),
    ],
    optional: [
      env("SUPABASE_SERVICE_ROLE_KEY", "Server-only key for privileged maintenance tasks.", "server", false),
    ],
  },
  livekit: {
    provider: "livekit",
    required: [
      env("LIVEKIT_API_KEY", "Server-side LiveKit API key for room and dispatch APIs.", "server"),
      env("LIVEKIT_API_SECRET", "Server-side LiveKit API secret for room and token APIs.", "server"),
    ],
    optional: [],
    atLeastOne: [
      {
        label: "LiveKit websocket URL",
        names: ["NEXT_PUBLIC_LIVEKIT_URL", "LIVEKIT_URL"],
      },
    ],
  },
  stripe: {
    provider: "stripe",
    required: [
      env("STRIPE_SECRET_KEY", "Server-side Stripe API key.", "server"),
      env("STRIPE_WEBHOOK_SECRET", "Stripe webhook signature secret.", "server"),
    ],
    optional: [
      env("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "Browser publishable Stripe key.", "client", false),
      env("STRIPE_PRO_PRICE_ID", "Stripe price id for the Pro plan.", "server", false),
    ],
  },
  posthog: {
    provider: "posthog",
    required: [],
    optional: [
      env("NEXT_PUBLIC_POSTHOG_KEY", "Browser PostHog project key.", "client", false),
      env("POSTHOG_SERVER_KEY", "Server-side PostHog key.", "server", false),
      env("NEXT_PUBLIC_POSTHOG_HOST", "PostHog ingestion host.", "client", false),
    ],
  },
  google_sheets: {
    provider: "google_sheets",
    required: [],
    optional: [
      env("GOOGLE_SHEET_CSV_URL", "Published CSV URL for question import.", "server", false),
      env("GOOGLE_SHEETS_API_KEY", "Google Sheets API key for public sheets.", "server", false),
      env("GOOGLE_SHEETS_CREDENTIALS_BASE64", "Base64 service account JSON.", "server", false),
      env("GOOGLE_SHEETS_CREDENTIALS", "Service account JSON.", "server", false),
      env("GOOGLE_SERVICE_ACCOUNT_EMAIL", "Legacy service account email.", "server", false),
      env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "Legacy service account private key.", "server", false),
    ],
    atLeastOne: [
      {
        label: "Google Sheets credentials",
        names: [
          "GOOGLE_SHEET_CSV_URL",
          "GOOGLE_SHEETS_API_KEY",
          "GOOGLE_SHEETS_CREDENTIALS_BASE64",
          "GOOGLE_SHEETS_CREDENTIALS",
          "GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
        ],
      },
    ],
  },
  inngest: {
    provider: "inngest",
    required: [],
    optional: [
      env("INNGEST_EVENT_KEY", "Inngest event key for background job dispatch.", "server", false),
      env("INNGEST_SIGNING_KEY", "Inngest signing key for webhook verification.", "server", false),
    ],
  },
};

export function getProviderEnvContract(provider: IntegrationProvider): ProviderEnvContract {
  return PROVIDER_ENV_CONTRACTS[provider];
}

export function listProviderEnvVars(provider: IntegrationProvider): string[] {
  const contract = getProviderEnvContract(provider);
  const names = [
    ...contract.required.map((requirement) => requirement.name),
    ...contract.optional.map((requirement) => requirement.name),
    ...(contract.atLeastOne ?? []).flatMap((group) => group.names.flatMap(splitAlternativeName)),
  ];

  return [...new Set(names)];
}

export function findMissingRequiredEnv(
  provider: IntegrationProvider,
  envSource: Record<string, string | undefined> = process.env
): string[] {
  const contract = getProviderEnvContract(provider);
  const missing = contract.required
    .filter((requirement) => !hasValue(envSource[requirement.name]))
    .map((requirement) => requirement.name);

  for (const group of contract.atLeastOne ?? []) {
    if (!group.names.some((name) => hasAlternativeValue(name, envSource))) {
      missing.push(group.names.join(" or "));
    }
  }

  return missing;
}

function env(
  name: string,
  description: string,
  scope: EnvScope,
  required = true
): EnvRequirement {
  return { name, description, scope, required };
}

function hasAlternativeValue(name: string, envSource: Record<string, string | undefined>): boolean {
  return splitAlternativeName(name).every((part) => hasValue(envSource[part]));
}

function splitAlternativeName(name: string): string[] {
  return name.split(" + ").map((part) => part.trim());
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export interface ProviderError {
  code: string;
  message: string;
  retryable: boolean;
  cause?: unknown;
}

export type ProviderResult<T> =
  | {
      ok: true;
      provider: IntegrationProvider;
      data: T;
      meta?: Record<string, unknown>;
    }
  | {
      ok: false;
      provider: IntegrationProvider;
      error: ProviderError;
      meta?: Record<string, unknown>;
    };

export function providerSuccess<T>(
  provider: IntegrationProvider,
  data: T,
  meta?: Record<string, unknown>
): ProviderResult<T> {
  return {
    ok: true,
    provider,
    data,
    ...(meta ? { meta } : {}),
  };
}

export function providerFailure<T = never>(
  provider: IntegrationProvider,
  error: ProviderError,
  meta?: Record<string, unknown>
): ProviderResult<T> {
  return {
    ok: false,
    provider,
    error,
    ...(meta ? { meta } : {}),
  };
}

export function isProviderFailure<T>(
  result: ProviderResult<T>
): result is Extract<ProviderResult<T>, { ok: false }> {
  return !result.ok;
}

export interface LiveKitEnvironment {
  apiKey: string;
  apiSecret: string;
  url: string;
}

export interface StartInterviewRoomInput {
  agentId: string;
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
    canSubscribe: boolean;
  }): void;
  toJwt(): Promise<string>;
}

type AccessTokenFactory = new (
  apiKey: string,
  apiSecret: string,
  options: { identity: string; name: string }
) => AccessTokenLike;

interface AgentDispatchClientLike {
  createDispatch(roomName: string, agentId: string): Promise<unknown>;
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
        await dispatchClient.createDispatch(input.roomName, input.agentId);
      } catch (error) {
        return providerFailure("livekit", {
          code: "livekit_agent_dispatch_failed",
          message: getErrorMessage(error),
          retryable: true,
          cause: error,
        });
      }

      const token = new accessTokenFactory(input.env.apiKey, input.env.apiSecret, {
        identity: input.identity,
        name: input.participantName,
      });

      token.addGrant({
        room: input.roomName,
        roomJoin: true,
        canPublish: true,
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
