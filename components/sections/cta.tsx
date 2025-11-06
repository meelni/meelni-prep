"use client";

import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <Section id="cta">
      <div className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Top border with glow */}
          <motion.div
            className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent mb-12 shadow-[0_0_8px_rgba(var(--primary),0.3)]"
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
              Ready to ace your next PM interview?
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <Link href="/setup">
                <Button
                  size="lg"
                  className="group bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold text-[15px] px-8 transition-all duration-300"
                >
                  Get Started
                  <ArrowRight className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
              </Link>
            </motion.div>
          </div>

          {/* Bottom border with glow */}
          <motion.div
            className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent mt-12 shadow-[0_0_8px_rgba(var(--primary),0.3)]"
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
