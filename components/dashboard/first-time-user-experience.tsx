"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { analytics } from "@/lib/analytics/analytics-service";

export const FTUE_EMPTY_STATE_COPY = {
  title: "No active interviews yet",
  body: "Start a practice interview when you're ready.",
  cta: "Start new interview",
} as const;

export function FirstTimeUserExperience() {
  const router = useRouter();

  // Track first-time user experience view
  useEffect(() => {
    analytics.track("ftue_viewed", {});
  }, []);

  // Track CTA click
  const handleStartInterview = () => {
    analytics.track("ftue_cta_clicked", { source: "empty_state" });
    router.push("/dashboard/new-interview");
  };

  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      className="flex min-h-[calc(100vh-1.5rem)] flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div className="space-y-3">
        <h1 className="text-dashboard-foreground text-lg leading-6 font-semibold">
          {FTUE_EMPTY_STATE_COPY.title}
        </h1>
        <p className="text-dashboard-muted max-w-[320px] text-sm leading-5">
          {FTUE_EMPTY_STATE_COPY.body}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          type="button"
          onClick={handleStartInterview}
          className="h-8 gap-2 rounded-[10px] px-3.5 text-[13px] font-semibold"
        >
          {FTUE_EMPTY_STATE_COPY.cta}
        </Button>
      </div>
    </motion.div>
  );
}
