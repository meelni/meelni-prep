import { useRef, useState } from "react";
import { EndSessionModal } from "@/app/interview/components/end-session-modal";
import { InterviewControls } from "@/app/interview/components/interview-controls";
import { InterviewRoomSurface } from "@/app/interview/components/interview-room-surface";
import { TimerDisplay } from "@/app/interview/components/timer-display";
import { TranscriptPanel } from "@/app/interview/components/transcript-panel";
import { ExploreClient } from "@/app/explore/explore-client";
import { SetupContent } from "@/app/setup/setup-content";
import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { HistorySection } from "@/components/dashboard/sections/history";
import { OverviewSection } from "@/components/dashboard/sections/overview";
import { SettingsSection } from "@/components/dashboard/sections/settings";
import { CompletedV2Review } from "@/components/feedback/feedback-completed-review";
import { FeedbackComparisonReview } from "@/components/feedback/feedback-comparison-review";
import {
  FeedbackLifecycleStatus,
  FeedbackLoadingSkeleton,
} from "@/components/feedback/feedback-lifecycle-status";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { Button } from "@/components/ui/button";
import type { FeedbackViewState } from "@meelni/core";

import {
  completedFeedback,
  dashboardSessions,
  dashboardStatusSessions,
  partialFeedback,
  publicQuestions,
  transcriptTurns,
} from "./fixtures";

export const HARNESS_SCENARIOS = [
  "explore",
  "dashboard",
  "dashboard-statuses",
  "history-statuses",
  "new-interview",
  "interview",
  "feedback",
  "feedback-partial",
  "feedback-insufficient",
  "feedback-loading",
  "feedback-pending",
  "feedback-processing",
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
  activeSection: "overview" | "new-interview" | "history" | "settings";
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
      />
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
      <SetupContent />
    </Shell>
  );
}

function InterviewScenario() {
  const [isMuted, setIsMuted] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const endTriggerRef = useRef<HTMLElement | null>(null);

  return (
    <>
      <InterviewRoomSurface
        agentState="listening"
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
        recoveringConnection={false}
        roundType="product_sense"
        timer={
          <TimerDisplay
            deadlineAt="2099-07-18T01:00:00.000Z"
            onDeadlineReached={() => undefined}
          />
        }
        transcriptIntegrity="healthy"
        transcriptPanel={<TranscriptPanel turns={transcriptTurns} />}
      />
      <EndSessionModal
        isOpen={showEndModal}
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
  | { kind: "completed-legacy" }
>;

function FeedbackLifecycleScenario({
  state,
}: {
  state: FeedbackLifecycleScenarioState;
}) {
  return (
    <FeedbackLifecycleStatus
      state={state}
      recovering={false}
      recoveryError={null}
      onRecover={() => undefined}
    />
  );
}

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
    case "new-interview":
      return <NewInterviewScenario />;
    case "interview":
      return <InterviewScenario />;
    case "feedback":
      return <FeedbackScenario />;
    case "feedback-partial":
      return <FeedbackPartialScenario />;
    case "feedback-insufficient":
      return (
        <FeedbackLifecycleScenario
          state={{
            kind: "skipped-insufficient",
            details: {
              tier: "insufficient",
              reasons: [longLifecycleMessage],
              recommendations: [
                "Start another mock interview and answer at least one complete prompt before ending the session.",
              ],
            },
          }}
        />
      );
    case "feedback-loading":
      return <FeedbackLoadingSkeleton />;
    case "feedback-pending":
      return (
        <FeedbackLifecycleScenario
          state={{ kind: "pending", retryable: true }}
        />
      );
    case "feedback-processing":
      return (
        <FeedbackLifecycleScenario
          state={{ kind: "processing", retryable: true }}
        />
      );
    case "feedback-failed":
      return (
        <FeedbackLifecycleScenario
          state={{ kind: "failed-retryable", message: longLifecycleMessage }}
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
