"use client";

import { Section } from "@/components/section";
import { motion } from "framer-motion";

export function CTA() {
  return (
    <Section id="cta">
      <div className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Top border with glow */}
          <motion.div
            className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent mb-12 shadow-lg shadow-primary/20"
            initial={{ opacity: 0, scaleX: 0 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          />

          <div className="text-center space-y-6">
            <motion.h2
              className="text-display-lg md:text-display-xl font-display font-light text-foreground text-balance"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Thank you for your interest in Meelni
            </motion.h2>

            <motion.p
              className="text-muted-foreground text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              This service has been discontinued. We appreciate everyone who tried our AI-powered mock interview platform.
            </motion.p>
          </div>

          {/* Bottom border with glow */}
          <motion.div
            className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent mt-12 shadow-lg shadow-primary/20"
            initial={{ opacity: 0, scaleX: 0 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.6 }}
          />
        </div>
      </div>
    </Section>
  );
}
