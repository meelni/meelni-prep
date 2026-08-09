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
      className="border-border bg-card/30 hover:bg-card/50 hover:border-primary/30 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-all duration-300"
    >
      <div className="bg-primary/10 text-primary mb-6 flex h-16 w-16 items-center justify-center rounded-full">
        {icon}
      </div>

      <h3 className="text-foreground mb-2 text-xl font-semibold">{title}</h3>

      <p className="text-muted-foreground mb-6 max-w-md text-center text-sm">
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
