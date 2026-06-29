"use client";

import Link from "next/link";
import { Section } from "@/components/section";
import { motion } from "framer-motion";
import { AlertCircle, Check } from "lucide-react";
import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/config";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import { useFeatureFlag } from "@/lib/feature-flags";

export function Pricing() {
  const reactivationEnabled = useFeatureFlag(FEATURE_GATES.meelniReactivationAccess);

  return (
    <Section id="pricing">
      <div className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-12">
            <motion.h2
              className="text-display-lg font-display font-light text-foreground mb-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              Pricing
            </motion.h2>
          </div>

          {reactivationEnabled ? (
            <div className="grid gap-4 md:grid-cols-2">
              {siteConfig.pricing.map((plan, index) => (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                >
                  <AppSurface
                    variant={plan.popular ? "default" : "muted"}
                    size="lg"
                    className="flex h-full flex-col"
                  >
                    {plan.popular && (
                      <StatusPill tone="success" className="mb-4 w-fit">
                        Most popular
                      </StatusPill>
                    )}
                    <AppSurfaceTitle className="font-display text-xl">
                      {plan.name}
                    </AppSurfaceTitle>
                    <AppSurfaceDescription className="mt-2 text-sm">
                      {plan.description}
                    </AppSurfaceDescription>
                    <div className="mt-6 flex items-end gap-1">
                      <span className="font-display text-4xl font-light">
                        {plan.price.monthly}
                      </span>
                      <span className="pb-1 text-sm text-muted-foreground">
                        /{plan.frequency.monthly}
                      </span>
                    </div>
                    <div className="mt-4 text-sm font-medium">{plan.usage}</div>
                    <div className="text-xs text-muted-foreground">
                      {plan.usageDetail}
                    </div>
                    <ul className="mt-6 flex-1 space-y-3 text-sm">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button asChild className="mt-6 w-full">
                      <Link href="/dashboard">{plan.cta}</Link>
                    </Button>
                  </AppSurface>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mx-auto max-w-2xl"
            >
              <AppSurface variant="muted" size="lg" className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10 text-warning">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <StatusPill tone="warning" className="mb-4">
                  Subscription Update
                </StatusPill>
                <AppSurfaceTitle className="font-display text-xl">
                  Service Discontinued
                </AppSurfaceTitle>
                <AppSurfaceDescription className="mx-auto mt-3 max-w-lg text-sm leading-relaxed">
                  Meelni is no longer accepting new subscriptions. Thank you to everyone who supported our AI-powered mock interview platform.
                </AppSurfaceDescription>
              </AppSurface>
            </motion.div>
          )}
        </div>
      </div>
    </Section>
  );
}
