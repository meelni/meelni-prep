"use client";

import { Section } from "@/components/section";
import { siteConfig } from "@/lib/config";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Color schemes for each feature (for unique glows)
const featureColors = [
  { gradient: "from-cyan-500 to-blue-500", glow: "via-cyan-500", iconBg: "bg-gradient-to-br from-cyan-500 to-blue-500" },
  { gradient: "from-purple-500 to-pink-500", glow: "via-purple-500", iconBg: "bg-gradient-to-br from-purple-500 to-pink-500" },
  { gradient: "from-orange-500 to-red-500", glow: "via-orange-500", iconBg: "bg-gradient-to-br from-orange-500 to-red-500" },
  { gradient: "from-green-500 to-emerald-500", glow: "via-green-500", iconBg: "bg-gradient-to-br from-green-500 to-emerald-500" },
  { gradient: "from-blue-500 to-indigo-500", glow: "via-blue-500", iconBg: "bg-gradient-to-br from-blue-500 to-indigo-500" },
  { gradient: "from-pink-500 to-purple-500", glow: "via-pink-500", iconBg: "bg-gradient-to-br from-pink-500 to-purple-500" },
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
                {/* Card with glass morphism */}
                <div className={cn(
                  "relative w-full p-6 rounded-2xl border border-border bg-background/60 backdrop-blur-sm shadow-[2px_4px_12px_0px_rgba(0,0,0,0.1)_inset] transition-all duration-300 hover:shadow-xl hover:-translate-y-2",
                  "hover:border-primary/30"
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
