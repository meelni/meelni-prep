"use client";

import { motion } from "framer-motion";
import { XCircle, HelpCircle, Mic, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";

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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-red-500/5 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-3"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-light">
            Session Not Started
          </h1>
          <p className="text-muted-foreground text-lg">
            No conversation was recorded during this session
          </p>
        </motion.div>

        {/* Possible Reasons */}
        {reasons.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="bg-card/50 border-red-500/20">
              <CardHeader>
                <CardTitle className="text-xl font-display font-light flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-red-500" />
                  What Happened?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {reasons.map((reason, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 p-3 bg-red-500/5 rounded-lg border border-red-500/10"
                    >
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Troubleshooting Tips */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-display font-light flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-primary" />
                Before Your Next Session
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-start gap-3 p-3 bg-background/50 rounded-lg border border-primary/10">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Mic className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium mb-1">Check Microphone Permissions</div>
                    <div className="text-sm text-muted-foreground">
                      Make sure your browser has permission to access your microphone.
                      You'll see a permission prompt when joining the interview.
                    </div>
                  </div>
                </li>

                <li className="flex items-start gap-3 p-3 bg-background/50 rounded-lg border border-primary/10">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Volume2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium mb-1">Test Your Audio</div>
                    <div className="text-sm text-muted-foreground">
                      Before starting, verify that your microphone is working and not muted.
                      You should see audio indicators when you speak.
                    </div>
                  </div>
                </li>

                <li className="flex items-start gap-3 p-3 bg-background/50 rounded-lg border border-primary/10">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <HelpCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium mb-1">Wait for the AI Interviewer</div>
                    <div className="text-sm text-muted-foreground">
                      The AI interviewer will greet you first. Listen for the introduction
                      and question before responding.
                    </div>
                  </div>
                </li>

                <li className="flex items-start gap-3 p-3 bg-background/50 rounded-lg border border-primary/10">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Mic className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium mb-1">Speak Clearly</div>
                    <div className="text-sm text-muted-foreground">
                      Speak at a normal volume and pace. If the AI doesn't respond,
                      try speaking louder or checking your microphone settings.
                    </div>
                  </div>
                </li>
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        {/* Browser Compatibility Note */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="bg-card/50 border-border/50">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground text-center">
                <p className="mb-2">
                  <strong>Browser Compatibility:</strong> For the best experience, use Chrome, Firefox, or Safari.
                </p>
                <p>
                  If you continue experiencing issues, try refreshing the page or using a different browser.
                </p>
              </div>
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
            Try Again
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => router.push("/dashboard")}
          >
            Back to Dashboard
          </Button>
        </motion.div>

        {/* Help Note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center text-sm text-muted-foreground"
        >
          Still having trouble? Contact support or check our troubleshooting guide.
        </motion.div>
      </div>
    </div>
  );
}
