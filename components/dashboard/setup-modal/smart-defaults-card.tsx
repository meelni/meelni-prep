"use client";

import { motion } from "framer-motion";
import { Zap, ArrowRight } from "lucide-react";
import { breathingPulse } from "@/lib/animations";

interface SmartDefaultsCardProps {
  onClick: () => void;
}

export function SmartDefaultsCard({ onClick }: SmartDefaultsCardProps) {
  return (
    <motion.button
      onClick={onClick}
      className="relative w-full p-5 rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 text-left overflow-hidden group"
      whileHover={{
        scale: 1.02,
        boxShadow: '0 8px 40px rgb(var(--primary) / 0.4)',
      }}
      whileTap={{ scale: 0.98 }}
      animate={{
        boxShadow: [
          '0 4px 20px rgb(var(--primary) / 0.2)',
          '0 6px 30px rgb(var(--primary) / 0.35)',
          '0 4px 20px rgb(var(--primary) / 0.2)',
        ],
      }}
      transition={{
        boxShadow: {
          duration: 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
        },
        scale: {
          type: 'spring',
          stiffness: 400,
          damping: 30,
        },
      }}
    >
      {/* Animated Gradient Background */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 opacity-0 group-hover:opacity-100"
        animate={{
          x: ['-100%', '100%'],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Content */}
      <div className="relative space-y-3">
        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/20 border border-primary/40">
          <Zap className="w-3.5 h-3.5 text-primary" fill="currentColor" />
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">
            Quick Start
          </span>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground">Use Smart Defaults</h3>
            <ArrowRight className="w-5 h-5 text-primary group-hover:translate-x-1 transition-transform" />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Start immediately with optimal settings: Product Sense mock interview with Tessa voice
          </p>
        </div>

        {/* Features */}
        <div className="flex flex-wrap gap-2">
          {["Product Sense", "Mock Interview", "Tessa Voice"].map((feature) => (
            <span
              key={feature}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-xs text-primary font-medium"
            >
              {feature}
            </span>
          ))}
        </div>
      </div>

      {/* Animated Border */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0 blur-xl" />
      </div>
    </motion.button>
  );
}
