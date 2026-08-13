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
  const presentedAtRef = useRef(Date.now());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? (
    <FeedbackReviewAnalyticsTracker
      outcome={outcome}
      presentedAt={presentedAtRef.current}
    />
  ) : null;
}

function FeedbackReviewAnalyticsTracker({
  outcome,
  presentedAt,
}: {
  outcome: FeedbackQualityOutcome;
  presentedAt: number;
}) {
  const { consent, decision, resolved, resolvedForUserId } =
    useAnalyticsConsent();
  const runtimeReady = usePostHogRuntimeReady();
  const subjectRef = useRef<string | null>(null);
  const emittedRef = useRef(false);

  useEffect(() => {
    if (!resolved || !resolvedForUserId || emittedRef.current) return;
    subjectRef.current ??= resolvedForUserId;
    if (subjectRef.current !== resolvedForUserId || decision !== "accepted") {
      return;
    }
    const decidedAt = new Date(consent.decidedAt ?? "").getTime();
    if (
      !Number.isFinite(decidedAt) ||
      decidedAt >= presentedAt ||
      !runtimeReady
    ) {
      return;
    }
    emittedRef.current = true;
    analytics.track("feedback_viewed", { outcome });
  }, [
    consent.decidedAt,
    decision,
    outcome,
    presentedAt,
    resolved,
    resolvedForUserId,
    runtimeReady,
  ]);

  return null;
}
