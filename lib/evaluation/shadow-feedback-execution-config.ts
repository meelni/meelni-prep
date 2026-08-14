const enabledContexts = new WeakSet<object>();
declare const shadowFeedbackExecutionContextBrand: unique symbol;

export interface ShadowFeedbackExecutionEnabledContext {
  readonly [shadowFeedbackExecutionContextBrand]: true;
}

export type ShadowFeedbackExecutionGate =
  | {
      enabled: false;
      reason: "default_off" | "invalid_config";
    }
  | {
      enabled: true;
      context: ShadowFeedbackExecutionEnabledContext;
    };

/**
 * Execution is disabled unless the current server process is configured with
 * the exact value `enabled`. There is deliberately no environment override
 * argument: callers cannot mint a production capability from supplied data.
 */
export function getShadowFeedbackExecutionGate(): ShadowFeedbackExecutionGate {
  const configured = process.env.MEELNI_SHADOW_FEEDBACK_EXECUTION;
  if (configured === undefined || configured.trim() === "") {
    return { enabled: false, reason: "default_off" };
  }
  if (configured !== "enabled") {
    return { enabled: false, reason: "invalid_config" };
  }
  const context = Object.freeze({}) as ShadowFeedbackExecutionEnabledContext;
  enabledContexts.add(context);
  return { enabled: true, context };
}

export function isShadowFeedbackExecutionEnabledContext(
  value: unknown
): value is ShadowFeedbackExecutionEnabledContext {
  return (
    typeof value === "object" && value !== null && enabledContexts.has(value)
  );
}
