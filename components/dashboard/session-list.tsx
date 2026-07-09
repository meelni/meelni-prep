"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DashboardActionCard,
  DashboardStateCard,
} from "@/components/dashboard/dashboard-surface";
import { motion } from "framer-motion";
import {
  Clock,
  Calendar,
  MessageSquare,
  ExternalLink,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import type { Session } from "@/lib/api/queries";
import { analytics } from "@/lib/analytics/analytics-service";

interface SessionListProps {
  sessions: Session[];
  onSessionClick?: (sessionId: string) => void;
}

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
      <DashboardStateCard
        icon={<MessageSquare className="h-8 w-8" />}
        title="No interviews yet"
        description="Start your first mock interview to see your history and track your progress."
        action={
          <Button asChild>
            <Link href="/dashboard/new-interview">Start First Interview</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session, index) => {
        const startDate = new Date(session.startedAt);
        const duration = session.endedAt
          ? Math.round(
              (new Date(session.endedAt).getTime() - startDate.getTime()) /
                60000
            )
          : null;

        const isCompleted = !!session.endedAt;

        const handleSessionClick = () => {
          // Calculate session age in days
          const sessionAge =
            (Date.now() - new Date(session.startedAt).getTime()) /
            (1000 * 60 * 60 * 24);

          // Track session details click
          const sessionFeedback = session.feedback;
          analytics.track("session_details_clicked", {
            session_id: session.id,
            interview_type: session.roundType,
            session_age_days: Math.floor(sessionAge),
            has_feedback: !!(
              sessionFeedback?.overallScore !== null &&
              sessionFeedback?.overallScore !== undefined
            ),
          });

          // Call optional callback
          if (onSessionClick) {
            onSessionClick(session.id);
          }
        };

        const feedbackStatus = session.feedback?.status;
        const overallScore = session.feedback?.overallScore;
        const hasFeedback =
          feedbackStatus === "completed" && overallScore !== null;
        const isProcessing =
          feedbackStatus === "pending" || feedbackStatus === "processing";
        const roundTypeLabel =
          roundTypeLabels[session.roundType] || session.roundType;

        return (
          <motion.div
            key={session.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
          >
            <DashboardActionCard
              eyebrow={
                !isCompleted || isProcessing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {!isCompleted && (
                      <Badge variant="warning">In Progress</Badge>
                    )}
                    {isProcessing && (
                      <Badge variant="info">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Generating...
                      </Badge>
                    )}
                  </div>
                ) : null
              }
              title={
                <span className="font-sans text-base font-medium">
                  {roundTypeLabel} Interview
                </span>
              }
              description={
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
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
                      <Clock className="h-4 w-4" />
                      <span>{duration} min</span>
                    </div>
                  )}
                  {hasFeedback && overallScore && (
                    <div className="text-primary flex items-center gap-1.5 font-medium">
                      Score: {Math.round(parseFloat(overallScore))}
                    </div>
                  )}
                </div>
              }
              action={
                hasFeedback ? (
                  <Button asChild variant="ghost" size="sm" className="gap-2">
                    <Link
                      href={`/feedback/${session.id}`}
                      onClick={handleSessionClick}
                    >
                      View Feedback
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null
              }
              className="py-5"
            />
          </motion.div>
        );
      })}
    </div>
  );
}
