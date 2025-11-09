"use client";

import { motion } from "framer-motion";
import { AlertCircle, Clock, MessageSquare, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";

interface FeedbackInsufficientProps {
  /** Session statistics */
  stats: {
    totalTurns: number;
    durationSeconds: number;
    substantiveResponses: number;
  };
  /** Reasons why session was insufficient */
  reasons: string[];
  /** Recommendations for improvement */
  recommendations: string[];
}

/**
 * FeedbackInsufficient Component
 *
 * Displayed when a session doesn't meet minimum requirements for feedback.
 * Provides actionable guidance to help users improve their next session.
 *
 * Tier: INSUFFICIENT
 * Requirements: < 5 turns OR < 5 min OR < 3 substantive responses
 */
export function FeedbackInsufficient({
  stats,
  reasons,
  recommendations,
}: FeedbackInsufficientProps) {
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
            <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-light">
            Session Too Short for Feedback
          </h1>
          <p className="text-muted-foreground text-lg">
            We need more data to provide meaningful feedback
          </p>
        </motion.div>

        {/* Session Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="bg-card/50 border-orange-500/20">
            <CardHeader>
              <CardTitle className="text-xl font-display font-light flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-500" />
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
                      <span className="text-xs text-orange-500 ml-2">
                        (need 10+ min)
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
                      <span className="text-xs text-orange-500 ml-2">
                        (need 10+ turns)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border border-border/50">
                  <TrendingUp className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">Detailed Answers</div>
                    <div className="text-lg font-medium">
                      {stats.substantiveResponses}
                      <span className="text-xs text-orange-500 ml-2">
                        (need 3+)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Reasons */}
        {reasons.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card className="bg-card/50 border-orange-500/20">
              <CardHeader>
                <CardTitle className="text-xl font-display font-light">
                  Why No Feedback?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {reasons.map((reason, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 p-3 bg-orange-500/5 rounded-lg border border-orange-500/10"
                    >
                      <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Recommendations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-display font-light flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                How to Get Feedback Next Time
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

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button
            size="lg"
            onClick={() => router.push("/setup")}
            className="bg-primary hover:bg-primary/90"
          >
            Start New Interview
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => router.push("/dashboard")}
          >
            Back to Dashboard
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
