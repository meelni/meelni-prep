"use client";

import { Section } from "@/components/section";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

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
            className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8 text-center"
          >
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Service Discontinued
            </h3>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Meelni is no longer accepting new subscriptions. Thank you to everyone who supported our AI-powered mock interview platform.
            </p>
          </motion.div>
        </div>
      </div>
    </Section>
  );
}
