import type { IntegrationProvider } from "./providers";

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

export const PROVIDER_ENV_CONTRACTS: Record<
  IntegrationProvider,
  ProviderEnvContract
> = {
  supabase: {
    provider: "supabase",
    required: [
      env(
        "DATABASE_URL",
        "Postgres connection string for Drizzle and server jobs.",
        "server"
      ),
      env(
        "NEXT_PUBLIC_SUPABASE_URL",
        "Supabase project URL for auth clients.",
        "shared"
      ),
      env(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "Supabase anonymous browser key.",
        "client"
      ),
    ],
    optional: [
      env(
        "MEELNI_PRODUCTION_SUPABASE_PROJECT_REF",
        "Non-secret Production Supabase project ref required for shared database operations.",
        "server",
        false
      ),
      env(
        "SUPABASE_SERVICE_ROLE_KEY",
        "Server-only key for privileged maintenance tasks.",
        "server",
        false
      ),
    ],
  },
  livekit: {
    provider: "livekit",
    required: [
      env(
        "LIVEKIT_API_KEY",
        "Server-side LiveKit API key for room and dispatch APIs.",
        "server"
      ),
      env(
        "LIVEKIT_API_SECRET",
        "Server-side LiveKit API secret for room and token APIs.",
        "server"
      ),
    ],
    optional: [
      env(
        "LIVEKIT_INTERVIEW_AGENT_NAME",
        "LiveKit dispatch name for the full interview agent.",
        "server",
        false
      ),
      env(
        "LIVEKIT_DEMO_AGENT_NAME",
        "LiveKit dispatch name for the public demo agent.",
        "server",
        false
      ),
    ],
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
      env(
        "STRIPE_WEBHOOK_SECRET",
        "Stripe webhook signature secret.",
        "server"
      ),
      env(
        "STRIPE_INTERVIEW_PASS_PRICE_ID",
        "Stripe price ID for the one-time Interview Pass.",
        "server"
      ),
      env(
        "STRIPE_STARTER_MONTHLY_PRICE_ID",
        "Stripe monthly price ID for the Starter plan.",
        "server"
      ),
      env(
        "STRIPE_PRO_MONTHLY_PRICE_ID",
        "Stripe monthly price ID for the Pro plan.",
        "server"
      ),
    ],
    optional: [
      env(
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        "Browser publishable Stripe key.",
        "client",
        false
      ),
    ],
  },
  posthog: {
    provider: "posthog",
    required: [],
    optional: [
      env(
        "NEXT_PUBLIC_POSTHOG_KEY",
        "Browser PostHog project key.",
        "client",
        false
      ),
      env("POSTHOG_SERVER_KEY", "Server-side PostHog key.", "server", false),
      env(
        "NEXT_PUBLIC_POSTHOG_HOST",
        "PostHog ingestion host.",
        "client",
        false
      ),
    ],
  },
  google_sheets: {
    provider: "google_sheets",
    required: [],
    optional: [
      env(
        "GOOGLE_SHEET_CSV_URL",
        "Published CSV URL for question import.",
        "server",
        false
      ),
      env(
        "GOOGLE_SHEETS_API_KEY",
        "Google Sheets API key for public sheets.",
        "server",
        false
      ),
      env(
        "GOOGLE_SHEETS_CREDENTIALS_BASE64",
        "Base64 service account JSON.",
        "server",
        false
      ),
      env(
        "GOOGLE_SHEETS_CREDENTIALS",
        "Service account JSON.",
        "server",
        false
      ),
      env(
        "GOOGLE_SERVICE_ACCOUNT_EMAIL",
        "Legacy service account email.",
        "server",
        false
      ),
      env(
        "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
        "Legacy service account private key.",
        "server",
        false
      ),
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
      env(
        "INNGEST_EVENT_KEY",
        "Inngest event key for background job dispatch.",
        "server",
        false
      ),
      env(
        "INNGEST_SIGNING_KEY",
        "Inngest signing key for webhook verification.",
        "server",
        false
      ),
    ],
  },
};

export function getProviderEnvContract(
  provider: IntegrationProvider
): ProviderEnvContract {
  return PROVIDER_ENV_CONTRACTS[provider];
}

export function listProviderEnvVars(provider: IntegrationProvider): string[] {
  const contract = getProviderEnvContract(provider);
  const names = [
    ...contract.required.map((requirement) => requirement.name),
    ...contract.optional.map((requirement) => requirement.name),
    ...(contract.atLeastOne ?? []).flatMap((group) =>
      group.names.flatMap(splitAlternativeName)
    ),
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

const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

export function inferSupabaseProjectRef(
  value: string | undefined
): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    return url.hostname.match(
      new RegExp(
        `^(${SUPABASE_PROJECT_REF_PATTERN.source.slice(1, -1)})\\.supabase\\.co$`
      )
    )?.[1];
  } catch {
    return undefined;
  }
}

export function inferSupabaseDatabaseProjectRef(
  value: string | undefined
): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return undefined;

    const direct = url.hostname.match(
      new RegExp(
        `^db\\.(${SUPABASE_PROJECT_REF_PATTERN.source.slice(1, -1)})\\.supabase\\.co$`
      )
    );
    if (direct) return direct[1];

    if (!/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)) {
      return undefined;
    }
    return decodeURIComponent(url.username).match(
      new RegExp(
        `^postgres\\.(${SUPABASE_PROJECT_REF_PATTERN.source.slice(1, -1)})$`
      )
    )?.[1];
  } catch {
    return undefined;
  }
}

export function isSupabaseProjectRef(value: string | undefined): boolean {
  return SUPABASE_PROJECT_REF_PATTERN.test(value ?? "");
}

function env(
  name: string,
  description: string,
  scope: EnvScope,
  required = true
): EnvRequirement {
  return { name, description, scope, required };
}

function hasAlternativeValue(
  name: string,
  envSource: Record<string, string | undefined>
): boolean {
  return splitAlternativeName(name).every((part) => hasValue(envSource[part]));
}

function splitAlternativeName(name: string): string[] {
  return name.split(" + ").map((part) => part.trim());
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
