"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { fadeInUp } from "@/lib/animations";

export function ExploreHero() {
  return (
    <section className="relative px-4 pt-24 pb-12 sm:px-6 sm:pt-32 sm:pb-16">
      {/* Radial gradient background */}
      <div className="absolute inset-0 -z-10">
        <div className="bg-[radial-gradient(circle_at_50%_0%,color-mix(in oklab, var(--primary) 8%, transparent),transparent_70%)] absolute inset-0" />
      </div>

      {/* Content */}
      <div className="mx-auto max-w-screen-2xl space-y-6 text-center">
        {/* Badge */}
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <Badge
            variant="subtle"
            className="bg-primary/10 border-primary/20 text-primary"
          >
            Curated PM practice • Free to browse
          </Badge>
        </motion.div>

        {/* Heading */}
        <motion.h1
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.1 }}
          className="font-display text-foreground text-4xl font-bold sm:text-5xl lg:text-6xl"
        >
          Explore PM Interview Practice Questions
        </motion.h1>

        {/* Subheading */}
        <motion.p
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.2 }}
          className="text-muted-foreground mx-auto max-w-3xl text-lg sm:text-xl"
        >
          Browse by company and round type, then practice an answer out loud.
        </motion.p>
      </div>
    </section>
  );
}
