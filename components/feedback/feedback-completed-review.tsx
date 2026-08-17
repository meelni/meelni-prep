"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  Quote,
  Target,
  TrendingUp,
} from "lucide-react";

import { FocusedPracticeWorkspace } from "./focused-practice-workspace";
import { FeedbackQualityControl } from "./feedback-quality-control";
import { FeedbackReviewAnalytics } from "./feedback-review-analytics";
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
import { Button } from "@/components/ui/button";
import { FEEDBACK_DIMENSIONS } from "@meelni/core";
import type {
  FeedbackDimension,
  FeedbackDimensionCoverageCoachingView,
  FeedbackDimensionCoverageView,
  FeedbackEvidenceLimitedView,
  FeedbackScoreWithheldReason,
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

  if (feedback.outcome === "coaching_review") {
    return (
      <FeedbackReviewShell
        title="Coaching review"
        description="Grounded PM coaching from the verified evidence in this interview."
        action={<FeedbackDashboardLink />}
      >
        <FeedbackReviewAnalytics outcome="coaching_review" />
        <div className="space-y-8">
          <StatusPill tone="warning">Coaching review</StatusPill>
          <FeedbackSectionCard title="Why there are no scores" tone="warning">
            <p className="text-muted-foreground leading-6">
              {scoreWithheldExplanation(feedback.scoreWithheldReason)}
            </p>
          </FeedbackSectionCard>

          {feedback.verifiedScope && (
            <VerifiedPrefixScopeCard scope={feedback.verifiedScope} />
          )}

          <FeedbackSectionCard
            title="Observed PM signals"
            description="Each signal is tied to an exact citation from this interview."
            icon={<Quote className="h-5 w-5" aria-hidden="true" />}
            contentClassName="space-y-6"
          >
            <EvidenceSupportExplanation />
            <ul className="space-y-5">
              {feedback.coachingSignals.map((signal) => (
                <li
                  key={`${signal.dimension}:${signal.label}:${signal.transcriptRef}`}
                  className="border-border/70 min-w-0 space-y-3 border-b pb-5 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill>
                      {DIMENSION_LABELS[signal.dimension]}
                    </StatusPill>
                    <StatusPill tone="success">Exact cited evidence</StatusPill>
                  </div>
                  <p className="text-foreground font-medium wrap-anywhere">
                    {signal.label}
                  </p>
                  <CitationBlock
                    citation={signal.citation}
                    actionLabel={`View ${signal.label} citation in transcript`}
                    onSelect={() =>
                      transcript.selectTranscriptRef(signal.transcriptRef)
                    }
                  />
                </li>
              ))}
            </ul>
          </FeedbackSectionCard>

          {feedback.prioritizedPracticeFocus && (
            <FeedbackSectionCard
              title="Prioritized practice focus"
              description="One grounded move to make more deliberate in your next answer."
              icon={<Target className="h-5 w-5" aria-hidden="true" />}
              tone="info"
              contentClassName="space-y-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill>
                  {
                    DIMENSION_LABELS[
                      feedback.prioritizedPracticeFocus.dimension
                    ]
                  }
                </StatusPill>
                <p className="text-foreground font-semibold wrap-anywhere">
                  {feedback.prioritizedPracticeFocus.title}
                </p>
              </div>
              <p className="text-foreground/90 leading-6 wrap-anywhere">
                {feedback.prioritizedPracticeFocus.guidance}
              </p>
              <p className="text-muted-foreground text-sm leading-6 wrap-anywhere">
                {feedback.prioritizedPracticeFocus.rationale}
              </p>
              <CitationBlock
                citation={feedback.prioritizedPracticeFocus.citation}
                actionLabel={`View ${DIMENSION_LABELS[feedback.prioritizedPracticeFocus.dimension]} practice-focus citation in transcript`}
                onSelect={() =>
                  transcript.selectTranscriptRef(
                    feedback.prioritizedPracticeFocus!.transcriptRef
                  )
                }
              />
            </FeedbackSectionCard>
          )}

          <FocusedPracticeWorkspace sourceSessionId={feedback.sessionId} />

          <FeedbackQualityControl
            sessionId={feedback.sessionId}
            outcome="coaching_review"
          />

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

  return (
    <FeedbackReviewShell
      title="Scorecard"
      description="Observed practice scores grounded in verified PM-rubric evidence from this interview."
      action={<FeedbackDashboardLink />}
    >
      <FeedbackReviewAnalytics outcome="scorecard" />
      <div className="space-y-8">
        <StatusPill tone="success" className="text-foreground">
          Scorecard
        </StatusPill>

        <FeedbackSectionCard title="What this scorecard means" tone="success">
          <p className="text-muted-foreground leading-6">
            Every PM rubric dimension had enough verified evidence for an
            observed practice score. These scores describe this interview, not a
            hiring decision.
          </p>
        </FeedbackSectionCard>

        <FeedbackSectionCard
          title="Observed practice scores"
          description="Every weighted dimension and the overall total are grounded in verified PM-rubric evidence."
          icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />}
          contentClassName="space-y-5"
        >
          <div className="border-border mb-2 border-b pb-5">
            <p className="text-primary font-mono text-5xl leading-none font-bold sm:text-6xl">
              {Math.round(feedback.scores.overall)}
            </p>
            <p className="text-foreground mt-2 text-sm font-semibold">
              Overall score
            </p>
            <p className="text-muted-foreground mt-1 text-xs">out of 10</p>
          </div>

          <dl className="space-y-4">
            {FEEDBACK_DIMENSIONS.map((dimension) => {
              const result = feedback.dimensions[dimension];
              return (
                <div
                  key={dimension}
                  className="border-border/50 bg-background/50 space-y-4 rounded-lg border p-4"
                >
                  <dt className="text-foreground flex min-w-0 flex-wrap items-center gap-2 font-medium">
                    {DIMENSION_LABELS[dimension]}
                    <StatusPill tone="success">Supported</StatusPill>
                  </dt>
                  <dd>
                    <span className="font-mono font-semibold">
                      {result.score}/10
                    </span>
                  </dd>

                  {result.evidence.length > 0 ? (
                    <dd>
                      <ul className="space-y-3">
                        {result.evidence.map((evidence) => (
                          <li
                            key={`${evidence.label}:${evidence.transcriptRef}`}
                            className="border-border/50 bg-muted/30 rounded-md border p-3"
                          >
                            <p className="text-muted-foreground text-sm font-medium">
                              {evidence.label}
                            </p>
                            <CitationBlock
                              citation={evidence.citation}
                              actionLabel={`View ${DIMENSION_LABELS[dimension]} ${evidence.label} citation in transcript`}
                              onSelect={() =>
                                transcript.selectTranscriptRef(
                                  evidence.transcriptRef
                                )
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    </dd>
                  ) : (
                    <dd className="text-muted-foreground text-sm leading-6">
                      Not enough verified evidence was available for a score in
                      this dimension.
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
        </FeedbackSectionCard>

        <FeedbackQualityControl
          sessionId={feedback.sessionId}
          outcome="scorecard"
        />

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

function VerifiedPrefixScopeCard({
  scope,
}: {
  scope: NonNullable<FeedbackDimensionCoverageCoachingView["verifiedScope"]>;
}) {
  return (
    <FeedbackSectionCard title="Verified interview scope" tone="info">
      <div className="space-y-2">
        <p className="text-foreground leading-6">
          Meelni reviewed only the completed answers it could verify.
        </p>
        {scope.excludedTail && (
          <p className="text-muted-foreground leading-6">
            The unfinished or unverified end of the interview stayed outside
            this review. It was not treated as negative evidence; only verified
            completed answers could support the coaching shown.
          </p>
        )}
      </div>
    </FeedbackSectionCard>
  );
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
      title="Scorecard"
      description="See the result, supporting evidence, and one focused next practice."
      action={<FeedbackDashboardLink />}
    >
      <FeedbackReviewAnalytics outcome="scorecard" />
      <div className="space-y-8">
        <StatusPill tone="success">Scorecard</StatusPill>
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
      title="Coaching review"
      description="Grounded PM coaching from the verified evidence in this interview."
      action={<FeedbackDashboardLink />}
    >
      <FeedbackReviewAnalytics outcome="coaching_review" />
      <div className="space-y-8">
        <StatusPill tone="warning">Coaching review</StatusPill>
        <FeedbackSectionCard title="Why there are no scores" tone="warning">
          <p className="text-muted-foreground leading-6">
            {scoreWithheldExplanation(feedback.scoreWithheldReason)}
          </p>
        </FeedbackSectionCard>
        {feedback.strengths.length > 0 && (
          <FeedbackSectionCard
            title="Observed PM signals"
            description="Each signal is tied to an exact citation from this interview."
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
            tone="success"
            contentClassName="space-y-6"
          >
            <EvidenceSupportExplanation />
            <ul className="space-y-5">
              {feedback.strengths.map((finding, index) => (
                <li
                  key={`${finding.dimension}:${finding.transcriptRef}:${index}`}
                  className="border-border/70 min-w-0 space-y-3 border-b pb-5 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill>
                      {DIMENSION_LABELS[finding.dimension]}
                    </StatusPill>
                    <StatusPill tone="success">Exact cited evidence</StatusPill>
                  </div>
                  <p className="text-foreground leading-7 wrap-anywhere">
                    {finding.observation}
                  </p>
                  <CitationBlock
                    citation={finding.citation}
                    actionLabel={`View ${DIMENSION_LABELS[finding.dimension]} ${finding.observation} signal citation in transcript`}
                    onSelect={() =>
                      transcript.selectTranscriptRef(finding.transcriptRef)
                    }
                  />
                </li>
              ))}
            </ul>
          </FeedbackSectionCard>
        )}
        <FeedbackSectionCard
          title="Prioritized practice focus"
          description="One grounded move to make more deliberate in your next answer."
          icon={<Target className="h-5 w-5" aria-hidden="true" />}
          tone="info"
          contentClassName="space-y-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill>
              {DIMENSION_LABELS[feedback.prioritizedPracticeFocus.dimension]}
            </StatusPill>
            <p className="text-foreground font-semibold wrap-anywhere">
              {feedback.prioritizedPracticeFocus.title}
            </p>
          </div>
          <p className="text-foreground/90 leading-6 wrap-anywhere">
            {feedback.prioritizedPracticeFocus.guidance}
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            This focus comes from one exact citation in this interview. It was
            not selected from a weakest score.
          </p>
          <CitationBlock
            citation={feedback.prioritizedPracticeFocus.citation}
            actionLabel={`View ${DIMENSION_LABELS[feedback.prioritizedPracticeFocus.dimension]} practice-focus citation in transcript`}
            onSelect={() =>
              transcript.selectTranscriptRef(
                feedback.prioritizedPracticeFocus.transcriptRef
              )
            }
          />
        </FeedbackSectionCard>
        <FocusedPracticeWorkspace sourceSessionId={feedback.sessionId} />
        <FeedbackQualityControl
          sessionId={feedback.sessionId}
          outcome="coaching_review"
        />
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

function scoreWithheldExplanation(
  reason: FeedbackScoreWithheldReason | null
): string {
  return reason === "verified_evidence_integrity"
    ? "The cited answers support useful coaching, but the complete saved interview evidence could not be verified strongly enough for reliable scores. This does not reflect poor performance."
    : "The verified interview evidence supports useful coaching, but not enough PM-rubric coverage for reliable numerical scores. This describes what this interview covered, not poor performance.";
}

function EvidenceSupportExplanation() {
  return (
    <p className="border-info/20 bg-info/5 text-muted-foreground rounded-lg border p-4 text-sm leading-6">
      <span className="text-foreground font-semibold">Evidence support</span>{" "}
      describes how directly a signal is tied to the cited part of this
      interview. It is not a skill rating, probability, or progress measure.
    </p>
  );
}

function CitationBlock({
  citation,
  actionLabel,
  onSelect,
}: {
  citation: string;
  actionLabel: string;
  onSelect: () => void;
}) {
  return (
    <figure className="border-primary/30 bg-muted/40 min-w-0 border-l-2 px-4 py-3">
      <blockquote className="text-foreground text-sm leading-6 wrap-anywhere">
        “{citation}”
      </blockquote>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-foreground/75 text-xs">
          Exact excerpt from your interview
        </span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto min-h-11 max-w-full px-0 [overflow-wrap:anywhere] whitespace-normal"
          aria-label={actionLabel}
          onClick={onSelect}
        >
          View in transcript
        </Button>
      </figcaption>
    </figure>
  );
}

export function CompletedLegacyReview({
  feedback,
}: {
  feedback: FeedbackLegacyView;
}) {
  return (
    <FeedbackReviewShell
      title="Scorecard"
      description="This review was created before transcript-linked feedback was introduced."
      action={<FeedbackDashboardLink />}
    >
      <FeedbackReviewAnalytics outcome="scorecard" />
      <div className="space-y-8">
        <StatusPill tone="success">Scorecard</StatusPill>
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
