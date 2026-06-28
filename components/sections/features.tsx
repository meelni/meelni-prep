"use client";

import { Section } from "@/components/section";
import { siteConfig } from "@/lib/config";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const featureTones = [
  {
    badge: "border-primary/20 bg-primary/10 text-primary",
    title: "group-hover:text-primary",
    shadow: "hover:shadow-primary/10",
  },
  {
    badge: "border-info/20 bg-info/10 text-info",
    title: "group-hover:text-info",
    shadow: "hover:shadow-info/10",
  },
  {
    badge: "border-success/20 bg-success/10 text-success",
    title: "group-hover:text-success",
    shadow: "hover:shadow-success/10",
  },
  {
    badge: "border-warning/20 bg-warning/10 text-warning",
    title: "group-hover:text-warning",
    shadow: "hover:shadow-warning/10",
  },
];

export function Features() {
  const features = siteConfig.features;

  return (
    <Section id="features">
      <div className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <motion.h2
              className="text-display-lg font-display font-light text-foreground mb-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              Everything you need to ace your PM interview
            </motion.h2>
            <motion.p
              className="text-body text-muted-foreground max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Proven tools and frameworks used by PMs at top tech companies
            </motion.p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.name}
                className="group relative"
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.6,
                  delay: index * 0.1,
                  type: "spring",
                  bounce: 0.3
                }}
              >
                {/* Card with glass morphism and semantic tone feedback */}
                <div className={cn(
                  "relative w-full p-6 rounded-2xl border border-border/60 bg-card/50 backdrop-blur-md transition-all duration-300 hover:-translate-y-2",
                  "hover:border-primary/50 hover:shadow-2xl",
                  featureTones[index % featureTones.length].shadow
                )}>
                  {/* Number Badge */}
                  <div className="absolute top-6 right-6 z-20 transition-opacity duration-300 opacity-70 group-hover:opacity-100">
                    <span
                      className={cn(
                        "inline-flex min-w-9 items-center justify-center rounded-full border px-2 py-1 text-code-sm font-mono font-normal",
                        featureTones[index % featureTones.length].badge
                      )}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="relative z-10">
                    <h3 className={cn(
                      "text-xl leading-7 font-sans font-semibold text-foreground mb-2 transition-colors duration-300 tracking-tight",
                      featureTones[index % featureTones.length].title
                    )}>
                      {feature.name}
                    </h3>
                    <p className="text-body text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>

                  {/* Shimmer effect on hover */}
                  <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

    </Section>
  );
}
