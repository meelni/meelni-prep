import { useRef, useState } from "react";
import { EndSessionModal } from "@/app/interview/components/end-session-modal";
import { InterviewControls } from "@/app/interview/components/interview-controls";
import { InterviewRoomSurface } from "@/app/interview/components/interview-room-surface";
import { TimerDisplay } from "@/app/interview/components/timer-display";
import { TranscriptPanel } from "@/app/interview/components/transcript-panel";
import { groupTranscriptTurns } from "@/app/interview/components/transcript-display";
import { ExploreClient } from "@/app/explore/explore-client";
import { SetupContent } from "@/app/setup/setup-content";
import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { AnalyticsSection } from "@/components/dashboard/sections/analytics";
import { HistorySection } from "@/components/dashboard/sections/history";
import { OverviewSection } from "@/components/dashboard/sections/overview";
import { QuestionsSection } from "@/components/dashboard/sections/questions";
import { SettingsSection } from "@/components/dashboard/sections/settings";
import {
  CompletedDimensionCoverageReview,
  CompletedV2Review,
} from "@/components/feedback/feedback-completed-review";
import { FeedbackComparisonReview } from "@/components/feedback/feedback-comparison-review";
import {
  FeedbackLifecycleStatus,
  FeedbackLoadingSkeleton,
} from "@/components/feedback/feedback-lifecycle-status";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { Button } from "@/components/ui/button";
import type { FeedbackViewState, SavedInterviewWorkspace } from "@meelni/core";

import {
  completedFeedback,
  coachingReviewFeedback,
  dashboardSessions,
  dashboardStatusSessions,
  fullScorecardFeedback,
  partialFeedback,
  partialScorecardFeedback,
  publicQuestions,
  transcriptTurns,
  verifiedPrefixCoachingReviewFeedback,
  verifiedPrefixPartialScorecardFeedback,
} from "./fixtures";

export const HARNESS_SCENARIOS = [
  "explore",
  "dashboard",
  "dashboard-statuses",
  "history-statuses",
  "analytics",
  "question-bank",
  "new-interview",
  "interview",
  "feedback",
  "feedback-partial",
  "feedback-full-scorecard",
  "feedback-partial-scorecard",
  "feedback-verified-prefix-partial-scorecard",
  "feedback-focused-practice-unavailable",
  "feedback-coaching-review",
  "feedback-verified-prefix-coaching-review",
  "feedback-insufficient",
  "feedback-integrity",
  "feedback-loading",
  "feedback-pending",
  "feedback-processing",
  "feedback-processing-workspace",
  "feedback-processing-workspace-paused",
  "feedback-failed",
  "feedback-unavailable",
  "feedback-compare",
  "consent-undecided",
  "consent-accepted",
  "consent-declined",
  "settings",
] as const;

export type HarnessScenario = (typeof HARNESS_SCENARIOS)[number];

function isHarnessScenario(value: string | null): value is HarnessScenario {
  return HARNESS_SCENARIOS.some((scenario) => scenario === value);
}

const dashboardStats = {
  totalSessions: dashboardSessions.length,
  totalMinutes: 30,
  avgScore: 7.6,
};

function Shell({
  activeSection,
  children,
}: {
  activeSection:
    | "overview"
    | "new-interview"
    | "questions"
    | "history"
    | "analytics"
    | "settings";
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout
      activeSection={activeSection}
      {...dashboardStats}
      user={{
        email: "candidate@example.test",
        user_metadata: { full_name: "Synthetic Candidate" },
      }}
    >
      {children}
    </DashboardLayout>
  );
}

function DashboardScenario() {
  return (
    <Shell activeSection="overview">
      <OverviewSection
        sessions={dashboardSessions}
        loadingSessions={false}
        {...dashboardStats}
        completionRate={100}
      />
    </Shell>
  );
}

function DashboardStatusesScenario() {
  return (
    <Shell activeSection="overview">
      <OverviewSection
        sessions={dashboardStatusSessions}
        loadingSessions={false}
        totalSessions={dashboardStatusSessions.length}
        totalMinutes={150}
        avgScore={7.6}
        completionRate={100}
      />
    </Shell>
  );
}

function HistoryStatusesScenario() {
  return (
    <Shell activeSection="history">
      <HistorySection
        sessions={dashboardStatusSessions}
        loadingSessions={false}
        pagination={{
          total: dashboardStatusSessions.length + 20,
          limit: 20,
          offset: 0,
          hasMore: true,
        }}
        onPageChange={() => undefined}
      />
    </Shell>
  );
}

function AnalyticsScenario() {
  return (
    <Shell activeSection="analytics">
      <AnalyticsSection />
    </Shell>
  );
}

function QuestionBankScenario() {
  return (
    <Shell activeSection="questions">
      <QuestionsSection />
    </Shell>
  );
}

function ExploreScenario() {
  return (
    <ExploreClient
      initialQuestions={publicQuestions}
      initialTotal={publicQuestions.length}
      initialLoadError={null}
    />
  );
}

function NewInterviewScenario() {
  return (
    <Shell activeSection="new-interview">
      <SetupContent voiceUnavailableInPreview={false} />
    </Shell>
  );
}

function InterviewScenario() {
  const [isMuted, setIsMuted] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [deadlineAt] = useState(() =>
    new Date(Date.now() + 30 * 60 * 1000).toISOString()
  );
  const endTriggerRef = useRef<HTMLElement | null>(null);

  return (
    <>
      <InterviewRoomSurface
        company="Acme"
        connectionIndicator={
          <span className="text-foreground text-sm">Connected</span>
        }
        connectionStatus="connected"
        controls={
          <InterviewControls
            isMuted={isMuted}
            onToggleMute={() => setIsMuted((current) => !current)}
            onEndSession={() => {
              endTriggerRef.current = document.activeElement as HTMLElement;
              setShowEndModal(true);
            }}
          />
        }
        deadlineReached={false}
        mediaVisualizer={
          <div
            role="img"
            aria-label="Live interviewer audio"
            className="from-primary/15 via-primary/5 to-background flex h-full items-center justify-center rounded-full bg-radial"
          >
            <div className="bg-primary h-28 w-28 rounded-full opacity-80" />
          </div>
        }
        question="Design a product that helps new parents find trusted support."
        roundType="product_sense"
        timer={
          <TimerDisplay
            deadlineAt={deadlineAt}
            onDeadlineReached={() => undefined}
          />
        }
        transcriptIntegrity="healthy"
        transcriptHydrationState="ready"
        transcriptPanel={<TranscriptPanel turns={transcriptTurns} />}
      />
      <EndSessionModal
        isOpen={showEndModal}
        capturedAnswerCount={
          groupTranscriptTurns(transcriptTurns).filter(
            (turn) => turn.speaker === "user"
          ).length
        }
        onClose={() => setShowEndModal(false)}
        onConfirm={() => setShowEndModal(false)}
        returnFocusRef={endTriggerRef}
      />
    </>
  );
}

function FeedbackScenario() {
  return <CompletedV2Review feedback={completedFeedback} partial={false} />;
}

function FeedbackPartialScenario() {
  return <CompletedV2Review feedback={partialFeedback} partial />;
}

type FeedbackLifecycleScenarioState = Exclude<
  FeedbackViewState,
  | { kind: "completed-full" }
  | { kind: "completed-partial" }
  | { kind: "completed-evidence-limited" }
  | { kind: "completed-full-scorecard" }
  | { kind: "completed-partial-scorecard" }
  | { kind: "completed-coaching-review" }
  | { kind: "completed-legacy" }
>;

function FeedbackLifecycleScenario({
  state,
  workspace,
  pollingPaused = false,
}: {
  state: FeedbackLifecycleScenarioState;
  workspace?: SavedInterviewWorkspace;
  pollingPaused?: boolean;
}) {
  return (
    <FeedbackLifecycleStatus
      state={state}
      workspace={workspace}
      sessionId="browser-qa-saved-interview"
      recovering={false}
      recoveryError={null}
      pollingPaused={pollingPaused}
      onRecover={() => undefined}
    />
  );
}

const savedInterviewWorkspace = {
  version: "saved-interview.workspace.v1",
  saved: true,
  roundType: "product_sense",
  question: {
    text: "How would you improve a synthetic planning product?",
    company: "Synthetic Co",
  },
  frozenTranscript: "ready",
} as const satisfies SavedInterviewWorkspace;

const longLifecycleMessage =
  "Your saved interview remains available while this intentionally long recovery message verifies strict responsive reflow without hiding the next action. " +
  "recovery-evidence-segment-".repeat(18);

function ConsentDecisionScenario() {
  return (
    <>
      <main
        aria-labelledby="consent-fixture-title"
        className="mx-auto min-h-[70vh] w-full max-w-5xl space-y-4 px-4 py-8 sm:px-6"
        data-consent-primary-content
      >
        <h1 id="consent-fixture-title" className="text-2xl font-semibold">
          Consent layout fixture
        </h1>
        <p className="text-muted-foreground max-w-3xl leading-6 wrap-anywhere">
          Synthetic primary content stays available without being covered by an
          analytics decision notice.
        </p>
        <Button type="button" className="min-h-11">
          Continue practice
        </Button>
      </main>
      <CookieConsentBanner />
    </>
  );
}

function SettingsScenario() {
  return (
    <Shell activeSection="settings">
      <SettingsSection />
    </Shell>
  );
}

export function BrowserQaScenario({ scenario }: { scenario: string | null }) {
  if (!isHarnessScenario(scenario)) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Unknown browser QA scenario</h1>
      </main>
    );
  }

  switch (scenario) {
    case "explore":
      return <ExploreScenario />;
    case "dashboard":
      return <DashboardScenario />;
    case "dashboard-statuses":
      return <DashboardStatusesScenario />;
    case "history-statuses":
      return <HistoryStatusesScenario />;
    case "analytics":
      return <AnalyticsScenario />;
    case "question-bank":
      return <QuestionBankScenario />;
    case "new-interview":
      return <NewInterviewScenario />;
    case "interview":
      return <InterviewScenario />;
    case "feedback":
      return <FeedbackScenario />;
    case "feedback-partial":
      return <FeedbackPartialScenario />;
    case "feedback-full-scorecard":
      return (
        <CompletedDimensionCoverageReview feedback={fullScorecardFeedback} />
      );
    case "feedback-partial-scorecard":
      return (
        <CompletedDimensionCoverageReview feedback={partialScorecardFeedback} />
      );
    case "feedback-verified-prefix-partial-scorecard":
      return (
        <CompletedDimensionCoverageReview
          feedback={verifiedPrefixPartialScorecardFeedback}
        />
      );
    case "feedback-focused-practice-unavailable":
      return (
        <CompletedDimensionCoverageReview feedback={partialScorecardFeedback} />
      );
    case "feedback-coaching-review":
      return (
        <CompletedDimensionCoverageReview feedback={coachingReviewFeedback} />
      );
    case "feedback-verified-prefix-coaching-review":
      return (
        <CompletedDimensionCoverageReview
          feedback={verifiedPrefixCoachingReviewFeedback}
        />
      );
    case "feedback-insufficient":
      return (
        <FeedbackLifecycleScenario
          state={{
            kind: "no-reviewable-answer",
            details: {
              outcome: "unable_to_review",
              scoreWithheldReason: "rubric_coverage",
              recovery: "start_another_interview",
            },
          }}
        />
      );
    case "feedback-integrity":
      return (
        <FeedbackLifecycleScenario
          state={{
            kind: "transcript-integrity-degraded",
            retryable: false,
            details: {
              outcome: "unable_to_review",
              scoreWithheldReason: "verified_evidence_integrity",
              recovery: "credit_returned",
            },
          }}
        />
      );
    case "feedback-loading":
      return <FeedbackLoadingSkeleton />;
    case "feedback-pending":
      return (
        <FeedbackLifecycleScenario
          state={{ kind: "pending", retryable: true, delayed: true }}
        />
      );
    case "feedback-processing":
      return (
        <FeedbackLifecycleScenario
          state={{ kind: "processing", retryable: true, delayed: true }}
        />
      );
    case "feedback-processing-workspace":
      return (
        <FeedbackLifecycleScenario
          state={{ kind: "processing", retryable: false, delayed: false }}
          workspace={savedInterviewWorkspace}
        />
      );
    case "feedback-processing-workspace-paused":
      return (
        <FeedbackLifecycleScenario
          state={{ kind: "processing", retryable: false, delayed: true }}
          workspace={savedInterviewWorkspace}
          pollingPaused
        />
      );
    case "feedback-failed":
      return (
        <FeedbackLifecycleScenario
          state={{
            kind: "failed-retryable",
            message: longLifecycleMessage,
            outcomeReason: "generation_failed",
          }}
        />
      );
    case "feedback-unavailable":
      return (
        <FeedbackLifecycleScenario
          state={{ kind: "unavailable", message: longLifecycleMessage }}
        />
      );
    case "feedback-compare":
      return <FeedbackComparisonReview />;
    case "consent-undecided":
    case "consent-accepted":
    case "consent-declined":
      return <ConsentDecisionScenario />;
    case "settings":
      return <SettingsScenario />;
  }
}
