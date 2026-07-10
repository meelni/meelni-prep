"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { analytics } from "@/lib/analytics/analytics-service";

interface ConversionCTAProps {
  index: number;
}

export function ConversionCTA({ index }: ConversionCTAProps) {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(false);

  const handleDismiss = () => {
    analytics.track("explore_cta_dismissed", {
      cta_position: index,
    });
    setIsDismissed(true);
  };

  const handleSignUpClick = () => {
    analytics.track("explore_cta_clicked", {
      cta_position: index,
    });
    router.push("/auth/signin?redirectTo=/explore");
  };

  if (isDismissed) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -2 }}
      transition={{ delay: index * 0.05 }}
      className="border-primary/20 from-primary/3 to-primary/8 relative rounded-xl border bg-gradient-to-br p-6 shadow-sm transition-all duration-300 hover:shadow-md sm:p-8"
    >
      {/* Dismiss button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground absolute top-3 right-3 h-6 w-6 rounded-full"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </Button>

      {/* Icon */}
      <div className="bg-primary/10 border-primary/20 mb-4 inline-flex rounded-xl border p-3">
        <Sparkles className="text-primary h-6 w-6" />
      </div>

      {/* Heading */}
      <h3 className="text-foreground mb-2 text-lg font-semibold">
        Ready to start practicing?
      </h3>

      {/* Body */}
      <p className="text-muted-foreground mb-6 text-sm">
        Get personalized AI coaching and track your progress over time
      </p>

      {/* CTA Button */}
      <Button
        size="default"
        onClick={handleSignUpClick}
        className="w-full gap-2 sm:w-auto"
      >
        Sign Up Free
        <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  );
}
