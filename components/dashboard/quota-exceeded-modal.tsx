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
import { Card } from "@/components/ui/card";
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
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-display font-light">
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
          <Card className="p-4 bg-muted/30 border-border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Current Usage</div>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {currentUsage} / {limit}
                </div>
              </div>
              <Badge variant="outline" className="border-orange-500/50 text-orange-500">
                Quota Exceeded
              </Badge>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              Your quota resets on {formatDate(resetDate)}
            </div>
          </Card>

          {/* Upgrade Benefits */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Crown className="w-5 h-5 text-primary" />
              <h3 className="font-display font-light text-lg text-foreground">
                Upgrade to Pro for Unlimited Access
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {upgradeBenefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors"
                >
                  <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                    <benefit.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground mb-1">
                      {benefit.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {benefit.description}
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
                  <span className="text-3xl font-bold text-foreground">$19</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Or save 17% with annual billing
                </div>
              </div>
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
          </Card>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={onClose}
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
