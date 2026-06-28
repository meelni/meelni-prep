"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Lightbulb,
  Target,
  BookOpen,
  Sparkles,
  RefreshCw,
} from "lucide-react";

interface FeedbackProps {
  feedback: {
    structureScore: number | null;
    clarityScore: number | null;
    insightScore: number | null;
    communicationScore: number | null;
    leadershipScore: number | null;
    overallScore: string | null;
    strengths: string[] | null;
    improvements: string[] | null;
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
      <Card className="p-12 bg-surface/30 border-border/30">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <div className="space-y-3">
            <h3 className="text-2xl font-semibold text-foreground">
              Generate AI Feedback
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Get detailed scores and personalized improvement suggestions powered
              by GPT-4 Turbo
            </p>
          </div>
          {onGenerate && (
            <Button
              onClick={onGenerate}
              disabled={generating}
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {generating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Interview...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Feedback
                </>
              )}
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const scores = {
    Structure: feedback.structureScore,
    Clarity: feedback.clarityScore,
    Insight: feedback.insightScore,
    Communication: feedback.communicationScore,
    Leadership: feedback.leadershipScore,
  };

  const strengths = Array.isArray(feedback.strengths)
    ? feedback.strengths
    : [];
  const improvements = Array.isArray(feedback.improvements)
    ? feedback.improvements
    : [];
  const drills = Array.isArray(feedback.drills) ? feedback.drills : [];

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, type: "spring" }}
      >
        <Card className="p-8 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <div className="text-center space-y-3">
            <div className="text-6xl font-bold text-primary">
              {parseFloat(feedback.overallScore || "0").toFixed(1)}
              <span className="text-3xl text-muted-foreground">/10</span>
            </div>
            <p className="text-lg font-medium text-foreground">
              Overall Score
            </p>
            {feedback.summary && (
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                {feedback.summary}
              </p>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Individual Scores */}
      <Card className="p-6 bg-surface/50 border-border/50">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Competency Breakdown
        </h3>
        <div className="space-y-4">
          {Object.entries(scores).map(([competency, score], index) => (
            <motion.div
              key={competency}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
              className="space-y-2"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">
                  {competency}
                </span>
                <span className="text-sm font-bold text-primary">
                  {score}/10
                </span>
              </div>
              <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${((score || 0) / 10) * 100}%` }}
                  transition={{ delay: index * 0.1 + 0.2, duration: 0.5 }}
                  className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </Card>

      {/* Strengths */}
      {strengths.length > 0 && (
        <Card className="p-6 bg-green-500/5 border-green-500/20">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <h3 className="text-lg font-semibold text-foreground">Strengths</h3>
          </div>
          <ul className="space-y-3">
            {strengths.map((strength, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
                className="flex items-start gap-3"
              >
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                <p className="text-sm text-foreground">{strength}</p>
              </motion.li>
            ))}
          </ul>
        </Card>
      )}

      {/* Improvements */}
      {improvements.length > 0 && (
        <Card className="p-6 bg-orange-500/5 border-orange-500/20">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-semibold text-foreground">
              Areas for Improvement
            </h3>
          </div>
          <ul className="space-y-3">
            {improvements.map((improvement, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
                className="flex items-start gap-3"
              >
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                <p className="text-sm text-foreground">{improvement}</p>
              </motion.li>
            ))}
          </ul>
        </Card>
      )}

      {/* Practice Drills */}
      {drills.length > 0 && (
        <Card className="p-6 bg-blue-500/5 border-blue-500/20">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-foreground">
              Recommended Drills
            </h3>
          </div>
          <ul className="space-y-3">
            {drills.map((drill, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
                className="flex items-start gap-3"
              >
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                <p className="text-sm text-foreground">{drill}</p>
              </motion.li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
