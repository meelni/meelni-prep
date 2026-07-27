"use client";

import { Section } from "@/components/section";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CheckoutStartError,
  CHECKOUT_START_ERROR_MESSAGE,
} from "@/components/checkout-start-error";
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

export function Pricing() {
  const [loadingCatalogId, setLoadingCatalogId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const activation = usePublicActivationDecision();
  const plans = getPublicPricingPlans();

  async function handlePlanClick(plan: PublicPricingPlan) {
    if (!activation.canActivate) return;

    if (!plan.canPurchase) {
      window.location.href = NEW_INTERVIEW_PATH;
      return;
    }

    setLoadingCatalogId(plan.catalogId);
    setCheckoutError(null);

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
      setCheckoutError(CHECKOUT_START_ERROR_MESSAGE);
      setLoadingCatalogId(null);
    }
  }

  return (
    <Section id="pricing">
      <div className="border-border/50 border-y bg-[#F6F7F9] px-4 py-20 sm:px-6 lg:px-8 dark:bg-[#15161B]">
        <div className="mx-auto max-w-6xl">
          <div className="mb-9 max-w-xl">
            <div className="text-section-eyebrow text-primary mb-3">
              Pricing
            </div>
            <h2 className="text-display-section text-foreground">
              Buy the amount of practice you need.
            </h2>
          </div>
          <CheckoutStartError message={checkoutError} className="mb-6" />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <article
                key={plan.catalogId}
                className="bg-card border-border flex min-h-[262px] flex-col rounded-2xl border p-6"
              >
                <h3 className="text-foreground text-lg leading-6 font-bold">
                  {plan.name}
                </h3>
                <div className="text-card-price text-foreground mt-5">
                  {plan.priceLabel}
                </div>
                <p className="text-muted-foreground mt-5 text-sm leading-[22px]">
                  {plan.description}
                </p>
                <Button
                  className="mt-auto h-[42px] w-full rounded-full font-bold"
                  onClick={() => void handlePlanClick(plan)}
                  disabled={
                    !activation.canActivate ||
                    loadingCatalogId === plan.catalogId
                  }
                  variant="outline"
                >
                  {loadingCatalogId === plan.catalogId && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {activation.canActivate
                    ? plan.cta
                    : PUBLIC_ACTIVATION_PAUSED_LABEL}
                </Button>
              </article>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
