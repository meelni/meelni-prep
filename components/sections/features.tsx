"use client";

import { Section } from "@/components/section";
import { siteConfig } from "@/lib/config";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import { motion } from "framer-motion";

export function Features() {
  const features = siteConfig.features;

  return (
    <Section id="features">
      <div className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:items-start lg:gap-16">
          <div className="max-w-md">
            <motion.h2
              className="text-display-section text-foreground mb-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              Built for the PM loop.
            </motion.h2>
            <motion.p
              className="text-muted-foreground text-lg leading-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Questions, mock interviews, feedback, and progress in one focused
              practice flow.
            </motion.p>
          </div>

          <motion.div
            className="border-border/80 border-y"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-80px" }}
          >
            {features.map((feature, index) => (
              <motion.article
                key={feature.name}
                className="border-border/80 grid grid-cols-[3.5rem_1fr] gap-x-5 gap-y-3 border-b py-6 last:border-b-0 sm:grid-cols-[4rem_1fr] sm:gap-x-8 sm:py-8 lg:grid-cols-[4rem_minmax(12rem,0.8fr)_minmax(18rem,1.2fr)] lg:items-start"
                variants={fadeInUp}
              >
                <span className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-xl font-mono text-base font-semibold">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-foreground font-sans text-xl leading-7 font-semibold sm:self-center lg:self-start">
                  {feature.name}
                </h3>
                <p className="text-muted-foreground col-start-2 max-w-xl text-base leading-7 lg:col-start-auto">
                  {feature.description}
                </p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </div>
    </Section>
  );
}
