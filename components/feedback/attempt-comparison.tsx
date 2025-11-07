"use client";

import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComparisonData } from "@/lib/types/comparison";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  MessageSquare,
  Award,
  Target,
  Eye,
  Users,
  Trophy,
} from "lucide-react";

interface AttemptComparisonProps {
  comparison: ComparisonData;
}

export function AttemptComparison({ comparison }: AttemptComparisonProps) {
  const { session1, session2, scoreDelta } = comparison;

  // Helper function to render score delta badge
  const renderScoreDelta = (delta: number | null) => {
    if (delta === null || delta === 0) {
      return (
        <Badge className="bg-muted/50 text-muted-foreground border-border/50">
          <Minus className="w-3 h-3 mr-1" />
          No change
        </Badge>
      );
    }

    const isPositive = delta > 0;
    const bgColor = isPositive ? "bg-green-500/10" : "bg-red-500/10";
    const textColor = isPositive ? "text-green-500" : "text-red-500";
    const borderColor = isPositive ? "border-green-500/20" : "border-red-500/20";
    const Icon = isPositive ? TrendingUp : TrendingDown;

    return (
      <Badge className={`${bgColor} ${textColor} ${borderColor}`}>
        <Icon className="w-3 h-3 mr-1" />
        {delta > 0 ? "+" : ""}
        {delta}
      </Badge>
    );
  };

  // Helper function to render score with progress bar
  const renderScore = (score: number | null, label: string, icon: React.ReactNode) => {
    if (score === null) return null;

    const percentage = (score / 10) * 100;
    const colorClass =
      percentage >= 80
        ? "bg-green-500"
        : percentage >= 60
        ? "bg-blue-500"
        : percentage >= 40
        ? "bg-yellow-500"
        : "bg-red-500";

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-medium text-foreground">{label}</span>
          </div>
          <span className="text-muted-foreground">{score}/10</span>
        </div>
        <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${colorClass}`}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
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

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Comparison Header */}
      <motion.div variants={fadeInUp} className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">
          Attempt Comparison
        </h2>
        <p className="text-sm text-muted-foreground">
          Visualize your improvement over time
        </p>
      </motion.div>

      {/* Side-by-Side Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Session 1 */}
        <motion.div variants={fadeInUp}>
          <Card className="bg-surface/50 border-border/50 h-full">
            <CardHeader className="border-b border-border/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-medium">
                  Attempt 1
                </CardTitle>
                <Badge className="bg-muted/50 text-muted-foreground border-border/50">
                  Earlier
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <Calendar className="w-3 h-3" />
                <span>{formatDate(session1.startedAt)}</span>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
              {/* Overall Score */}
              {session1.scores.overall !== null && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-primary" />
                      Overall Score
                    </h3>
                    <span className="text-2xl font-bold text-primary">
                      {session1.scores.overall}/10
                    </span>
                  </div>
                </div>
              )}

              {/* Individual Scores */}
              <div className="space-y-4">
                {renderScore(
                  session1.scores.structure,
                  "Structure",
                  <Target className="w-4 h-4 text-muted-foreground" />
                )}
                {renderScore(
                  session1.scores.clarity,
                  "Clarity",
                  <Eye className="w-4 h-4 text-muted-foreground" />
                )}
                {renderScore(
                  session1.scores.insight,
                  "Insight",
                  <Award className="w-4 h-4 text-muted-foreground" />
                )}
                {renderScore(
                  session1.scores.communication,
                  "Communication",
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                )}
                {renderScore(
                  session1.scores.leadership,
                  "Leadership",
                  <Users className="w-4 h-4 text-muted-foreground" />
                )}
              </div>

              {/* Key Quotes */}
              {session1.keyQuotes.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-border/50">
                  <h4 className="text-sm font-semibold text-foreground">
                    Key Quotes
                  </h4>
                  <div className="space-y-2">
                    {session1.keyQuotes.slice(0, 2).map((quote, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-muted/30 rounded-lg border border-border/30"
                      >
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          "{quote}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths */}
              {session1.feedback.strengths.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-border/50">
                  <h4 className="text-sm font-semibold text-foreground">
                    Strengths
                  </h4>
                  <ul className="space-y-2">
                    {session1.feedback.strengths.slice(0, 3).map((strength, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-muted-foreground flex items-start gap-2"
                      >
                        <span className="text-green-500 mt-0.5">✓</span>
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improvements */}
              {session1.feedback.improvements.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-border/50">
                  <h4 className="text-sm font-semibold text-foreground">
                    Areas for Improvement
                  </h4>
                  <ul className="space-y-2">
                    {session1.feedback.improvements.slice(0, 3).map((improvement, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-muted-foreground flex items-start gap-2"
                      >
                        <span className="text-yellow-500 mt-0.5">→</span>
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Session 2 */}
        <motion.div variants={fadeInUp}>
          <Card className="bg-surface/50 border-primary/20 h-full ring-1 ring-primary/10">
            <CardHeader className="border-b border-border/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-medium">
                  Attempt 2
                </CardTitle>
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  Latest
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <Calendar className="w-3 h-3" />
                <span>{formatDate(session2.startedAt)}</span>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
              {/* Overall Score with Delta */}
              {session2.scores.overall !== null && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-primary" />
                      Overall Score
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-primary">
                        {session2.scores.overall}/10
                      </span>
                      {renderScoreDelta(scoreDelta.overall)}
                    </div>
                  </div>
                </div>
              )}

              {/* Individual Scores with Deltas */}
              <div className="space-y-4">
                <div className="space-y-2">
                  {renderScore(
                    session2.scores.structure,
                    "Structure",
                    <Target className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div className="flex justify-end">
                    {renderScoreDelta(scoreDelta.structure)}
                  </div>
                </div>

                <div className="space-y-2">
                  {renderScore(
                    session2.scores.clarity,
                    "Clarity",
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div className="flex justify-end">
                    {renderScoreDelta(scoreDelta.clarity)}
                  </div>
                </div>

                <div className="space-y-2">
                  {renderScore(
                    session2.scores.insight,
                    "Insight",
                    <Award className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div className="flex justify-end">
                    {renderScoreDelta(scoreDelta.insight)}
                  </div>
                </div>

                <div className="space-y-2">
                  {renderScore(
                    session2.scores.communication,
                    "Communication",
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div className="flex justify-end">
                    {renderScoreDelta(scoreDelta.communication)}
                  </div>
                </div>

                <div className="space-y-2">
                  {renderScore(
                    session2.scores.leadership,
                    "Leadership",
                    <Users className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div className="flex justify-end">
                    {renderScoreDelta(scoreDelta.leadership)}
                  </div>
                </div>
              </div>

              {/* Key Quotes */}
              {session2.keyQuotes.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-border/50">
                  <h4 className="text-sm font-semibold text-foreground">
                    Key Quotes
                  </h4>
                  <div className="space-y-2">
                    {session2.keyQuotes.slice(0, 2).map((quote, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-primary/5 rounded-lg border border-primary/10"
                      >
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          "{quote}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths */}
              {session2.feedback.strengths.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-border/50">
                  <h4 className="text-sm font-semibold text-foreground">
                    Strengths
                  </h4>
                  <ul className="space-y-2">
                    {session2.feedback.strengths.slice(0, 3).map((strength, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-muted-foreground flex items-start gap-2"
                      >
                        <span className="text-green-500 mt-0.5">✓</span>
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improvements */}
              {session2.feedback.improvements.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-border/50">
                  <h4 className="text-sm font-semibold text-foreground">
                    Areas for Improvement
                  </h4>
                  <ul className="space-y-2">
                    {session2.feedback.improvements.slice(0, 3).map((improvement, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-muted-foreground flex items-start gap-2"
                      >
                        <span className="text-yellow-500 mt-0.5">→</span>
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Summary Section */}
      {session2.feedback.summary && (
        <motion.div variants={fadeInUp}>
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg font-medium">
                Progress Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {session2.feedback.summary}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
