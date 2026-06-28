"use client";

import { Section } from "@/components/section";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";

export function Pricing() {
  return (
    <Section id="pricing">
      <div className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-12">
            <motion.h2
              className="text-display-lg font-display font-light text-foreground mb-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              Pricing
            </motion.h2>
          </div>

          {/* Discontinued Notice */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto max-w-2xl"
          >
            <AppSurface variant="muted" size="lg" className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <AlertCircle className="h-6 w-6" />
              </div>
              <StatusPill tone="warning" className="mb-4">
                Subscription Update
              </StatusPill>
              <AppSurfaceTitle className="font-display text-xl">
                Service Discontinued
              </AppSurfaceTitle>
              <AppSurfaceDescription className="mx-auto mt-3 max-w-lg text-sm leading-relaxed">
                Meelni is no longer accepting new subscriptions. Thank you to everyone who supported our AI-powered mock interview platform.
              </AppSurfaceDescription>
            </AppSurface>
          </motion.div>
        </div>
      </div>
    </Section>
  );
}
