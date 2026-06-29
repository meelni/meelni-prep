"use client";

import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

export function DiscontinuedBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="border-border/60 bg-background w-full border-b"
    >
      <div className="mx-auto flex min-h-[56px] max-w-[1216px] items-center justify-center px-6">
        <div className="flex flex-col items-center justify-center gap-3 text-center sm:flex-row">
          <AlertCircle className="text-warning h-5 w-5 shrink-0" />
          <div className="text-sm leading-6">
            <span className="text-foreground font-semibold">
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
