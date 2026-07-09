"use client";

import { motion } from "framer-motion";
import {
  CheckCircle,
  Clock,
  Info,
  MessageSquare,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  FeedbackActionItem,
  FeedbackMetricCard,
  FeedbackSectionCard,
  FeedbackStatusPage,
} from "@/components/feedback/feedback-surface";
import { Button } from "@/components/ui/button";

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
export function FeedbackPartial({
  stats,
  recommendations,
}: FeedbackPartialProps) {
  const router = useRouter();
  const durationMin = Math.floor(stats.durationSeconds / 60);

  return (
    <FeedbackStatusPage
      tone="info"
      icon={<Info className="h-8 w-8" />}
      title="Basic Feedback Generated"
      description="Good start! Longer sessions unlock more detailed insights"
      actions={
        <>
          <Button
            size="lg"
            onClick={() => router.push("/dashboard/new-interview")}
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
          tone="info"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FeedbackMetricCard
              icon={<Clock className="h-5 w-5" />}
              label="Duration"
              value={`${durationMin} min`}
              helper="(aim for 20+ min)"
              tone="info"
            />
            <FeedbackMetricCard
              icon={<MessageSquare className="h-5 w-5" />}
              label="Exchanges"
              value={`${stats.totalTurns} turns`}
              helper="(aim for 20+ turns)"
              tone="info"
            />
            <FeedbackMetricCard
              icon={<CheckCircle className="h-5 w-5" />}
              label="Status"
              value="Qualified"
              tone="success"
            />
          </div>
        </FeedbackSectionCard>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <FeedbackSectionCard
          title="What's Included in Basic Feedback"
          icon={<CheckCircle className="h-5 w-5" />}
          tone="success"
        >
          <ul className="space-y-2">
            <FeedbackActionItem
              icon={<CheckCircle className="h-5 w-5" />}
              tone="success"
            >
              Overall performance score and summary
            </FeedbackActionItem>
            <FeedbackActionItem
              icon={<CheckCircle className="h-5 w-5" />}
              tone="success"
            >
              Key strengths identified in your responses
            </FeedbackActionItem>
            <FeedbackActionItem
              icon={<CheckCircle className="h-5 w-5" />}
              tone="success"
            >
              Top improvement areas with actionable suggestions
            </FeedbackActionItem>
          </ul>
        </FeedbackSectionCard>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <FeedbackSectionCard
          title="Unlock with Full Sessions (20+ min)"
          icon={<Info className="h-5 w-5" />}
          tone="info"
        >
          <ul className="space-y-2">
            {[
              "Detailed competency breakdown across 5 dimensions",
              "Comprehensive analysis of framework usage",
              "Personalized practice drills based on weak areas",
              "Trend analysis and performance tracking over time",
            ].map((item) => (
              <FeedbackActionItem
                key={item}
                icon={<TrendingUp className="h-5 w-5" />}
                tone="info"
              >
                {item}
              </FeedbackActionItem>
            ))}
          </ul>
        </FeedbackSectionCard>
      </motion.div>

      {recommendations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <FeedbackSectionCard
            title="Tips for Your Next Session"
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
      )}
    </FeedbackStatusPage>
  );
}
