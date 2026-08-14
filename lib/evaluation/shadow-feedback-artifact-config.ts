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

/**
 * Storage is disabled unless the server-only value is exactly `enabled`.
 * Unknown values fail closed instead of becoming truthy feature flags.
 * Deliberately accepts no environment override: production capabilities can
 * only be minted from the current server process configuration.
 */
export function getShadowFeedbackArtifactStorageGate(): ShadowFeedbackArtifactStorageGate {
  const configured = process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE;
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
