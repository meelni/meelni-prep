import type {
  AnyFocusedPracticeAttempt,
  FeedbackQualityOutcome,
  FeedbackQualityReason,
  FeedbackQualityResponse,
} from "@meelni/core";

import { trackServerEvent } from "@/lib/analytics/posthog-server";
import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import { readUserAnalyticsConsent } from "@/lib/db/analytics-consent";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";

export async function trackFeedbackHelpfulnessResponded(
  input: {
    userId: string;
    outcome: FeedbackQualityOutcome;
    response: FeedbackQualityResponse;
    reason: FeedbackQualityReason | null;
  },
  deps: FeedbackQualityAnalyticsDependencies = feedbackQualityAnalyticsDependencies
): Promise<void> {
  await deliverFeedbackQualityAnalytics(
    "feedback_helpfulness_responded",
    {
      outcome: input.outcome,
      response: input.response,
      reason: input.reason ?? "not_provided",
    },
    input.userId,
    deps
  );
}

export async function trackFocusedPracticeStarted(
  input: {
    userId: string;
    attempt: AnyFocusedPracticeAttempt;
  },
  deps: FeedbackQualityAnalyticsDependencies = feedbackQualityAnalyticsDependencies
): Promise<void> {
  const outcome = readFocusedPracticeReviewOutcome(input.attempt);
  if (!outcome) return;
  await deliverFeedbackQualityAnalytics(
    "feedback_practice_started",
    { outcome, practice_kind: "focused_practice" },
    input.userId,
    deps
  );
}

export function readFocusedPracticeReviewOutcome(
  attempt: AnyFocusedPracticeAttempt
): "coaching_review" | null {
  if (
    attempt.contractVersion !== "focused-practice-attempt.v2" ||
    !("reviewOutcome" in attempt.feedbackVersion)
  ) {
    return null;
  }
  return attempt.feedbackVersion.reviewOutcome === "partial_scorecard" ||
    attempt.feedbackVersion.reviewOutcome === "coaching_review"
    ? "coaching_review"
    : null;
}

export interface FeedbackQualityAnalyticsDependencies {
  readConsent: typeof readUserAnalyticsConsent;
  isDeletionPending: typeof hasAccountDeletionTombstone;
  track: typeof trackServerEvent;
}

const feedbackQualityAnalyticsDependencies: FeedbackQualityAnalyticsDependencies =
  {
    readConsent: readUserAnalyticsConsent,
    isDeletionPending: hasAccountDeletionTombstone,
    track: trackServerEvent,
  };

async function deliverFeedbackQualityAnalytics(
  event: string,
  properties: Record<string, unknown>,
  userId: string,
  deps: FeedbackQualityAnalyticsDependencies
): Promise<void> {
  if (!process.env.POSTHOG_SERVER_KEY && !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return;
  }
  if (!process.env.ANALYTICS_PSEUDONYM_KEY) return;
  try {
    const [consent, deletionPending] = await Promise.all([
      deps.readConsent(userId),
      deps.isDeletionPending(userId),
    ]);
    if (deletionPending) return;
    await deps.track(event, properties, { userId }, consent);
  } catch (error) {
    console.error("[FeedbackQualityAnalytics] Optional delivery failed", {
      ...toSafeErrorLog(error),
    });
  }
}
