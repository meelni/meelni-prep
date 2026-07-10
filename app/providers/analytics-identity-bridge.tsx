"use client";

import { useEffect, useRef } from "react";
import { useAnalyticsConsent } from "@/app/providers/analytics-consent-provider";
import { useAuth } from "@/app/providers/auth-provider";
import { analytics } from "@/lib/analytics/analytics-service";
import { usePostHogRuntimeReady } from "@/lib/analytics/posthog-provider";
import { shouldEmitAuthTransition } from "@/lib/analytics/auth-transition";

export function AnalyticsIdentityBridge() {
  const { authTransition, user } = useAuth();
  const { analyticsPseudonym, decision, resolved, resolvedForUserId } =
    useAnalyticsConsent();
  const runtimeReady = usePostHogRuntimeReady();
  const handledTransitionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!resolved || decision !== "accepted" || !runtimeReady) return;
    if (!user) return;
    if (resolvedForUserId !== user.id || !analyticsPseudonym) return;
    analytics.identify(analyticsPseudonym, {
      signup_method:
        user.app_metadata.provider === "google" ? "google" : "email",
    });
    if (
      shouldEmitAuthTransition(
        authTransition,
        user.id,
        resolvedForUserId,
        handledTransitionRef.current
      )
    ) {
      analytics.track(
        authTransition.type === "signup"
          ? "auth_signup_completed"
          : "auth_signin_completed",
        { method: authTransition.method }
      );
      handledTransitionRef.current = authTransition.id;
    }
  }, [
    analyticsPseudonym,
    authTransition,
    decision,
    resolved,
    resolvedForUserId,
    runtimeReady,
    user,
  ]);
  return null;
}
