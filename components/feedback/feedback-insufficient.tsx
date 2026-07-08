"use client";

import { motion } from "framer-motion";
import { AlertCircle, Clock, MessageSquare, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  FeedbackActionItem,
  FeedbackMetricCard,
  FeedbackSectionCard,
  FeedbackStatusPage,
} from "@/components/feedback/feedback-surface";
import { Button } from "@/components/ui/button";

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
    <FeedbackStatusPage
      tone="warning"
      icon={<AlertCircle className="h-8 w-8" />}
      title="Session Too Short for Feedback"
      description="We need more data to provide meaningful feedback"
      actions={
        <>
          <Button size="lg" onClick={() => router.push("/dashboard/new-rep")}>
            Start New Interview
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => router.push("/dashboard")}
          >
            Back to Dashboard
          </Button>
        </>
      }
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <FeedbackSectionCard
          title="Session Summary"
          icon={<TrendingUp className="h-5 w-5" />}
          tone="warning"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FeedbackMetricCard
              icon={<Clock className="h-5 w-5" />}
              label="Duration"
              value={`${durationMin} min`}
              helper="(need 10+ min)"
              tone="warning"
            />
            <FeedbackMetricCard
              icon={<MessageSquare className="h-5 w-5" />}
              label="Exchanges"
              value={`${stats.totalTurns} turns`}
              helper="(need 10+ turns)"
              tone="warning"
            />
            <FeedbackMetricCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Detailed Answers"
              value={stats.substantiveResponses}
              helper="(need 3+)"
              tone="warning"
            />
          </div>
        </FeedbackSectionCard>
      </motion.div>

      {reasons.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <FeedbackSectionCard title="Why No Feedback?" tone="warning">
            <ul className="space-y-2">
              {reasons.map((reason, index) => (
                <FeedbackActionItem
                  key={index}
                  icon={<AlertCircle className="h-5 w-5" />}
                  tone="warning"
                >
                  {reason}
                </FeedbackActionItem>
              ))}
            </ul>
          </FeedbackSectionCard>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <FeedbackSectionCard
          title="How to Get Feedback Next Time"
          icon={<TrendingUp className="h-5 w-5" />}
        >
          <ul className="space-y-3">
            {recommendations.map((rec, index) => (
              <FeedbackActionItem key={index} marker={index + 1}>
                {rec}
              </FeedbackActionItem>
            ))}
          </ul>
        </FeedbackSectionCard>
      </motion.div>
    </FeedbackStatusPage>
  );
}
