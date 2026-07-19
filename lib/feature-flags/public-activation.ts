export const PUBLIC_ACTIVATION_PAUSED_LABEL = "Practice currently paused";
export const PUBLIC_ACTIVATION_PAUSED_DESCRIPTION =
  "Meelni is not accepting new PM interview practice sessions or purchases right now.";

export interface PublicActivationDecision {
  canActivate: boolean;
  state: "available" | "paused";
}

export function resolvePublicActivationDecision(
  reactivationEnabled: boolean
): PublicActivationDecision {
  return reactivationEnabled
    ? { canActivate: true, state: "available" }
    : { canActivate: false, state: "paused" };
}
