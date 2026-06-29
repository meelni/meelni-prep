"use client";

import { Section } from "@/components/section";
import { motion } from "framer-motion";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import {
  getPublicPricingPlans,
  type PublicPricingPlan,
} from "@/lib/billing/catalog-presentation";
import type { StripeCheckoutCatalogId } from "@/lib/billing/stripe-catalog";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import { useFeatureFlag } from "@/lib/feature-flags";

export function Pricing() {
  const reactivationEnabled = useFeatureFlag(FEATURE_GATES.meelniReactivationAccess);
  const [loadingCatalogId, setLoadingCatalogId] = useState<string | null>(null);
  const plans = getPublicPricingPlans();

  async function handlePlanClick(plan: PublicPricingPlan) {
    if (!plan.canPurchase) {
      window.location.href = "/setup";
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan, index) => (
                <motion.div
                  key={plan.catalogId}
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
