"use client";

import Link from "next/link";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { usePublicActivationDecision } from "@/lib/feature-flags/public-activation-client";
import { PublicActivationButton } from "@/components/public-activation-action";
import { NEW_INTERVIEW_PATH } from "@/lib/navigation/interview-launch";

export function CTA() {
  const activation = usePublicActivationDecision();

  return (
    <Section id="cta">
      <div className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {/* Top border with glow */}
          <motion.div
            className="via-primary/40 shadow-primary/20 mb-12 h-px w-full bg-gradient-to-r from-transparent to-transparent shadow-lg"
            initial={{ opacity: 0, scaleX: 0 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          />

          <div className="space-y-6 text-center">
            <motion.h2
              className="text-display-lg md:text-display-xl font-display text-foreground font-light text-balance"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {activation.canActivate
                ? "Ready to practice with Meelni?"
                : "Thank you for your interest in Meelni"}
            </motion.h2>

            <motion.p
              className="text-muted-foreground mx-auto max-w-2xl text-lg"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              {activation.canActivate
                ? "Start a mock interview, explore the question bank, and pick up where the product experience leaves off."
                : "Practice sessions are paused while we prepare the next version. You can still browse PM questions, company guides, and interview articles."}
            </motion.p>

            <motion.div
              className="flex flex-col items-center justify-center gap-3 sm:flex-row"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <PublicActivationButton href={NEW_INTERVIEW_PATH} size="lg">
                Start a mock interview
              </PublicActivationButton>
              <Button asChild size="lg" variant="outline">
                <Link href="/explore">Explore questions</Link>
              </Button>
            </motion.div>
          </div>

          {/* Bottom border with glow */}
          <motion.div
            className="via-primary/40 shadow-primary/20 mt-12 h-px w-full bg-gradient-to-r from-transparent to-transparent shadow-lg"
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
