"use client";

import { Button } from "@/components/ui/button";
import {
  FeedbackScoreCard,
  FeedbackSectionCard,
  FeedbackStateCard,
} from "@/components/feedback/feedback-surface";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Lightbulb,
  Target,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { projectFeedbackItems } from "@meelni/core";

interface FeedbackProps {
  feedback: {
    structureScore: number | null;
    clarityScore: number | null;
    insightScore: number | null;
    communicationScore: number | null;
    leadershipScore: number | null;
    overallScore: string | null;
    strengths: unknown;
    improvements: unknown;
    drills: string[] | null;
    summary: string | null;
  } | null;
  onGenerate?: () => void;
  generating?: boolean;
}

export function FeedbackDisplay({
  feedback,
  onGenerate,
  generating,
}: FeedbackProps) {
  if (!feedback) {
    return (
      <FeedbackStateCard
        icon={<Sparkles className="h-10 w-10" />}
        title="Generate AI Feedback"
        description="Get detailed scores and personalized improvement suggestions powered by GPT-4 Turbo"
        action={
          onGenerate && (
            <Button onClick={onGenerate} disabled={generating} size="lg">
              {generating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing Interview...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Feedback
                </>
              )}
            </Button>
          )
        }
      />
    );
  }

  const scores = {
    Structure: feedback.structureScore,
    Clarity: feedback.clarityScore,
    Insight: feedback.insightScore,
    Communication: feedback.communicationScore,
    Leadership: feedback.leadershipScore,
  };

  const strengths = projectFeedbackItems(feedback.strengths);
  const improvements = projectFeedbackItems(feedback.improvements);
  const recommendations = Array.isArray(feedback.drills)
    ? feedback.drills
    : [];

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, type: "spring" }}
      >
        <FeedbackScoreCard
          score={
            <>
              {parseFloat(feedback.overallScore || "0").toFixed(1)}
              <span className="text-muted-foreground text-3xl">/10</span>
            </>
          }
          label="Overall Score"
          description={feedback.summary || undefined}
        />
      </motion.div>

      {/* Individual Scores */}
      <FeedbackSectionCard
        title="Competency Breakdown"
        contentClassName="space-y-4"
      >
        <div className="space-y-4">
          {Object.entries(scores).map(([competency, score], index) => (
            <motion.div
              key={competency}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-foreground text-sm font-medium">
                  {competency}
                </span>
                <span className="text-primary text-sm font-bold">
                  {score}/10
                </span>
              </div>
              <div className="bg-muted/30 h-2 overflow-hidden rounded-full">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${((score || 0) / 10) * 100}%` }}
                  transition={{ delay: index * 0.1 + 0.2, duration: 0.5 }}
                  className="from-primary to-primary/70 h-full rounded-full bg-gradient-to-r"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </FeedbackSectionCard>

      {/* Strengths */}
      {strengths.length > 0 && (
        <FeedbackSectionCard
          title="Strengths"
          icon={<TrendingUp className="h-5 w-5" />}
          tone="success"
        >
          <ul className="space-y-3">
            {strengths.map((strength, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
                className="flex items-start gap-3"
              >
                <div className="bg-success mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full" />
                <p className="text-foreground text-sm">{strength}</p>
              </motion.li>
            ))}
          </ul>
        </FeedbackSectionCard>
      )}

      {/* Improvements */}
      {improvements.length > 0 && (
        <FeedbackSectionCard
          title="Areas for Improvement"
          icon={<Lightbulb className="h-5 w-5" />}
          tone="warning"
        >
          <ul className="space-y-3">
            {improvements.map((improvement, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
                className="flex items-start gap-3"
              >
                <div className="bg-warning mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full" />
                <p className="text-foreground text-sm">{improvement}</p>
              </motion.li>
            ))}
          </ul>
        </FeedbackSectionCard>
      )}

      {/* Focused practice recommendations */}
      {recommendations.length > 0 && (
        <FeedbackSectionCard
          title="Practice Recommendations"
          icon={<Target className="h-5 w-5" />}
          tone="info"
        >
          <ul className="space-y-3">
            {recommendations.map((recommendation, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
                className="flex items-start gap-3"
              >
                <div className="bg-info mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full" />
                <p className="text-foreground text-sm">{recommendation}</p>
              </motion.li>
            ))}
          </ul>
        </FeedbackSectionCard>
      )}
    </div>
  );
}
