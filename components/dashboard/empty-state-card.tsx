"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";

interface EmptyStateCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  cta?: {
    label: string;
    action: () => void;
  };
}

export function EmptyStateCard({
  icon,
  title,
  description,
  cta,
}: EmptyStateCardProps) {
  return (
    <motion.div
      variants={fadeInUp}
      className="flex flex-col items-center justify-center p-12 rounded-lg border-2 border-dashed border-border bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300"
    >
      <div className="w-16 h-16 mb-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>

      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>

      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        {description}
      </p>

      {cta && (
        <Button onClick={cta.action} size="lg" className="mt-2">
          {cta.label}
        </Button>
      )}
    </motion.div>
  );
}
