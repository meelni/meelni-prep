import { useRef, useState } from "react";
import { EndSessionModal } from "@/app/interview/components/end-session-modal";
import { InterviewControls } from "@/app/interview/components/interview-controls";
import { InterviewRoomSurface } from "@/app/interview/components/interview-room-surface";
import { TimerDisplay } from "@/app/interview/components/timer-display";
import { TranscriptPanel } from "@/app/interview/components/transcript-panel";
import { ExploreClient } from "@/app/explore/explore-client";
import { SetupContent } from "@/app/setup/setup-content";
import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { OverviewSection } from "@/components/dashboard/sections/overview";
import { SettingsSection } from "@/components/dashboard/sections/settings";
import { CompletedV2Review } from "@/components/feedback/feedback-completed-review";
import type { HintMode } from "@meelni/core";

import {
  completedFeedback,
  dashboardSessions,
  publicQuestions,
  transcriptTurns,
} from "./fixtures";

export const HARNESS_SCENARIOS = [
  "explore",
  "dashboard",
  "new-interview",
  "interview",
  "feedback",
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
  activeSection: "overview" | "new-interview" | "settings";
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
  const [hintMode, setHintMode] = useState<HintMode>("off");
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
            hintMode={hintMode}
            onHintModeChange={setHintMode}
            onToggleMute={() => setIsMuted((current) => !current)}
            onEndSession={() => {
              endTriggerRef.current = document.activeElement as HTMLElement;
              setShowEndModal(true);
            }}
          />
        }
        deadlineReached={false}
        hintMode={hintMode}
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
    case "new-interview":
      return <NewInterviewScenario />;
    case "interview":
      return <InterviewScenario />;
    case "feedback":
      return <FeedbackScenario />;
    case "settings":
      return <SettingsScenario />;
  }
}
