"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePostHog } from "posthog-js/react";

interface ConversionCTAProps {
  index: number;
}

export function ConversionCTA({ index }: ConversionCTAProps) {
  const router = useRouter();
  const posthog = usePostHog();
  const [isDismissed, setIsDismissed] = useState(false);

  const handleDismiss = () => {
    posthog?.capture("explore_cta_dismissed", {
      cta_position: index,
    });
    setIsDismissed(true);
  };

  const handleSignUpClick = () => {
    posthog?.capture("explore_cta_clicked", {
      cta_position: index,
    });
    router.push('/auth/signin?redirectTo=/explore');
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
      className="relative p-6 sm:p-8 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/3 to-primary/8 shadow-sm hover:shadow-md transition-all duration-300"
    >
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 w-6 h-6 rounded-full bg-background/10 hover:bg-background/20 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Icon */}
      <div className="mb-4 inline-flex p-3 rounded-xl bg-primary/10 border border-primary/20">
        <Sparkles className="w-6 h-6 text-primary" />
      </div>

      {/* Heading */}
      <h3 className="text-lg font-semibold text-foreground mb-2">
        Ready to start practicing?
      </h3>

      {/* Body */}
      <p className="text-sm text-muted-foreground mb-6">
        Get personalized AI coaching and track your progress over time
      </p>

      {/* CTA Button */}
      <Button
        size="default"
        onClick={handleSignUpClick}
        className="w-full sm:w-auto gap-2"
      >
        Sign Up Free
        <ArrowRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}
