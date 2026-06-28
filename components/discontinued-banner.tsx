"use client";

import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

import { StatusPill } from "@/components/ui/app-surface";

export function DiscontinuedBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full border-b border-warning/20 bg-warning/5"
    >
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col items-center justify-center gap-3 text-center sm:flex-row">
          <StatusPill tone="warning">
            <AlertCircle className="h-3.5 w-3.5" />
            Discontinued
          </StatusPill>
          <div className="text-sm sm:text-base">
            <span className="font-semibold text-foreground">
              Meelni has been discontinued.
            </span>
            <span className="text-muted-foreground ml-1">
              Thank you to everyone who tried our AI mock interview platform.
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
