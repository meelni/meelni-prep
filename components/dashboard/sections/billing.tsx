"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard,
  ExternalLink,
  Sparkles,
  AlertCircle,
  FileText,
  Loader2,
  Crown,
  Infinity,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

// Type definitions
interface Subscription {
  tier: "free" | "pro" | "premium";
  status: "active" | "trialing" | "canceled" | "past_due";
  billingCycle?: "monthly" | "annual";
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  price?: number; // in cents
  currency?: string;
}

interface Usage {
  currentUsage: number;
  limit: number | null; // null = unlimited
  periodStart: string;
  periodEnd: string;
}

interface Payment {
  id: string;
  amount: number; // in cents
  currency: string;
  status: "succeeded" | "pending" | "failed";
  createdAt: string;
  receiptUrl?: string;
}

export function BillingSection() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managingSubscription, setManagingSubscription] = useState(false);

  // Fetch subscription data
  useEffect(() => {
    async function fetchSubscription() {
      try {
        const response = await fetch("/api/billing/subscription");
        if (!response.ok) {
          throw new Error("Failed to fetch subscription");
        }
        const data = await response.json();
        setSubscription(data);
      } catch (err) {
        console.error("Error fetching subscription:", err);
        setError("Failed to load subscription data");
      } finally {
        setLoadingSubscription(false);
      }
    }

    fetchSubscription();
  }, []);

  // Fetch usage data
  useEffect(() => {
    async function fetchUsage() {
      try {
        const response = await fetch("/api/billing/usage");
        if (!response.ok) {
          throw new Error("Failed to fetch usage");
        }
        const data = await response.json();

        // Map API response to component state
        setUsage({
          currentUsage: data.interviewsUsed,
          limit: data.interviewsLimit === -1 ? null : data.interviewsLimit,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
        });
      } catch (err) {
        console.error("Error fetching usage:", err);
        setError("Failed to load usage data");
      } finally {
        setLoadingUsage(false);
      }
    }

    fetchUsage();
  }, []);

  // Fetch payment history
  useEffect(() => {
    async function fetchPayments() {
      try {
        const response = await fetch("/api/billing/payment-history");
        if (!response.ok) {
          throw new Error("Failed to fetch payments");
        }
        const data = await response.json();
        setPayments(data.payments || []);
      } catch (err) {
        console.error("Error fetching payments:", err);
        setError("Failed to load payment history");
      } finally {
        setLoadingPayments(false);
      }
    }

    fetchPayments();
  }, []);

  // Handle manage subscription
  async function handleManageSubscription() {
    setManagingSubscription(true);
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to create portal session");
      }

      const { portalUrl, url } = await response.json();
      window.location.href = portalUrl || url;
    } catch (err) {
      console.error("Error opening billing portal:", err);
      alert("Failed to open billing portal. Please try again.");
      setManagingSubscription(false);
    }
  }

  // Helper: Get tier badge color
  function getTierBadgeVariant(tier: Subscription["tier"]) {
    switch (tier) {
      case "free":
        return "outline" as const;
      case "pro":
        return "default" as const;
      case "premium":
        return "success" as const;
      default:
        return "outline" as const;
    }
  }

  // Helper: Get status badge color
  function getStatusBadgeVariant(status: Subscription["status"]) {
    switch (status) {
      case "active":
        return "success" as const;
      case "trialing":
        return "default" as const;
      case "canceled":
        return "secondary" as const;
      case "past_due":
        return "destructive" as const;
      default:
        return "outline" as const;
    }
  }

  // Helper: Get usage percentage
  function getUsagePercentage(): number {
    if (!usage || usage.limit === null) return 0;
    return Math.round((usage.currentUsage / usage.limit) * 100);
  }

  // Helper: Check if approaching quota
  function isApproachingQuota(): boolean {
    if (!usage || usage.limit === null) return false;
    return getUsagePercentage() >= 80;
  }

  // Loading state
  const isLoading = loadingSubscription || loadingUsage || loadingPayments;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading billing information...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="p-6 flex items-center gap-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">Failed to load billing data</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showUpgradeBanner = subscription?.tier === "free" && (usage?.currentUsage || 0) >= 1;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-display font-light text-foreground">Billing & Subscription</h2>
        <p className="text-muted-foreground font-sans">
          Manage your subscription, view usage, and access payment history.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Card */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
              Current Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {subscription ? (
              <>
                {/* Tier and Status */}
                <div className="flex items-center gap-3">
                  <Badge variant={getTierBadgeVariant(subscription.tier)} className="text-sm">
                    {subscription.tier === "premium" && <Crown className="w-3 h-3 mr-1" />}
                    {subscription.tier.toUpperCase()}
                  </Badge>
                  <Badge variant={getStatusBadgeVariant(subscription.status)} className="text-xs">
                    {subscription.status === "trialing"
                      ? "FREE TRIAL"
                      : subscription.status.replace("_", " ").toUpperCase()}
                  </Badge>
                </div>

                {/* Billing Info */}
                {subscription.tier !== "free" && subscription.price && (
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold font-mono text-foreground">
                        {formatCurrency(subscription.price, subscription.currency || "USD")}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        /{subscription.billingCycle === "annual" ? "year" : "month"}
                      </span>
                    </div>
                    {subscription.currentPeriodEnd && (
                      <p className="text-sm text-muted-foreground">
                        {subscription.status === "trialing"
                          ? "Trial ends on"
                          : subscription.cancelAtPeriodEnd
                            ? "Ends on"
                            : "Renews on"}{" "}
                        {formatDate(subscription.currentPeriodEnd)}
                      </p>
                    )}
                  </div>
                )}

                {/* Trial status message */}
                {subscription.status === "trialing" && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-sm text-foreground">
                      <strong>Free Trial Active</strong> - You have full access to {subscription.tier.toUpperCase()} features.
                      No charges until your trial ends.
                    </p>
                  </div>
                )}

                {/* Free tier message */}
                {subscription.tier === "free" && (
                  <p className="text-sm text-muted-foreground">
                    You're on the free tier with limited interviews per month.
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  {subscription.tier === "free" ? (
                    <Button
                      onClick={() => (window.location.href = "/pricing")}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Upgrade Plan
                    </Button>
                  ) : (
                    <Button
                      onClick={handleManageSubscription}
                      disabled={managingSubscription}
                      variant="outline"
                      className="w-full"
                    >
                      {managingSubscription ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Manage Subscription
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No subscription data available</p>
            )}
          </CardContent>
        </Card>

        {/* Usage Quota Card */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
              Usage This Period
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {usage ? (
              <>
                {/* Usage Stats */}
                <div className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold font-mono text-foreground">
                      {usage.currentUsage}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      / {usage.limit === null ? "∞" : usage.limit} interviews
                    </span>
                    {usage.limit === null && (
                      <Badge variant="success" className="ml-2">
                        <Infinity className="w-3 h-3 mr-1" />
                        Unlimited
                      </Badge>
                    )}
                  </div>

                  {/* Progress bar (only for free tier) */}
                  {usage.limit !== null && (
                    <div className="space-y-2">
                      <Progress value={getUsagePercentage()} className="h-2" />
                      <p className="text-xs text-muted-foreground">{getUsagePercentage()}% used</p>
                    </div>
                  )}
                </div>

                {/* Period dates */}
                <p className="text-sm text-muted-foreground">
                  {new Date(usage.periodStart).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  -{" "}
                  {new Date(usage.periodEnd).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>

                {/* Warning when approaching quota */}
                {isApproachingQuota() && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-orange-500">Approaching quota limit</p>
                      <p className="text-xs text-muted-foreground">
                        You've used {getUsagePercentage()}% of your monthly quota. Consider upgrading
                        for unlimited interviews.
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No usage data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upgrade CTA Banner (for free tier users with usage) */}
      {showUpgradeBanner && (
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-light text-lg text-foreground">
                    Unlock Unlimited Interviews
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Upgrade to Pro for unlimited practice sessions and advanced features
                  </p>
                </div>
              </div>
              <Button
                onClick={() => (window.location.href = "/pricing")}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                View Plans
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment History */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingPayments ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : payments.length > 0 ? (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-foreground">
                          {formatCurrency(payment.amount, payment.currency)}
                        </p>
                        <Badge
                          variant={
                            payment.status === "succeeded"
                              ? "success"
                              : payment.status === "pending"
                                ? "default"
                                : "destructive"
                          }
                          className="text-xs"
                        >
                          {payment.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(payment.createdAt).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  {payment.receiptUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(payment.receiptUrl, "_blank")}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 space-y-3">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">No payment history</p>
                <p className="text-xs text-muted-foreground/70">
                  Your payment history will appear here once you make a purchase
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
