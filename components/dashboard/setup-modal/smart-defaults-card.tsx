"use client";

import { motion } from "framer-motion";
import { Zap, ArrowRight } from "lucide-react";
import { SelectableCard } from "@/components/ui/selectable-card";

interface SmartDefaultsCardProps {
  onClick: () => void;
}

const MotionSelectableCard = motion.create(SelectableCard);

export function SmartDefaultsCard({ onClick }: SmartDefaultsCardProps) {
  return (
    <MotionSelectableCard
      onClick={onClick}
      className="border-primary/30 from-primary/5 via-primary/10 to-primary/5 rounded-xl bg-gradient-to-br p-5"
      whileHover={{
        scale: 1.02,
        boxShadow:
          "0 8px 40px color-mix(in oklab, var(--primary) 40%, transparent)",
      }}
      whileTap={{ scale: 0.98 }}
      animate={{
        boxShadow: [
          "0 4px 20px color-mix(in oklab, var(--primary) 20%, transparent)",
          "0 6px 30px color-mix(in oklab, var(--primary) 35%, transparent)",
          "0 4px 20px color-mix(in oklab, var(--primary) 20%, transparent)",
        ],
      }}
      transition={{
        boxShadow: {
          duration: 2.5,
          repeat: Infinity,
          ease: "easeInOut",
        },
        scale: {
          type: "spring",
          stiffness: 400,
          damping: 30,
        },
      }}
    >
      {/* Animated Gradient Background */}
      <motion.div
        className="from-primary/0 via-primary/20 to-primary/0 absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100"
        animate={{
          x: ["-100%", "100%"],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {/* Content */}
      <div className="relative space-y-3">
        {/* Badge */}
        <div className="bg-primary/20 border-primary/40 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
          <Zap className="text-primary h-3.5 w-3.5" fill="currentColor" />
          <span className="text-primary text-xs font-semibold tracking-wide uppercase">
            Quick Start
          </span>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-foreground text-lg font-bold">
              Use Smart Defaults
            </h3>
            <ArrowRight className="text-primary h-5 w-5 transition-transform group-hover:translate-x-1" />
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Start immediately with optimal settings: Product Sense mock
            interview with Tessa voice
          </p>
        </div>

        {/* Features */}
        <div className="flex flex-wrap gap-2">
          {["Product Sense", "Mock Interview", "Tessa Voice"].map((feature) => (
            <span
              key={feature}
              className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
            >
              {feature}
            </span>
          ))}
        </div>
      </div>

      {/* Animated Border */}
      <div className="absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover:opacity-100">
        <div className="from-primary/0 via-primary/50 to-primary/0 absolute inset-0 rounded-xl bg-gradient-to-r blur-xl" />
      </div>
    </MotionSelectableCard>
  );
}
