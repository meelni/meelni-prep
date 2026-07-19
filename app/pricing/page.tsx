"use client";

import Link from "next/link";
import { AlertCircle, Check, Loader2 } from "lucide-react";
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
import {
  parseCheckoutCreateResponse,
  storeCheckoutReturnHandle,
} from "@/lib/billing/checkout-return-cookie";
import { PUBLIC_ACTIVATION_PAUSED_LABEL } from "@/lib/feature-flags/public-activation";
import { usePublicActivationDecision } from "@/lib/feature-flags/public-activation-client";
import { NEW_INTERVIEW_PATH } from "@/lib/navigation/interview-launch";

export default function PricingPage() {
  const activation = usePublicActivationDecision();
  const reactivationEnabled = activation.canActivate;
  const [loadingCatalogId, setLoadingCatalogId] = useState<string | null>(null);
  const plans = getPublicPricingPlans();

  async function handlePlanClick(plan: PublicPricingPlan) {
    if (!activation.canActivate) return;

    if (!plan.canPurchase) {
      window.location.href = NEW_INTERVIEW_PATH;
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

      const data = parseCheckoutCreateResponse(await response.json());
      if (
        !data ||
        !storeCheckoutReturnHandle(window.sessionStorage, data.returnHandle)
      ) {
        throw new Error("Invalid checkout response");
      }
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
      <section className="border-border/60 border-b py-20">
        <div className="container mx-auto px-4">
          <div>
            <MarketingHero
              className="mb-0"
              eyebrow={
                <MarketingEyebrow
                  icon={reactivationEnabled ? Check : AlertCircle}
                >
                  {reactivationEnabled ? "Plans" : "Subscription Update"}
                </MarketingEyebrow>
              }
              title="Pricing"
              description={
                reactivationEnabled
                  ? "Choose credits for full PM mock interviews. Every credit unlocks any round type."
                  : "Meelni is not currently accepting new subscriptions or PM interview practice sessions."
              }
            />
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto max-w-6xl px-4">
          {!reactivationEnabled && (
            <MarketingCtaCard
              className="mb-8"
              tone="muted"
              mark={<AlertCircle className="h-6 w-6" aria-hidden="true" />}
              title="Purchases currently paused"
              description="Pricing is shown for reference. New purchases and practice sessions are currently paused while we prepare the next version."
              action={null}
              role="status"
            />
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <div key={plan.catalogId}>
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
                  <h2 className="font-display text-2xl font-light">
                    {plan.name}
                  </h2>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {plan.description}
                  </p>
                  <div className="mt-6 flex items-end gap-1">
                    <span className="font-display text-4xl font-light">
                      {plan.priceLabel}
                    </span>
                    <span className="text-muted-foreground pb-1 text-sm">
                      /{plan.frequencyLabel}
                    </span>
                  </div>
                  <div className="mt-4 text-sm font-medium">
                    {plan.creditLabel}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {plan.expirationLabel}
                  </div>
                  {plan.rolloverLabel && (
                    <div className="text-muted-foreground mt-2 text-xs">
                      {plan.rolloverLabel}
                    </div>
                  )}
                  <ul className="mt-6 flex-1 space-y-3 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-6 w-full"
                    size="lg"
                    onClick={() => void handlePlanClick(plan)}
                    disabled={
                      !activation.canActivate ||
                      loadingCatalogId === plan.catalogId
                    }
                    variant={plan.canPurchase ? "default" : "outline"}
                  >
                    {loadingCatalogId === plan.catalogId && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {activation.canActivate
                      ? plan.cta
                      : PUBLIC_ACTIVATION_PAUSED_LABEL}
                  </Button>
                </AppSurface>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-border border-t py-12">
        <div className="text-muted-foreground container mx-auto px-4 text-center text-sm">
          <p>&copy; 2025 Meelni. All rights reserved.</p>
          <div className="mt-4 flex justify-center gap-6">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy draft
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms draft
            </Link>
          </div>
        </div>
      </footer>
    </MarketingPage>
  );
}
