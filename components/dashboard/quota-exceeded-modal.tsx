"use client";

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
import { Badge } from "@/components/ui/badge";
import {
  DashboardActionCard,
  DashboardSectionCard,
} from "@/components/dashboard/dashboard-surface";
import {
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Crown,
  TrendingUp,
  MessageSquare,
  Zap,
} from "lucide-react";

interface QuotaExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsage: number;
  limit: number;
  resetDate: string | null;
}

export function QuotaExceededModal({
  isOpen,
  onClose,
  currentUsage,
  limit,
  resetDate,
}: QuotaExceededModalProps) {
  const router = useRouter();

  const handleViewPlans = () => {
    router.push("/pricing");
    onClose();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "soon";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const upgradeBenefits = [
    {
      icon: Sparkles,
      title: "Unlimited Interviews",
      description: "Practice as much as you want with no monthly limits",
    },
    {
      icon: MessageSquare,
      title: "Advanced Feedback",
      description: "Get detailed AI-powered insights after every session",
    },
    {
      icon: TrendingUp,
      title: "Performance Analytics",
      description: "Track your progress with comprehensive analytics",
    },
    {
      icon: Zap,
      title: "Priority Support",
      description: "Get help when you need it with priority access",
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-warning/10 flex h-12 w-12 items-center justify-center rounded-full">
              <AlertCircle className="text-warning h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="font-display text-2xl font-light">
                Monthly Quota Reached
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                You've used all {limit} interviews this month
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Usage */}
          <DashboardSectionCard
            title="Current Usage"
            action={
              <Badge variant="warning">
                Quota Exceeded
              </Badge>
            }
            contentClassName="space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-foreground font-mono text-2xl font-bold">
                  {currentUsage} / {limit}
                </div>
              </div>
            </div>
            <div className="text-muted-foreground text-sm">
              Your quota resets on {formatDate(resetDate)}
            </div>
          </DashboardSectionCard>

          {/* Upgrade Benefits */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Crown className="text-primary h-5 w-5" />
              <h3 className="font-display text-foreground text-lg font-light">
                Upgrade to Pro for Unlimited Access
              </h3>
            </div>

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
          </div>

          {/* Pricing Highlight */}
          <DashboardActionCard
            variant="accent"
            eyebrow="Pro Plan"
            icon={<Crown className="h-5 w-5" />}
            title="Unlimited practice for $29/month"
            description="Or save 17% with annual billing."
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
            onClick={onClose}
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
