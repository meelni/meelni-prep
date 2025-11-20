"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import { fadeInUp, staggerContainer } from "@/lib/animations";

export function FirstTimeUserExperience() {
  const router = useRouter();
  const { user } = useAuth();

  // Track first-time user experience view
  useEffect(() => {
    const { analytics } = require('@/lib/analytics/analytics-service');
    analytics.track('ftue_viewed', {
      user_id: user?.id,
    });
  }, [user?.id]);

  // Extract first name from user metadata or email
  const firstName =
    user?.user_metadata?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "there";

  // Track CTA click
  const handleStartInterview = () => {
    const { analytics } = require('@/lib/analytics/analytics-service');
    analytics.track('ftue_cta_clicked', {
      user_id: user?.id,
      cta_text: 'Start Your First Mock Interview',
    });
    router.push("/setup");
  };

  const journeySteps = [
    {
      label: "Choose your interview type",
      detail: "Product Sense, Analytical, Leadership, or Strategy",
    },
    {
      label: "Practice with AI for 20 minutes",
      detail: "Natural conversation, just like the real thing",
    },
    {
      label: "Get instant feedback",
      detail: "Detailed scores and personalized coaching tips",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4">
      {/* Hero Section - Centered and focused */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="w-full max-w-4xl"
      >
        <div className="text-center mb-16">
          <motion.h1
            variants={fadeInUp}
            className="font-display text-5xl md:text-6xl font-light text-foreground mb-6"
          >
            Welcome back, {firstName}! 👋
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
          >
            Ready to practice? Your first mock interview is just a click away.
          </motion.p>

          <motion.div variants={fadeInUp}>
            <Button
              onClick={handleStartInterview}
              size="lg"
              className="text-lg px-8 py-6 h-auto bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300"
            >
              Start Your First Mock Interview
            </Button>
          </motion.div>
        </div>

        {/* Journey Steps - Minimal and elegant */}
        <motion.div
          variants={fadeInUp}
          className="max-w-2xl mx-auto"
        >
          <div className="space-y-6">
            {journeySteps.map((step, index) => (
              <div
                key={index}
                className="flex gap-4 items-start"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-foreground font-medium mb-1">
                    {step.label}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {step.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
