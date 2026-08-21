export type LiveKitDeploymentCapability =
  | {
      mode: "disabled";
      lane: "generic_preview" | "preview_shadow_control_plane";
      reason:
        | "intentional_generic_preview_disablement"
        | "intentional_preview_shadow_control_plane_disablement";
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

export const CANONICAL_VERCEL_DEPLOYMENT_IDENTITY = {
  projectId: "prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4",
  repositoryOwner: "meelni",
  repositorySlug: "meelni-prep",
} as const;

/**
 * Vercel supplies the deployment identity while the application supplies both
 * explicit staging markers. Local or partial identities stay strict so no
 * application-controlled value can disable LiveKit by itself.
 */
export function resolveLiveKitDeploymentCapability(
  env: Environment = process.env
): LiveKitDeploymentCapability {
  if (isPreviewShadowControlPlaneOnly(env)) {
    return {
      mode: "disabled",
      lane: "preview_shadow_control_plane",
      reason: "intentional_preview_shadow_control_plane_disablement",
    };
  }

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

function isPreviewShadowControlPlaneOnly(env: Environment): boolean {
  return (
    env.VERCEL === "1" &&
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_TARGET_ENV === "staging" &&
    env.VERCEL_PROJECT_ID === CANONICAL_VERCEL_DEPLOYMENT_IDENTITY.projectId &&
    env.VERCEL_GIT_REPO_OWNER ===
      CANONICAL_VERCEL_DEPLOYMENT_IDENTITY.repositoryOwner &&
    env.VERCEL_GIT_REPO_SLUG ===
      CANONICAL_VERCEL_DEPLOYMENT_IDENTITY.repositorySlug &&
    env.MEELNI_ENV_PULL_ENVIRONMENT === "preview" &&
    env.MEELNI_PREVIEW_SHADOW_REHEARSAL_SERVER === "enabled" &&
    env.MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_ONLY === "enabled"
  );
}
