"use client";

import { motion } from "framer-motion";
import { HelpCircle, Mic, Volume2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  FeedbackActionItem,
  FeedbackSectionCard,
  FeedbackStatusPage,
} from "@/components/feedback/feedback-surface";
import { Button } from "@/components/ui/button";

interface FeedbackAbandonedProps {
  /** Optional reasons for abandonment */
  reasons?: string[];
}

/**
 * FeedbackAbandoned Component
 *
 * Displayed when a session has 0 transcript turns (user never engaged with interviewer).
 * Provides troubleshooting tips and encourages user to try again.
 *
 * Tier: ABANDONED
 * Requirements: 0 turns (user joined but never spoke)
 */
export function FeedbackAbandoned({ reasons = [] }: FeedbackAbandonedProps) {
  const router = useRouter();

  return (
    <FeedbackStatusPage
      tone="danger"
      icon={<XCircle className="h-8 w-8" />}
      title="Session Not Started"
      description="No conversation was recorded during this session"
      actions={
        <>
          <Button size="lg" onClick={() => router.push("/dashboard/new-rep")}>
            Try Again
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
      {reasons.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <FeedbackSectionCard
            title="What Happened?"
            icon={<HelpCircle className="h-5 w-5" />}
            tone="danger"
          >
            <ul className="space-y-2">
              {reasons.map((reason, index) => (
                <FeedbackActionItem
                  key={index}
                  icon={<XCircle className="h-5 w-5" />}
                  tone="danger"
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
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <FeedbackSectionCard
          title="Before Your Next Session"
          icon={<HelpCircle className="h-5 w-5" />}
        >
          <ul className="space-y-3">
            <FeedbackActionItem
              icon={<Mic className="h-5 w-5" />}
              title="Check Microphone Permissions"
            >
              Make sure your browser has permission to access your microphone.
              You&apos;ll see a permission prompt when joining the interview.
            </FeedbackActionItem>
            <FeedbackActionItem
              icon={<Volume2 className="h-5 w-5" />}
              title="Test Your Audio"
            >
              Before starting, verify that your microphone is working and not
              muted. You should see audio indicators when you speak.
            </FeedbackActionItem>
            <FeedbackActionItem
              icon={<HelpCircle className="h-5 w-5" />}
              title="Wait for the AI Interviewer"
            >
              The AI interviewer will greet you first. Listen for the
              introduction and question before responding.
            </FeedbackActionItem>
            <FeedbackActionItem
              icon={<Mic className="h-5 w-5" />}
              title="Speak Clearly"
            >
              Speak at a normal volume and pace. If the AI doesn&apos;t respond,
              try speaking louder or checking your microphone settings.
            </FeedbackActionItem>
          </ul>
        </FeedbackSectionCard>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <FeedbackSectionCard title="Browser Compatibility">
          <div className="text-muted-foreground space-y-2 text-center text-sm">
            <p>
              <strong>Browser Compatibility:</strong> For the best experience,
              use Chrome, Firefox, or Safari.
            </p>
            <p>
              If you continue experiencing issues, try refreshing the page or
              using a different browser.
            </p>
          </div>
        </FeedbackSectionCard>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="text-muted-foreground text-center text-sm"
      >
        Still having trouble? Contact support or check our troubleshooting
        guide.
      </motion.div>
    </FeedbackStatusPage>
  );
}
