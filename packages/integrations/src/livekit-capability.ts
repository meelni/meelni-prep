export type LiveKitDeploymentCapability =
  | {
      mode: "disabled";
      lane: "generic_preview";
      reason: "intentional_generic_preview_disablement";
    }
  | {
      mode: "enabled";
      lane: "local_or_unclassified" | "production" | "staging";
    };

export const GENERIC_PREVIEW_VOICE_UNAVAILABLE = {
  error: "voice_unavailable_in_preview",
  message:
    "Voice practice is unavailable in this web Preview. Use the trusted staging environment for voice rehearsal.",
  retryable: false,
} as const;

export const GENERIC_PREVIEW_VOICE_UNAVAILABLE_STATUS = 503;

type Environment = Record<string, string | undefined>;

/**
 * Vercel owns all three identity markers. Local or partial identities stay
 * strict so missing provider configuration cannot silently disable LiveKit.
 */
export function resolveLiveKitDeploymentCapability(
  env: Environment = process.env
): LiveKitDeploymentCapability {
  if (
    env.VERCEL === "1" &&
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_TARGET_ENV === "preview"
  ) {
    return {
      mode: "disabled",
      lane: "generic_preview",
      reason: "intentional_generic_preview_disablement",
    };
  }

  if (env.VERCEL === "1" && env.VERCEL_ENV === "production") {
    return { mode: "enabled", lane: "production" };
  }

  if (env.VERCEL === "1" && env.VERCEL_TARGET_ENV === "staging") {
    return { mode: "enabled", lane: "staging" };
  }

  return { mode: "enabled", lane: "local_or_unclassified" };
}

export function isLiveKitIntentionallyDisabled(
  env: Environment = process.env
): boolean {
  return resolveLiveKitDeploymentCapability(env).mode === "disabled";
}
