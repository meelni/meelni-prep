"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  FeedbackActionItem,
  FeedbackSectionCard,
} from "@/components/feedback/feedback-surface";
import { ComparisonData } from "@/lib/types/comparison";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Check,
  ArrowRight,
  Calendar,
  MessageSquare,
  Lightbulb,
  ClipboardList,
  Target,
  Eye,
  Users,
} from "lucide-react";

interface AttemptComparisonProps {
  comparison: ComparisonData;
}

export function AttemptComparison({ comparison }: AttemptComparisonProps) {
  const { session1, session2, scoreDelta } = comparison;
  const shouldReduceMotion = useReducedMotion();

  // Helper function to render score delta badge
  const renderScoreDelta = (delta: number | null) => {
    if (delta === null || delta === 0) {
      return (
        <Badge className="bg-muted/50 text-muted-foreground border-border/50">
          <Minus className="mr-1 h-3 w-3" />
          No change
        </Badge>
      );
    }

    const isPositive = delta > 0;
    const bgColor = isPositive ? "bg-success/10" : "bg-destructive/10";
    const textColor = isPositive ? "text-success" : "text-destructive";
    const borderColor = isPositive
      ? "border-success/20"
      : "border-destructive/20";
    const Icon = isPositive ? TrendingUp : TrendingDown;

    return (
      <Badge className={`${bgColor} ${textColor} ${borderColor}`}>
        <Icon className="mr-1 h-3 w-3" />
        {delta > 0 ? "+" : ""}
        {delta}
      </Badge>
    );
  };

  // Helper function to render score with progress bar
  const renderScore = (
    score: number | null,
    label: string,
    icon: React.ReactNode
  ) => {
    if (score === null) return null;

    const percentage = (score / 10) * 100;
    const colorClass =
      percentage >= 80
        ? "bg-success"
        : percentage >= 60
          ? "bg-info"
          : percentage >= 40
            ? "bg-warning"
            : "bg-destructive";

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-foreground font-medium">{label}</span>
          </div>
          <span className="text-muted-foreground">{score}/10</span>
        </div>
        <div className="bg-muted/30 h-2 overflow-hidden rounded-full">
          <motion.div
            className={`h-full ${colorClass}`}
            initial={shouldReduceMotion ? false : { width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.5,
              ease: "easeOut",
            }}
          />
        </div>
      </div>
    );
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const renderAttemptDetails = (
    session: typeof session1,
    latest: boolean,
    delta?: typeof scoreDelta
  ) => (
    <>
      {session.scores.overall !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-foreground flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="text-primary h-4 w-4" />
              Overall Score
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-primary text-2xl font-bold">
                {session.scores.overall}/10
              </span>
              {delta && renderScoreDelta(delta.overall)}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {[
          {
            key: "structure",
            label: "Structure",
            value: session.scores.structure,
            delta: delta?.structure,
            icon: <Target className="text-muted-foreground h-4 w-4" />,
          },
          {
            key: "clarity",
            label: "Clarity",
            value: session.scores.clarity,
            delta: delta?.clarity,
            icon: <Eye className="text-muted-foreground h-4 w-4" />,
          },
          {
            key: "insight",
            label: "Insight",
            value: session.scores.insight,
            delta: delta?.insight,
            icon: <Lightbulb className="text-muted-foreground h-4 w-4" />,
          },
          {
            key: "communication",
            label: "Communication",
            value: session.scores.communication,
            delta: delta?.communication,
            icon: <MessageSquare className="text-muted-foreground h-4 w-4" />,
          },
          {
            key: "leadership",
            label: "Leadership",
            value: session.scores.leadership,
            delta: delta?.leadership,
            icon: <Users className="text-muted-foreground h-4 w-4" />,
          },
        ].map((score) => (
          <div key={score.key} className="space-y-2">
            {renderScore(score.value, score.label, score.icon)}
            {delta && (
              <div className="flex justify-end">
                {renderScoreDelta(score.delta ?? null)}
              </div>
            )}
          </div>
        ))}
      </div>

      {session.keyQuotes.length > 0 && (
        <div className="border-border/50 space-y-3 border-t pt-4">
          <h4 className="text-foreground text-sm font-semibold">Key Quotes</h4>
          <div className="space-y-2">
            {session.keyQuotes.slice(0, 2).map((quote, idx) => (
              <div
                key={idx}
                className={`rounded-lg border p-3 ${
                  latest
                    ? "border-primary/10 bg-primary/5"
                    : "border-border/30 bg-muted/30"
                }`}
              >
                <p className="text-muted-foreground line-clamp-2 text-xs">
                  &quot;{quote}&quot;
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {session.feedback.strengths.length > 0 && (
        <div className="border-border/50 space-y-3 border-t pt-4">
          <h4 className="text-foreground text-sm font-semibold">Strengths</h4>
          <ul className="space-y-2">
            {session.feedback.strengths.slice(0, 3).map((strength, idx) => (
              <FeedbackActionItem
                key={idx}
                tone="success"
                className="border-0 bg-transparent p-0 text-xs"
                icon={
                  <Check
                    className="text-success mt-0.5 h-4 w-4"
                    aria-hidden="true"
                  />
                }
              >
                {strength}
              </FeedbackActionItem>
            ))}
          </ul>
        </div>
      )}

      {session.feedback.improvements.length > 0 && (
        <div className="border-border/50 space-y-3 border-t pt-4">
          <h4 className="text-foreground text-sm font-semibold">
            Areas for Improvement
          </h4>
          <ul className="space-y-2">
            {session.feedback.improvements
              .slice(0, 3)
              .map((improvement, idx) => (
                <FeedbackActionItem
                  key={idx}
                  tone="warning"
                  className="border-0 bg-transparent p-0 text-xs"
                  icon={
                    <ArrowRight
                      className="text-warning mt-0.5 h-4 w-4"
                      aria-hidden="true"
                    />
                  }
                >
                  {improvement}
                </FeedbackActionItem>
              ))}
          </ul>
        </div>
      )}
    </>
  );

  return (
    <motion.div
      variants={staggerContainer}
      initial={shouldReduceMotion ? false : "initial"}
      animate="animate"
      className="space-y-6"
    >
      {/* Comparison Header */}
      <motion.div variants={fadeInUp} className="space-y-2 text-center">
        <h2 className="text-foreground text-2xl font-semibold">
          Attempt Comparison
        </h2>
        <p className="text-muted-foreground text-sm">
          Visualize your improvement over time
        </p>
      </motion.div>

      {/* Side-by-Side Comparison */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Session 1 */}
        <motion.div variants={fadeInUp}>
          <FeedbackSectionCard
            title="Attempt 1"
            description={
              <span className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                {formatDate(session1.startedAt)}
              </span>
            }
            action={
              <Badge className="border-border/50 bg-muted/50 text-muted-foreground">
                Earlier
              </Badge>
            }
            className="h-full"
            contentClassName="space-y-6"
          >
            {renderAttemptDetails(session1, false)}
          </FeedbackSectionCard>
        </motion.div>

        {/* Session 2 */}
        <motion.div variants={fadeInUp}>
          <FeedbackSectionCard
            title="Attempt 2"
            description={
              <span className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                {formatDate(session2.startedAt)}
              </span>
            }
            action={
              <Badge className="border-primary/20 bg-primary/10 text-primary">
                Latest
              </Badge>
            }
            className="border-primary/20 ring-primary/10 h-full ring-1"
            contentClassName="space-y-6"
          >
            {renderAttemptDetails(session2, true, scoreDelta)}
          </FeedbackSectionCard>
        </motion.div>
      </div>

      {/* Summary Section */}
      {session2.feedback.summary && (
        <motion.div variants={fadeInUp}>
          <FeedbackSectionCard title="Progress Summary">
            <p className="text-muted-foreground text-sm">
              {session2.feedback.summary}
            </p>
          </FeedbackSectionCard>
        </motion.div>
      )}
    </motion.div>
  );
}
