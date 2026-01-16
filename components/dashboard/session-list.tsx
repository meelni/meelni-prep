"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Clock, Calendar, MessageSquare, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import type { Session } from "@/lib/api/queries";
import { analytics } from "@/lib/analytics/analytics-service";

interface SessionListProps {
  sessions: Session[];
  onSessionClick?: (sessionId: string) => void;
}

const roundTypeColors: Record<string, string> = {
  product_sense: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  analytical_thinking: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  behavioral: "bg-green-500/10 text-green-500 border-green-500/20",
  execution: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  strategy: "bg-red-500/10 text-red-500 border-red-500/20",
};

const roundTypeLabels: Record<string, string> = {
  product_sense: "Product Sense",
  analytical_thinking: "Analytical",
  behavioral: "Behavioral",
  execution: "Execution",
  strategy: "Strategy",
};

export function SessionList({ sessions, onSessionClick }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <Card className="p-12 bg-surface/30 border-border/30 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-medium text-foreground">
              No interviews yet
            </p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Start your first mock interview to see your history and track your progress
            </p>
          </div>
          <Link
            href="/setup"
            className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Start First Interview
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session, index) => {
        const startDate = new Date(session.startedAt);
        const duration = session.endedAt
          ? Math.round(
              (new Date(session.endedAt).getTime() - startDate.getTime()) / 60000
            )
          : null;

        const isCompleted = !!session.endedAt;

        const handleSessionClick = () => {
          // Calculate session age in days
          const sessionAge = (Date.now() - new Date(session.startedAt).getTime()) / (1000 * 60 * 60 * 24);

          // Track session details click
          const sessionFeedback = (session as any).feedback;
          analytics.track("session_details_clicked", {
            session_id: session.id,
            interview_type: session.roundType,
            session_age_days: Math.floor(sessionAge),
            has_feedback: !!(sessionFeedback?.overallScore !== null && sessionFeedback?.overallScore !== undefined),
          });

          // Call optional callback
          if (onSessionClick) {
            onSessionClick(session.id);
          }
        };

        const feedbackStatus = session.feedback?.status;
        const overallScore = session.feedback?.overallScore;
        const hasFeedback = feedbackStatus === "completed" && overallScore !== null;
        const isProcessing = feedbackStatus === "pending" || feedbackStatus === "processing";

        return (
          <motion.div
            key={session.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
          >
            <Card className="p-6 bg-surface/50 border-border/50 hover:border-primary/30 transition-all duration-300">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge
                      className={
                        roundTypeColors[session.roundType] || "bg-muted"
                      }
                    >
                      {roundTypeLabels[session.roundType] || session.roundType}
                    </Badge>
                    {!isCompleted && (
                      <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                        In Progress
                      </Badge>
                    )}
                    {isProcessing && (
                      <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Generating...
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {startDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    {duration !== null && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span>{duration} min</span>
                      </div>
                    )}
                    {hasFeedback && overallScore && (
                      <div className="flex items-center gap-1.5 font-medium text-primary">
                        Score: {Math.round(parseFloat(overallScore))}
                      </div>
                    )}
                  </div>
                </div>

                {hasFeedback && (
                  <Link href={`/feedback/${session.id}`} onClick={handleSessionClick}>
                    <Button variant="ghost" size="sm" className="gap-2">
                      View Feedback
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
