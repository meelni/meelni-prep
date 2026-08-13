"use client";

import { CheckCircle2, ClipboardCheck, TrendingUp } from "lucide-react";

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
import { FEEDBACK_DIMENSIONS } from "@meelni/core";
import type {
  FeedbackDimension,
  FeedbackDimensionCoverageView,
  FeedbackEvidenceLimitedView,
  FeedbackLegacyView,
  FeedbackV2View,
} from "@meelni/core";

const DIMENSION_LABELS: Record<FeedbackDimension, string> = {
  structure: "Structure",
  clarity: "Clarity",
  insight: "Insight",
  communication: "Communication",
  leadership: "Leadership",
};

export function CompletedDimensionCoverageReview({
  feedback,
}: {
  feedback: FeedbackDimensionCoverageView;
}) {
  const transcript = useEvidenceTranscript(feedback.sessionId);
  const isFull = feedback.mode === "full_scorecard";
  const isPartial = feedback.mode === "partial_scorecard";

  return (
    <FeedbackReviewShell
      title={isFull ? "Interview scorecard" : "Interview feedback"}
      description="A round-specific review grounded in the answers that were recorded."
      action={<FeedbackDashboardLink />}
    >
      <div className="space-y-8">
        <StatusPill
          tone={isFull ? "success" : isPartial ? "warning" : "muted"}
          className={isFull ? "text-foreground" : undefined}
        >
          {isFull
            ? "Full scorecard"
            : isPartial
              ? "Partial scorecard"
              : "Coaching review"}
        </StatusPill>

        <FeedbackSectionCard
          title={
            isFull
              ? "Complete dimension coverage"
              : isPartial
                ? "Scores limited to supported dimensions"
                : "Grounded coaching without scores"
          }
          tone={isFull ? "success" : "warning"}
        >
          <p className="text-muted-foreground leading-6">{feedback.summary}</p>
        </FeedbackSectionCard>

        <FeedbackSectionCard
          title={isFull ? "Interview score" : "Rubric-dimension coverage"}
          description="Coverage reflects exact candidate evidence for this interview round."
          icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />}
          contentClassName="space-y-5"
        >
          {isFull && feedback.overallScore !== null && (
            <div className="border-border mb-2 border-b pb-5">
              <p className="text-primary font-mono text-5xl leading-none font-bold sm:text-6xl">
                {feedback.overallScore.toFixed(1)}
              </p>
              <p className="text-foreground mt-2 text-sm font-semibold">
                Overall score
              </p>
              <p className="text-muted-foreground mt-1 text-xs">out of 10</p>
            </div>
          )}

          {FEEDBACK_DIMENSIONS.map((dimension) => {
            const result = feedback.dimensions[dimension];
            return (
              <section
                key={dimension}
                aria-labelledby={`coverage-${dimension}`}
                className="border-border/50 bg-background/50 space-y-4 rounded-lg border p-4"
              >
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2
                      id={`coverage-${dimension}`}
                      className="text-foreground font-medium"
                    >
                      {DIMENSION_LABELS[dimension]}
                    </h2>
                    <StatusPill
                      tone={
                        result.coverage === "sufficient"
                          ? "success"
                          : result.coverage === "partial"
                            ? "warning"
                            : "muted"
                      }
                    >
                      {coverageLabel(result.coverage)}
                    </StatusPill>
                  </div>
                  {result.score !== null && (
                    <span
                      className="font-mono font-semibold"
                      aria-label={`${DIMENSION_LABELS[dimension]} score ${result.score} out of 10`}
                    >
                      {result.score}/10
                    </span>
                  )}
                </div>

                {result.evidence.length > 0 ? (
                  <ul className="space-y-3">
                    {result.evidence.map((evidence) => (
                      <li
                        key={`${evidence.facetCode}:${evidence.answerBlockRef}`}
                        className="border-border/50 bg-muted/30 rounded-md border p-3"
                      >
                        <p className="text-muted-foreground text-sm font-medium">
                          {evidence.facetLabel}
                        </p>
                        <blockquote className="border-primary/40 text-foreground mt-2 border-l-2 pl-3 text-sm leading-6 wrap-anywhere">
                          “{evidence.evidenceText}”
                        </blockquote>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm leading-6">
                    No exact candidate evidence supported this dimension, so no
                    score was inferred.
                  </p>
                )}
              </section>
            );
          })}
        </FeedbackSectionCard>

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

function coverageLabel(
  coverage: FeedbackDimensionCoverageView["dimensions"][FeedbackDimension]["coverage"]
): string {
  if (coverage === "sufficient") return "Sufficient evidence";
  if (coverage === "partial") return "Partial evidence";
  return "No evidence";
}

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

export function CompletedEvidenceLimitedReview({
  feedback,
}: {
  feedback: FeedbackEvidenceLimitedView;
}) {
  const transcript = useEvidenceTranscript(feedback.sessionId);
  return (
    <FeedbackReviewShell
      title="Interview feedback"
      description="Useful observations grounded in the answer that was recorded."
      action={<FeedbackDashboardLink />}
    >
      <div className="space-y-8">
        <FeedbackSectionCard title="Evidence-limited review" tone="warning">
          <p className="text-muted-foreground leading-6">
            The recorded answer supports grounded coaching, but not honest
            numerical scores. No score has been inferred.
          </p>
        </FeedbackSectionCard>
        <FeedbackSectionCard title="Summary">
          <p className="text-foreground text-base leading-7 wrap-anywhere">
            {feedback.summary}
          </p>
        </FeedbackSectionCard>
        {feedback.strengths.length > 0 && (
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
        )}
        {feedback.improvements.length > 0 && (
          <FeedbackSectionCard
            title="What to try next"
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
        )}
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
