"use client";

import type { RefObject } from "react";
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
import {
  AlertCircle,
  Sparkles,
  TrendingUp,
  MessageSquare,
  Zap,
} from "lucide-react";
import { getPublicPricingPlans } from "@/lib/billing/catalog-presentation";

interface QuotaExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsage: number;
  limit: number;
  resetDate: string | null;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function QuotaExceededModal({
  isOpen,
  onClose,
  returnFocusRef,
}: QuotaExceededModalProps) {
  const router = useRouter();
  const purchasePlans = getPublicPricingPlans().filter(
    (plan) => plan.canPurchase
  );

  const handleViewPlans = () => {
    router.push("/pricing");
    onClose();
  };

  const upgradeBenefits = [
    {
      icon: Sparkles,
      title: "Any PM Round",
      description:
        "Use credits for Product Sense, Behavioral, Execution, or Strategy",
    },
    {
      icon: MessageSquare,
      title: "Full Interviews",
      description: "One credit starts one complete AI mock interview",
    },
    {
      icon: TrendingUp,
      title: "Rollover Plans",
      description: "Starter and Pro can roll unused monthly credits forward",
    },
    {
      icon: Zap,
      title: "Flexible Purchase",
      description: "Buy one pass or choose a monthly credit plan",
    },
  ];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
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
            <div className="bg-warning/10 flex h-12 w-12 items-center justify-center rounded-full">
              <AlertCircle className="text-warning h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="font-display text-2xl font-light">
                No Credits Available
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                You need 1 interview credit to start a full mock interview.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          <DashboardSectionCard
            title="Purchase options"
            description="Each credit starts one complete PM mock interview."
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {upgradeBenefits.map((benefit, index) => (
                <div
                  key={index}
                  className="border-border bg-card/50 hover:bg-card flex items-start gap-3 rounded-lg border p-3 transition-colors"
                >
                  <div className="bg-primary/10 flex-shrink-0 rounded-lg p-2">
                    <benefit.icon className="text-primary h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-foreground mb-1 text-sm font-medium">
                      {benefit.title}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {benefit.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DashboardSectionCard>

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
            onClick={onClose}
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
