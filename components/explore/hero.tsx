"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { fadeInUp } from "@/lib/animations";

export function ExploreHero() {
  return (
    <section className="relative pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6">
      {/* Radial gradient background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgb(var(--primary)/0.08),transparent_70%)]" />
      </div>

      {/* Content */}
      <div className="max-w-screen-2xl mx-auto text-center space-y-6">
        {/* Badge */}
        <motion.div
          variants={fadeInUp}
          initial="initial"
          animate="animate"
        >
          <Badge variant="subtle" className="bg-primary/10 border-primary/20 text-primary">
            Updated weekly • Free to browse
          </Badge>
        </motion.div>

        {/* Heading */}
        <motion.h1
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-foreground"
        >
          Explore 2,879+ Real Interview Questions
        </motion.h1>

        {/* Subheading */}
        <motion.p
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.2 }}
          className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto"
        >
          Practice questions from Google, Meta, Amazon, and 100+ top companies
        </motion.p>
      </div>
    </section>
  );
}
