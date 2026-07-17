import type { StatsigUser } from "@statsig/js-client";

type StatsigEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_STATSIG_API_URL?: string;
  NEXT_PUBLIC_STATSIG_CLIENT_KEY?: string;
  NEXT_PUBLIC_STATSIG_ENVIRONMENT?: string;
  VERCEL_ENV?: string;
};

type SupabaseStatsigUser = {
  id: string;
  email?: string | null;
  created_at?: string;
  app_metadata?: {
    provider?: string;
  };
};

export interface StatsigConfig {
  apiUrl?: string;
  clientKey: string;
  enabled: boolean;
  debug: boolean;
  environmentTier?: string;
}

export function localFeatureFlagOverridesEnabled(
  nodeEnv = process.env.NODE_ENV
): boolean {
  return nodeEnv === "development";
}

export function getStatsigConfig(env: StatsigEnv = process.env): StatsigConfig {
  const clientKey = env.NEXT_PUBLIC_STATSIG_CLIENT_KEY?.trim() ?? "";
  const nodeEnv = env.NODE_ENV ?? "development";
  const apiUrl =
    env.NEXT_PUBLIC_STATSIG_API_URL?.trim() ||
    (nodeEnv === "development" ? "/api/statsig" : undefined);

  return {
    apiUrl,
    clientKey,
    enabled: Boolean(clientKey) && nodeEnv !== "test",
    debug: nodeEnv === "development",
    environmentTier:
      env.NEXT_PUBLIC_STATSIG_ENVIRONMENT?.trim() ||
      env.VERCEL_ENV?.trim() ||
      nodeEnv,
  };
}

export function buildStatsigUser({
  anonymousId,
  user,
}: {
  anonymousId: string;
  user: SupabaseStatsigUser | null;
}): StatsigUser {
  if (!user) {
    return {
      userID: anonymousId,
      custom: {
        anonymous_id: anonymousId,
        local_dev_id: anonymousId,
        logged_in: false,
      },
    };
  }

  const emailDomain = user.email?.split("@")[1]?.toLowerCase();
  const signupMethod =
    user.app_metadata?.provider === "google" ? "google" : "email";

  return {
    userID: user.id,
    custom: {
      anonymous_id: anonymousId,
      created_at: user.created_at,
      email_domain: emailDomain,
      local_dev_id: anonymousId,
      signup_method: signupMethod,
    },
  };
}
