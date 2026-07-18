import { FEATURE_GATES } from "./gates";
import { getFeatureFlagBootstrap } from "./server-bootstrap";

export async function isPublicDemoEnabled(): Promise<boolean> {
  try {
    const flags = await getFeatureFlagBootstrap();
    return flags.values[FEATURE_GATES.meelniReactivationAccess] === true;
  } catch {
    return false;
  }
}
