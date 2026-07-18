"use client";

import { useEffect, type RefObject } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DashboardActionCard,
  DashboardSectionCard,
} from "@/components/dashboard/dashboard-surface";
import { Lock, Sparkles, MessageSquare, TrendingUp, Zap } from "lucide-react";
import { INTERVIEW_TYPE_LABELS, type RoundType } from "@meelni/core";
import { track, AnalyticsEvents } from "@/lib/analytics";
import { getPublicPricingPlans } from "@/lib/billing/catalog-presentation";

interface TierUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestedType: RoundType;
  currentTier: string;
  message: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function TierUpgradeModal({
  isOpen,
  onClose,
  requestedType,
  currentTier,
  message,
  returnFocusRef,
}: TierUpgradeModalProps) {
  const router = useRouter();
  const purchasePlans = getPublicPricingPlans().filter(
    (plan) => plan.canPurchase
  );

  // Track when modal is viewed
  useEffect(() => {
    if (isOpen) {
      track(AnalyticsEvents.UPGRADE_MODAL_VIEWED, {
        requestedType,
        requestedTypeLabel: INTERVIEW_TYPE_LABELS[requestedType],
        currentTier,
      });
    }
  }, [isOpen, requestedType, currentTier]);

  const handleViewPlans = () => {
    // Track CTA click
    track(AnalyticsEvents.UPGRADE_MODAL_CTA_CLICKED, {
      requestedType,
      requestedTypeLabel: INTERVIEW_TYPE_LABELS[requestedType],
      currentTier,
    });

    router.push("/pricing");
    onClose();
  };

  const handleDismiss = () => {
    // Track modal dismissal
    track(AnalyticsEvents.UPGRADE_MODAL_DISMISSED, {
      requestedType,
      requestedTypeLabel: INTERVIEW_TYPE_LABELS[requestedType],
      currentTier,
    });

    onClose();
  };

  const requestedTypeLabel = INTERVIEW_TYPE_LABELS[requestedType];

  const creditFeatures = [
    {
      icon: Sparkles,
      title: "All 4 Interview Types",
      description: "Every credit works across the full PM round set",
    },
    {
      icon: MessageSquare,
      title: "Full Interview Sessions",
      description: "One credit starts one complete AI mock interview",
    },
    {
      icon: TrendingUp,
      title: "Monthly Credit Plans",
      description: "Starter and Pro include rollover for unused credits",
    },
    {
      icon: Zap,
      title: "One-Time Pass",
      description: "Buy a single interview credit without a subscription",
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleDismiss}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
        className="max-w-2xl"
      >
        <DialogHeader className="pr-12">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full">
              <Lock className="text-primary h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="font-display text-2xl font-light">
                Use Credits for {requestedTypeLabel}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                {message || "You need 1 credit to start a full interview."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Tier Info */}
          <DashboardSectionCard
            title="Current Plan"
            action={
              <div className="text-muted-foreground text-sm">
                Limited access
              </div>
            }
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-foreground font-mono text-2xl font-bold capitalize">
                  {currentTier}
                </div>
              </div>
            </div>
          </DashboardSectionCard>

          {/* Pro Features */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="text-primary h-5 w-5" />
              <h3 className="font-display text-foreground text-lg font-light">
                Choose a Credit Option
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {creditFeatures.map((feature, index) => (
                <div
                  key={index}
                  className="border-border bg-card/50 hover:bg-card flex items-start gap-3 rounded-lg border p-3 transition-colors"
                >
                  <div className="bg-primary/10 flex-shrink-0 rounded-lg p-2">
                    <feature.icon className="text-primary h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-foreground mb-1 text-sm font-medium">
                      {feature.title}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {feature.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Highlight */}
          <div className="grid gap-3 md:grid-cols-3">
            {purchasePlans.map((plan) => (
              <DashboardActionCard
                key={plan.catalogId}
                variant={plan.popular ? "accent" : "default"}
                eyebrow={plan.name}
                icon={<Sparkles className="h-5 w-5" />}
                title={plan.creditLabel}
                description={plan.rolloverLabel ?? plan.expirationLabel}
                action={<Sparkles className="text-primary h-6 w-6" />}
              >
                <div className="flex items-baseline gap-1">
                  <span className="text-foreground text-2xl font-bold">
                    {plan.priceLabel}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    /{plan.frequencyLabel}
                  </span>
                </div>
              </DashboardActionCard>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-row [&_button]:min-h-11">
          <Button
            variant="outline"
            onClick={handleDismiss}
            className="order-2 w-full sm:order-1 sm:w-auto"
          >
            Maybe Later
          </Button>
          <Button
            onClick={handleViewPlans}
            className="bg-primary text-primary-foreground hover:bg-primary/90 order-1 w-full sm:order-2 sm:w-auto"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            View Plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
