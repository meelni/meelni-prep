import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getStatsigConfig } from "./config";
import { FEATURE_GATES } from "./gates";
import { resolveServerGate } from "./server-resolver";
import { effectiveAnalyticsDecision } from "@/lib/analytics/consent-contract";
import { getTrustedServerAnalyticsConsentState } from "@/lib/analytics/trusted-consent";

export interface FeatureFlagBootstrap {
  source: "statsig" | "configured-default";
  values: Record<string, boolean>;
}

export const getFeatureFlagBootstrap = cache(
  async function getFeatureFlagBootstrap(): Promise<FeatureFlagBootstrap> {
    await connection();
    const config = getStatsigConfig();
    const serverApiUrl = config.apiUrl?.startsWith("/")
      ? undefined
      : config.apiUrl;
    const gateName = FEATURE_GATES.meelniReactivationAccess;
    const consentState = await getTrustedServerAnalyticsConsentState();
    const cookieStore = await cookies();
    const localOverride =
      process.env.NODE_ENV === "development"
        ? cookieStore.get(`meelni_feature_flag_${encodeURIComponent(gateName)}`)
            ?.value
        : undefined;
    const fallbackValue =
      process.env.MEELNI_REACTIVATION_DEFAULT?.trim().toLowerCase() === "true";
    const networkAllowed =
      consentState.resolved &&
      effectiveAnalyticsDecision(consentState.consent) === "accepted";
    const resolution =
      localOverride === "on" || localOverride === "off"
        ? {
            source: "statsig" as const,
            value: localOverride === "on",
          }
        : await resolveServerGate({
            apiUrl: serverApiUrl,
            clientKey: config.clientKey,
            fallbackValue,
            gateName,
            networkAllowed,
            user: { userID: "public-launch-state" },
          });

    return {
      source: resolution.source,
      values: {
        [gateName]: resolution.value,
      },
    };
  }
);
