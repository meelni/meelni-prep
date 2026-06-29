"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Check } from "lucide-react";
import {
  MarketingCtaCard,
  MarketingEyebrow,
  MarketingHero,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/sections/header";
import { AppSurface, StatusPill } from "@/components/ui/app-surface";
import { siteConfig } from "@/lib/config";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import { useFeatureFlag } from "@/lib/feature-flags";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

export default function PricingPage() {
  const reactivationEnabled = useFeatureFlag(FEATURE_GATES.meelniReactivationAccess);

  return (
    <MarketingPage>
      {/* Header */}
      <Header />

      {/* Hero Section */}
      <section className="border-b border-border/60 py-20">
        <div className="container mx-auto px-4">
          <motion.div {...fadeInUp}>
            <MarketingHero
              className="mb-0"
              eyebrow={
                <MarketingEyebrow icon={reactivationEnabled ? Check : AlertCircle}>
                  {reactivationEnabled ? "Plans" : "Subscription Update"}
                </MarketingEyebrow>
              }
              title="Pricing"
              description={
                reactivationEnabled
                  ? "Choose a plan for mock interviews, question practice, and progress tracking."
                  : "Meelni is no longer accepting new subscriptions, but the public demo remains available from the homepage."
              }
            />
          </motion.div>
        </div>
      </section>

      {reactivationEnabled ? (
        <section className="py-20">
          <div className="container mx-auto grid max-w-5xl gap-4 px-4 md:grid-cols-2">
            {siteConfig.pricing.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
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
                  <h2 className="font-display text-2xl font-light">{plan.name}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {plan.description}
                  </p>
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
        </section>
      ) : (
        <section className="py-20">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mx-auto max-w-2xl"
            >
              <MarketingCtaCard
                tone="muted"
                mark={<AlertCircle className="h-7 w-7" />}
                title="Service Discontinued"
                description="Meelni is no longer accepting new subscriptions. We appreciate everyone who supported our AI-powered mock interview platform during its operation."
                action={
                  <Button asChild variant="outline" size="lg">
                    <Link href="/">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to Home
                    </Link>
                  </Button>
                }
                footer="You can still try our demo on the homepage to experience what Meelni was like."
              />
            </motion.div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 Meelni. All rights reserved.</p>
          <div className="mt-4 flex justify-center gap-6">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </MarketingPage>
  );
}
