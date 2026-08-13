"use client";

import { useEffect, useRef, useState } from "react";

import { useAnalyticsConsent } from "@/app/providers/analytics-consent-provider";
import { analytics } from "@/lib/analytics/analytics-service";
import { usePostHogRuntimeReady } from "@/lib/analytics/posthog-provider";
import type { FeedbackQualityOutcome } from "@meelni/core";

export function FeedbackReviewAnalytics({
  outcome,
}: {
  outcome: FeedbackQualityOutcome;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <FeedbackReviewAnalyticsTracker outcome={outcome} /> : null;
}

function FeedbackReviewAnalyticsTracker({
  outcome,
}: {
  outcome: FeedbackQualityOutcome;
}) {
  const { decision, resolved, resolvedForUserId } = useAnalyticsConsent();
  const runtimeReady = usePostHogRuntimeReady();
  const eligibilityRef = useRef({
    subject: resolvedForUserId,
    eligible: resolved && resolvedForUserId !== null && decision === "accepted",
  });
  const emittedRef = useRef(false);

  useEffect(() => {
    if (
      !resolved ||
      !resolvedForUserId ||
      emittedRef.current ||
      !eligibilityRef.current.eligible ||
      eligibilityRef.current.subject !== resolvedForUserId ||
      decision !== "accepted" ||
      !runtimeReady
    ) {
      return;
    }
    emittedRef.current = true;
    analytics.track("feedback_viewed", { outcome });
  }, [decision, outcome, resolved, resolvedForUserId, runtimeReady]);

  return null;
}
