"use client";

import { useEffect } from "react";
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
  Lock,
  Crown,
  CheckCircle2,
  Sparkles,
  MessageSquare,
  TrendingUp,
  Zap,
} from "lucide-react";
import { INTERVIEW_TYPE_LABELS, type RoundType } from "@meelni/core";
import { track, AnalyticsEvents } from "@/lib/analytics";

interface TierUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestedType: RoundType;
  currentTier: string;
  message: string;
}

export function TierUpgradeModal({
  isOpen,
  onClose,
  requestedType,
  currentTier,
  message,
}: TierUpgradeModalProps) {
  const router = useRouter();

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

  const proFeatures = [
    {
      icon: Sparkles,
      title: "All 4 Interview Types",
      description: "Product Sense, Behavioral, Execution, and Strategy",
    },
    {
      icon: MessageSquare,
      title: "Unlimited Interviews",
      description: "Practice as much as you want with no monthly limits",
    },
    {
      icon: TrendingUp,
      title: "2,879 Curated Questions",
      description:
        "Access our complete database of real PM interview questions",
    },
    {
      icon: Zap,
      title: "Advanced Feedback",
      description: "Detailed framework rubrics and improvement drills",
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleDismiss}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full">
              <Lock className="text-primary h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="font-display text-2xl font-light">
                Unlock {requestedTypeLabel} Interviews
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                {message}
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
              <Crown className="text-primary h-5 w-5" />
              <h3 className="font-display text-foreground text-lg font-light">
                Upgrade to Pro for Full Access
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {proFeatures.map((feature, index) => (
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
          <DashboardActionCard
            variant="accent"
            eyebrow="Pro Plan"
            icon={<Crown className="h-5 w-5" />}
            title="Full access for $29/month"
            description="Or save 31% with annual billing."
            action={<CheckCircle2 className="text-primary h-8 w-8" />}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-foreground text-3xl font-bold">$29</span>
              <span className="text-muted-foreground">/month</span>
            </div>
          </DashboardActionCard>
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-row">
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
            <Crown className="mr-2 h-4 w-4" />
            View Plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
