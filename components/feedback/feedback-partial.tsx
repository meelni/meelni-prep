"use client";

import { motion } from "framer-motion";
import { Info, Clock, MessageSquare, TrendingUp, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";

interface FeedbackPartialProps {
  /** Session statistics */
  stats: {
    totalTurns: number;
    durationSeconds: number;
    substantiveResponses: number;
  };
  /** Recommendations for full feedback */
  recommendations: string[];
}

/**
 * FeedbackPartial Component
 *
 * Displayed when a session meets minimum requirements but not full requirements.
 * Explains limitations of partial feedback and encourages longer sessions.
 *
 * Tier: PARTIAL
 * Requirements: 5-19 turns OR 5-19 min OR 3-4 substantive responses
 */
export function FeedbackPartial({ stats, recommendations }: FeedbackPartialProps) {
  const router = useRouter();
  const durationMin = Math.floor(stats.durationSeconds / 60);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-3"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center">
              <Info className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-light">
            Basic Feedback Generated
          </h1>
          <p className="text-muted-foreground text-lg">
            Good start! Longer sessions unlock more detailed insights
          </p>
        </motion.div>

        {/* Session Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="bg-card/50 border-blue-500/20">
            <CardHeader>
              <CardTitle className="text-xl font-display font-light flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                Session Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border border-border/50">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">Duration</div>
                    <div className="text-lg font-medium">
                      {durationMin} min
                      <span className="text-xs text-blue-500 ml-2">
                        (aim for 20+ min)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border border-border/50">
                  <MessageSquare className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">Exchanges</div>
                    <div className="text-lg font-medium">
                      {stats.totalTurns} turns
                      <span className="text-xs text-blue-500 ml-2">
                        (aim for 20+ turns)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border border-border/50">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <div>
                    <div className="text-sm text-muted-foreground">Status</div>
                    <div className="text-lg font-medium text-green-500">
                      Qualified ✓
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* What's Included */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="bg-card/50 border-green-500/20">
            <CardHeader>
              <CardTitle className="text-xl font-display font-light flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                What's Included in Basic Feedback
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                <li className="flex items-start gap-3 p-3 bg-green-500/5 rounded-lg border border-green-500/10">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Overall performance score and summary</span>
                </li>
                <li className="flex items-start gap-3 p-3 bg-green-500/5 rounded-lg border border-green-500/10">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Key strengths identified in your responses</span>
                </li>
                <li className="flex items-start gap-3 p-3 bg-green-500/5 rounded-lg border border-green-500/10">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Top improvement areas with actionable suggestions</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        {/* What's Missing */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="bg-card/50 border-blue-500/20">
            <CardHeader>
              <CardTitle className="text-xl font-display font-light flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-500" />
                Unlock with Full Sessions (20+ min)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                <li className="flex items-start gap-3 p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                  <TrendingUp className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Detailed competency breakdown across 5 dimensions</span>
                </li>
                <li className="flex items-start gap-3 p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                  <TrendingUp className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Comprehensive analysis of framework usage</span>
                </li>
                <li className="flex items-start gap-3 p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                  <TrendingUp className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Personalized practice drills based on weak areas</span>
                </li>
                <li className="flex items-start gap-3 p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                  <TrendingUp className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Trend analysis and performance tracking over time</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardHeader>
                <CardTitle className="text-xl font-display font-light flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Tips for Your Next Session
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {recommendations.map((rec, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 p-3 bg-background/50 rounded-lg border border-primary/10"
                    >
                      <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-medium text-primary">
                          {index + 1}
                        </span>
                      </div>
                      <span className="text-sm">{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button
            size="lg"
            onClick={() => router.push("/setup")}
            className="bg-primary hover:bg-primary/90"
          >
            Try Full Session (20+ min)
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => router.push("/dashboard")}
          >
            View Feedback
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
