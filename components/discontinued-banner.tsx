"use client";

import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

export function DiscontinuedBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 border-b border-amber-500/20"
    >
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-center gap-3 text-center">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div className="text-sm sm:text-base">
            <span className="font-semibold text-amber-600 dark:text-amber-400">
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
