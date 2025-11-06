"use client";

import { motion } from "framer-motion";

export default function BlogHeader() {
  return (
    <div className="text-center mb-16">
      <motion.h2
        className="text-display-lg font-display font-light text-foreground mb-4"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        Latest from our blog
      </motion.h2>
      <motion.p
        className="text-body text-muted-foreground max-w-2xl mx-auto"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        Tips, insights, and strategies to help you ace your PM interviews
      </motion.p>
    </div>
  );
}
