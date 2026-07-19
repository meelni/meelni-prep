export const REACTIVATION_LAUNCH_STATE_USER_ID = "public-launch-state";

export function buildReactivationLaunchStateIdentity() {
  return { userID: REACTIVATION_LAUNCH_STATE_USER_ID };
}
