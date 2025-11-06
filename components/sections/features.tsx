"use client";

import { Section } from "@/components/section";
import { siteConfig } from "@/lib/config";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Color schemes for each feature - vibrant for dark backgrounds
const featureColors = [
  { gradient: "from-cyan-400 to-blue-500", glow: "shadow-cyan-500/20", iconBg: "bg-gradient-to-br from-cyan-400 to-blue-500" },
  { gradient: "from-purple-400 to-pink-500", glow: "shadow-purple-500/20", iconBg: "bg-gradient-to-br from-purple-400 to-pink-500" },
  { gradient: "from-orange-400 to-red-500", glow: "shadow-orange-500/20", iconBg: "bg-gradient-to-br from-orange-400 to-red-500" },
  { gradient: "from-green-400 to-emerald-500", glow: "shadow-green-500/20", iconBg: "bg-gradient-to-br from-green-400 to-emerald-500" },
  { gradient: "from-blue-400 to-indigo-500", glow: "shadow-blue-500/20", iconBg: "bg-gradient-to-br from-blue-400 to-indigo-500" },
  { gradient: "from-pink-400 to-purple-500", glow: "shadow-pink-500/20", iconBg: "bg-gradient-to-br from-pink-400 to-purple-500" },
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                {/* Card with glass morphism and glow */}
                <div className={cn(
                  "relative w-full p-6 rounded-2xl border border-border/60 bg-card/50 backdrop-blur-md transition-all duration-300 hover:-translate-y-2",
                  "hover:border-primary/50 hover:shadow-2xl",
                  featureColors[index].glow
                )}>
                  {/* Number Badge */}
                  <div className="absolute top-6 right-6 opacity-30 group-hover:opacity-100 transition-opacity duration-300 z-20">
                    <span className={cn(
                      "text-code-sm font-mono font-normal bg-gradient-to-r bg-clip-text text-transparent",
                      featureColors[index].gradient
                    )}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="relative z-10">
                    <h3 className={cn(
                      "text-[20px] leading-[28px] font-sans font-semibold text-foreground mb-2 transition-all duration-300 tracking-tight",
                      "group-hover:bg-gradient-to-r group-hover:bg-clip-text group-hover:text-transparent",
                      featureColors[index].gradient
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
