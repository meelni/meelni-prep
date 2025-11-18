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
import { Card } from "@/components/ui/card";
import {
  Lock,
  Crown,
  CheckCircle2,
  Sparkles,
  MessageSquare,
  TrendingUp,
  Zap,
} from "lucide-react";
import { INTERVIEW_TYPE_LABELS, type RoundType } from "@/lib/services/permissions-service";
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
      description: "Access our complete database of real PM interview questions",
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
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-display font-light">
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
          <Card className="p-4 bg-muted/30 border-border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Current Plan</div>
                <div className="text-2xl font-bold font-mono text-foreground capitalize">
                  {currentTier}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Limited access
              </div>
            </div>
          </Card>

          {/* Pro Features */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Crown className="w-5 h-5 text-primary" />
              <h3 className="font-display font-light text-lg text-foreground">
                Upgrade to Pro for Full Access
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {proFeatures.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors"
                >
                  <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                    <feature.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground mb-1">
                      {feature.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {feature.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Highlight */}
          <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Pro Plan</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-foreground">$29</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Or save 31% with annual billing
                </div>
              </div>
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
          </Card>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleDismiss}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            Maybe Later
          </Button>
          <Button
            onClick={handleViewPlans}
            className="w-full sm:w-auto order-1 sm:order-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Crown className="w-4 h-4 mr-2" />
            View Plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
