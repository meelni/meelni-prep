"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  MarketingCtaCard,
  MarketingEyebrow,
  MarketingHero,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/sections/header";
import { AppSurface, StatusPill } from "@/components/ui/app-surface";
import {
  getPublicPricingPlans,
  type PublicPricingPlan,
} from "@/lib/billing/catalog-presentation";
import type { StripeCheckoutCatalogId } from "@/lib/billing/stripe-catalog";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import { useFeatureFlag } from "@/lib/feature-flags";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

export default function PricingPage() {
  const reactivationEnabled = useFeatureFlag(FEATURE_GATES.meelniReactivationAccess);
  const [loadingCatalogId, setLoadingCatalogId] = useState<string | null>(null);
  const plans = getPublicPricingPlans();

  async function handlePlanClick(plan: PublicPricingPlan) {
    if (!plan.canPurchase) {
      window.location.href = "/dashboard/new-rep";
      return;
    }

    setLoadingCatalogId(plan.catalogId);

    try {
      const response = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogId: plan.catalogId as StripeCheckoutCatalogId,
        }),
      });

      if (response.status === 401) {
        window.location.href = "/auth/signup?redirectTo=/pricing";
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to start checkout");
      }

      const data = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error("Checkout start failed:", error);
      setLoadingCatalogId(null);
    }
  }

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
                  ? "Choose credits for full PM mock interviews. Every credit unlocks any round type."
                  : "Meelni is no longer accepting new subscriptions, but the public demo remains available from the homepage."
              }
            />
          </motion.div>
        </div>
      </section>

      {reactivationEnabled ? (
        <section className="py-20">
          <div className="container mx-auto grid max-w-6xl gap-4 px-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.catalogId}
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
                      {plan.priceLabel}
                    </span>
                    <span className="pb-1 text-sm text-muted-foreground">
                      /{plan.frequencyLabel}
                    </span>
                  </div>
                  <div className="mt-4 text-sm font-medium">
                    {plan.creditLabel}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {plan.expirationLabel}
                  </div>
                  {plan.rolloverLabel && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {plan.rolloverLabel}
                    </div>
                  )}
                  <ul className="mt-6 flex-1 space-y-3 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-6 w-full"
                    onClick={() => void handlePlanClick(plan)}
                    disabled={loadingCatalogId === plan.catalogId}
                    variant={plan.canPurchase ? "default" : "outline"}
                  >
                    {loadingCatalogId === plan.catalogId && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {plan.cta}
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
