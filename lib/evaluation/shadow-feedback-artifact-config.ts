const enabledContexts = new WeakSet<object>();
declare const shadowFeedbackArtifactStorageContextBrand: unique symbol;

export interface ShadowFeedbackArtifactStorageEnabledContext {
  readonly [shadowFeedbackArtifactStorageContextBrand]: true;
}

export type ShadowFeedbackArtifactStorageGate =
  | {
      enabled: false;
      reason: "default_off" | "invalid_config";
    }
  | {
      enabled: true;
      context: ShadowFeedbackArtifactStorageEnabledContext;
    };

export interface ShadowFeedbackArtifactStorageEnvironment {
  [key: string]: string | undefined;
  MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE?: string;
}

/**
 * Storage is disabled unless the server-only value is exactly `enabled`.
 * Unknown values fail closed instead of becoming truthy feature flags.
 */
export function getShadowFeedbackArtifactStorageGate(
  env: ShadowFeedbackArtifactStorageEnvironment = process.env
): ShadowFeedbackArtifactStorageGate {
  const configured = env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE;
  if (configured === undefined || configured.trim() === "") {
    return { enabled: false, reason: "default_off" };
  }
  if (configured !== "enabled") {
    return { enabled: false, reason: "invalid_config" };
  }
  const context = Object.freeze(
    {}
  ) as ShadowFeedbackArtifactStorageEnabledContext;
  enabledContexts.add(context);
  return { enabled: true, context };
}

export function isShadowFeedbackArtifactStorageEnabledContext(
  value: unknown
): value is ShadowFeedbackArtifactStorageEnabledContext {
  return (
    typeof value === "object" && value !== null && enabledContexts.has(value)
  );
}
