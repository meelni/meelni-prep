"use client";

import { CheckCircle2, TrendingUp } from "lucide-react";

import { FocusedPracticeWorkspace } from "./focused-practice-workspace";
import { FeedbackFindingCard } from "./feedback-finding-card";
import { FeedbackDashboardLink } from "./feedback-navigation";
import { FeedbackScoreSummary } from "./feedback-score-summary";
import {
  FeedbackActionItem,
  FeedbackReviewShell,
  FeedbackSectionCard,
} from "./feedback-surface";
import {
  FeedbackTranscriptSection,
  useEvidenceTranscript,
} from "./feedback-transcript";
import { StatusPill } from "@/components/ui/app-surface";
import type { FeedbackLegacyView, FeedbackV2View } from "@meelni/core";

export function CompletedV2Review({
  feedback,
  partial,
}: {
  feedback: FeedbackV2View;
  partial: boolean;
}) {
  const transcript = useEvidenceTranscript(feedback.sessionId);

  return (
    <FeedbackReviewShell
      title="Interview feedback"
      description="See the result, supporting evidence, and one focused next practice."
      action={<FeedbackDashboardLink />}
    >
      <div className="space-y-8">
        <StatusPill
          tone={partial ? "warning" : "success"}
          className={!partial ? "text-foreground" : undefined}
        >
          {partial
            ? "Based on part of the interview"
            : "Based on the complete interview"}
        </StatusPill>

        {partial && (
          <FeedbackSectionCard
            title="Limited interview coverage"
            tone="warning"
          >
            <p className="text-muted-foreground leading-6">
              These observations cover only the recorded portion of this
              interview. They are not an assessment of a complete interview or a
              prediction of interview outcomes.
            </p>
          </FeedbackSectionCard>
        )}

        <FeedbackScoreSummary scores={feedback.scores} />

        <FeedbackSectionCard title="Summary">
          <p className="text-foreground text-base leading-7 wrap-anywhere">
            {feedback.summary}
          </p>
        </FeedbackSectionCard>

        <FeedbackSectionCard
          title="What worked"
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
          tone="success"
          contentClassName="space-y-6"
        >
          {feedback.strengths.map((finding, index) => (
            <FeedbackFindingCard
              key={`strength:${index}`}
              finding={finding}
              onEvidenceSelect={transcript.selectEvidence}
            />
          ))}
        </FeedbackSectionCard>

        <FeedbackSectionCard
          title="What to improve"
          icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
          tone="warning"
          contentClassName="space-y-6"
        >
          {feedback.improvements.map((finding, index) => (
            <FeedbackFindingCard
              key={`improvement:${index}`}
              finding={finding}
              onEvidenceSelect={transcript.selectEvidence}
            />
          ))}
        </FeedbackSectionCard>

        <FocusedPracticeWorkspace sourceSessionId={feedback.sessionId} />

        <FeedbackTranscriptSection
          expanded={transcript.expanded}
          onExpandedChange={transcript.setExpanded}
          loading={transcript.loading}
          error={transcript.error}
          navigationError={transcript.navigationError}
          turns={transcript.turns}
          onRetry={transcript.retry}
        />
      </div>
    </FeedbackReviewShell>
  );
}

export function CompletedLegacyReview({
  feedback,
}: {
  feedback: FeedbackLegacyView;
}) {
  return (
    <FeedbackReviewShell
      title="Historical feedback"
      description="This review was created before transcript-linked feedback was introduced."
      action={<FeedbackDashboardLink />}
    >
      <div className="space-y-8">
        <FeedbackSectionCard title="Historical feedback format" tone="warning">
          <p className="text-muted-foreground leading-6">
            These saved notes do not include verifiable transcript evidence or
            finding-level confidence. They are shown as historical feedback, not
            as transcript-grounded conclusions about this interview.
          </p>
        </FeedbackSectionCard>
        <FeedbackScoreSummary scores={feedback.scores} historical />
        <FeedbackSectionCard title="Historical summary">
          <p className="text-foreground leading-7 wrap-anywhere">
            {feedback.summary}
          </p>
        </FeedbackSectionCard>
        <HistoricalNotes title="What worked" notes={feedback.strengths} />
        <HistoricalNotes
          title="What to revisit"
          notes={feedback.improvements}
        />
      </div>
    </FeedbackReviewShell>
  );
}

function HistoricalNotes({ title, notes }: { title: string; notes: string[] }) {
  return (
    <FeedbackSectionCard title={title}>
      <ul className="space-y-3">
        {notes.map((note, index) => (
          <FeedbackActionItem key={`${index}:${title}`}>
            <span className="wrap-anywhere">{note}</span>
          </FeedbackActionItem>
        ))}
      </ul>
    </FeedbackSectionCard>
  );
}
