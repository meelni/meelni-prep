import { buildStatsigUser, getStatsigConfig } from "./config";
import { buildServerGateDeploymentContext } from "./server-deployment-context";
import { FEATURE_GATES } from "./gates";
import {
  resolveServerGate,
  type ServerGateResolution,
} from "./server-resolver";

interface ReactivationUser {
  id: string;
  email?: string | null;
  created_at?: string;
  app_metadata?: { provider?: string };
}

export async function resolveReactivationAccess(input: {
  user: ReactivationUser;
  localOverride?: string;
  env?: NodeJS.ProcessEnv;
  resolveGate?: typeof resolveServerGate;
}): Promise<ServerGateResolution> {
  const env = input.env ?? process.env;
  if (
    env.NODE_ENV === "development" &&
    (input.localOverride === "on" || input.localOverride === "off")
  ) {
    return { source: "statsig", value: input.localOverride === "on" };
  }

  const config = getStatsigConfig(env);
  const fallbackValue =
    env.MEELNI_REACTIVATION_DEFAULT?.trim().toLowerCase() === "true";
  return (input.resolveGate ?? resolveServerGate)({
    apiUrl: config.apiUrl?.startsWith("/") ? undefined : config.apiUrl,
    clientKey: config.enabled ? config.clientKey : "",
    gateName: FEATURE_GATES.meelniReactivationAccess,
    fallbackValue,
    ...buildServerGateDeploymentContext(env, config.environmentTier),
    user: buildStatsigUser({
      anonymousId: `authenticated:${input.user.id}`,
      user: input.user,
    }),
  });
}
