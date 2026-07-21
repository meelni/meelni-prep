"use client";

import { useEffect } from "react";

import { useAnalyticsConsent } from "@/app/providers/analytics-consent-provider";
import { useAuth } from "@/app/providers/auth-provider";
import { analytics } from "@/lib/analytics/analytics-service";
import { usePostHogRuntimeReady } from "@/lib/analytics/posthog-provider";

export function AnalyticsIdentityBridge() {
  const { user } = useAuth();
  const { analyticsPseudonym, decision, resolved, resolvedForUserId } =
    useAnalyticsConsent();
  const runtimeReady = usePostHogRuntimeReady();

  useEffect(() => {
    if (
      !resolved ||
      decision !== "accepted" ||
      !runtimeReady ||
      !user ||
      resolvedForUserId !== user.id ||
      !analyticsPseudonym
    ) {
      return;
    }

    analytics.identify(analyticsPseudonym, {
      signup_method:
        user.app_metadata.provider === "google" ? "google" : "email",
    });
  }, [
    analyticsPseudonym,
    decision,
    resolved,
    resolvedForUserId,
    runtimeReady,
    user,
  ]);

  return null;
}
