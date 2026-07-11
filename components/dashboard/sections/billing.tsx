"use client";

import { useState, useEffect } from "react";
import {
  DashboardActionCard,
  DashboardLoadingState,
  DashboardSectionCard,
  DashboardSkeletonCard,
  DashboardStateCard,
} from "@/components/dashboard/dashboard-surface";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  ExternalLink,
  Sparkles,
  AlertCircle,
  FileText,
  Loader2,
  XCircle,
  RotateCcw,
  Clock,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  getPublicPricingPlans,
  type PublicPricingPlan,
} from "@/lib/billing/catalog-presentation";

// Type definitions
interface Subscription {
  tier: "free" | "starter" | "pro";
  status: "active" | "trialing" | "canceled" | "past_due";
  billingCycle?: "monthly" | "annual";
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  priceInCents?: number;
  currency?: string;
}

interface CreditGrantSummary {
  id: string;
  catalogId: string;
  source: string;
  originalCredits: number;
  remainingCredits: number;
  reservedCredits: number;
  expiresAt: string | null;
  rolloverEligible: boolean;
}

interface CreditBalance {
  availableCredits: number;
  reservedCredits: number;
  expiringCredits: number;
  nextCreditExpiresAt: string | null;
  grants: CreditGrantSummary[];
}

interface Payment {
  id: string;
  amountInCents: number;
  currency: string;
  status:
    | "succeeded"
    | "failed"
    | "partially_refunded"
    | "refunded"
    | "disputed"
    | "canceled";
  createdAt: string;
  receiptUrl?: string;
}

export function BillingSection() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(
    null
  );
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managingSubscription, setManagingSubscription] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [reactivatingSubscription, setReactivatingSubscription] =
    useState(false);

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

  // Fetch credit balance
  useEffect(() => {
    async function fetchCredits() {
      try {
        const response = await fetch("/api/billing/credits");
        if (!response.ok) {
          throw new Error("Failed to fetch credits");
        }
        const data = await response.json();
        setCreditBalance(data);
      } catch (err) {
        console.error("Error fetching credits:", err);
        setError("Failed to load credit data");
      } finally {
        setLoadingCredits(false);
      }
    }

    fetchCredits();
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

  // Handle cancel subscription
  async function handleCancelSubscription(cancelImmediately: boolean = false) {
    setCancellingSubscription(true);
    try {
      const response = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelImmediately }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to cancel subscription");
      }

      const data = await response.json();
      alert(data.message);

      // Refresh subscription data
      const subResponse = await fetch("/api/billing/subscription");
      if (subResponse.ok) {
        const subData = await subResponse.json();
        setSubscription(subData);
      }

      setShowCancelModal(false);
    } catch (err) {
      console.error("Error cancelling subscription:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Failed to cancel subscription. Please try again."
      );
    } finally {
      setCancellingSubscription(false);
    }
  }

  // Handle reactivate subscription
  async function handleReactivateSubscription() {
    setReactivatingSubscription(true);
    try {
      const response = await fetch("/api/billing/cancel", {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reactivate subscription");
      }

      const data = await response.json();
      alert(data.message);

      // Refresh subscription data
      const subResponse = await fetch("/api/billing/subscription");
      if (subResponse.ok) {
        const subData = await subResponse.json();
        setSubscription(subData);
      }
    } catch (err) {
      console.error("Error reactivating subscription:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Failed to reactivate subscription. Please try again."
      );
    } finally {
      setReactivatingSubscription(false);
    }
  }

  // Helper: Get tier badge color
  function getTierBadgeVariant(tier: Subscription["tier"]) {
    switch (tier) {
      case "free":
        return "outline" as const;
      case "pro":
        return "default" as const;
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

  function getPlanForTier(
    tier: Subscription["tier"]
  ): PublicPricingPlan | null {
    if (tier === "free") {
      return null;
    }

    return (
      getPublicPricingPlans().find((plan) => plan.catalogId === tier) ?? null
    );
  }

  // Loading state
  const isLoading = loadingSubscription || loadingCredits || loadingPayments;

  if (isLoading) {
    return (
      <DashboardSkeletonCard className="min-h-dashboard-loading">
        <DashboardLoadingState
          className="min-h-0"
          label="Loading billing information..."
        />
      </DashboardSkeletonCard>
    );
  }

  // Error state
  if (error) {
    return (
      <DashboardStateCard
        tone="danger"
        icon={<AlertCircle className="h-8 w-8" />}
        title="Failed to load billing data"
        description={error}
        className="py-8"
      />
    );
  }

  const currentPlan = subscription ? getPlanForTier(subscription.tier) : null;
  const showUpgradeBanner =
    subscription?.tier === "free" &&
    (creditBalance?.availableCredits ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Subscription Card */}
        <DashboardSectionCard
          title="Current Subscription"
          contentClassName="space-y-6"
        >
          {subscription ? (
            <>
              {/* Tier and Status */}
              <div className="flex items-center gap-3">
                <Badge
                  variant={getTierBadgeVariant(subscription.tier)}
                  className="text-sm"
                >
                  {subscription.tier.toUpperCase()}
                </Badge>
                <Badge
                  variant={getStatusBadgeVariant(subscription.status)}
                  className="text-xs"
                >
                  {subscription.status === "trialing"
                    ? "FREE TRIAL"
                    : subscription.status.replace("_", " ").toUpperCase()}
                </Badge>
              </div>

              {/* Billing Info */}
              {currentPlan && (
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-foreground font-mono text-3xl font-bold">
                      {currentPlan.priceLabel}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      /{currentPlan.frequencyLabel}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {currentPlan.creditLabel}
                    {currentPlan.rolloverLabel
                      ? ` with ${currentPlan.rolloverLabel.toLowerCase()}`
                      : ""}
                  </p>
                  {subscription.currentPeriodEnd && (
                    <p className="text-muted-foreground text-sm">
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
                <div className="border-primary/20 bg-primary/10 rounded-lg border p-3">
                  <p className="text-foreground text-sm">
                    <strong>Trial Active</strong> - Trial credits are local to
                    Meelni and expire after 7 days.
                  </p>
                </div>
              )}

              {/* Free tier message */}
              {subscription.tier === "free" && (
                <p className="text-muted-foreground text-sm">
                  No active paid plan. You can use any available trial or pass
                  credits, or choose a plan from pricing.
                </p>
              )}

              {/* Cancellation Notice */}
              {subscription.cancelAtPeriodEnd && (
                <div className="border-warning/20 bg-warning/10 rounded-lg border p-3">
                  <p className="text-warning text-sm">
                    <strong>Subscription ending:</strong> Your subscription will
                    be canceled on{" "}
                    {subscription.currentPeriodEnd &&
                      formatDate(subscription.currentPeriodEnd)}
                    . You'll retain access until then.
                  </p>
                  <Button
                    onClick={handleReactivateSubscription}
                    disabled={reactivatingSubscription}
                    variant="outline"
                    size="sm"
                    className="mt-2"
                  >
                    {reactivatingSubscription ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Reactivating...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Keep My Subscription
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-3 pt-2">
                {subscription.tier === "free" ? (
                  <Button
                    onClick={() => (window.location.href = "/pricing")}
                    className="w-full"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Upgrade Plan
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleManageSubscription}
                      disabled={managingSubscription}
                      variant="outline"
                      className="w-full"
                    >
                      {managingSubscription ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <CreditCard className="mr-2 h-4 w-4" />
                          Update Payment Method
                        </>
                      )}
                    </Button>

                    {/* Cancel Subscription Button - California ARL Compliance */}
                    {!subscription.cancelAtPeriodEnd &&
                      subscription.status !== "canceled" && (
                        <Button
                          onClick={() => setShowCancelModal(true)}
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive w-full"
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Cancel Subscription
                        </Button>
                      )}
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              No subscription data available
            </p>
          )}
        </DashboardSectionCard>

        {/* Credit Balance Card */}
        <DashboardSectionCard
          title="Interview Credits"
          contentClassName="space-y-6"
        >
          {creditBalance ? (
            <>
              <div className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-foreground font-mono text-3xl font-bold">
                    {creditBalance.availableCredits}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    available
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border-border bg-card/50 rounded-lg border p-3">
                    <div className="text-muted-foreground text-xs">
                      Reserved
                    </div>
                    <div className="font-mono text-lg font-semibold">
                      {creditBalance.reservedCredits}
                    </div>
                  </div>
                  <div className="border-border bg-card/50 rounded-lg border p-3">
                    <div className="text-muted-foreground text-xs">
                      Expiring next
                    </div>
                    <div className="font-mono text-lg font-semibold">
                      {creditBalance.expiringCredits}
                    </div>
                  </div>
                </div>

                {creditBalance.nextCreditExpiresAt && (
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4" />
                    Next credit expiration:{" "}
                    {formatDate(creditBalance.nextCreditExpiresAt)}
                  </p>
                )}
              </div>

              {creditBalance.grants.length > 0 ? (
                <div className="space-y-2">
                  {creditBalance.grants.map((grant) => (
                    <div
                      key={grant.id}
                      className="border-border bg-card/40 rounded-lg border p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium capitalize">
                            {grant.catalogId.replace("_", " ")}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {grant.source.replace("_", " ")}
                            {grant.expiresAt
                              ? ` · expires ${formatDate(grant.expiresAt)}`
                              : " · subscription period"}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {grant.remainingCredits} left
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-warning/20 bg-warning/10 flex items-start gap-3 rounded-lg border p-3">
                  <AlertCircle className="text-warning mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-warning text-sm font-medium">
                      No usable credits
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Buy an Interview Pass or choose a monthly plan to start a
                      full mock interview.
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              No credit data available
            </p>
          )}
        </DashboardSectionCard>
      </div>

      {/* Purchase CTA Banner (for users without active credits) */}
      {showUpgradeBanner && (
        <DashboardActionCard
          variant="accent"
          icon={<Sparkles className="h-5 w-5" />}
          title="Add interview credits"
          description="Buy one Interview Pass or choose Starter or Pro for monthly credits."
          action={
            <Button onClick={() => (window.location.href = "/pricing")}>
              View Plans
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          }
        />
      )}

      {/* Payment History */}
      <DashboardSectionCard title="Payment History">
        {loadingPayments ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-primary h-6 w-6 animate-spin" />
          </div>
        ) : payments.length > 0 ? (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="hover:bg-muted/50 flex items-center justify-between rounded-lg p-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
                    <FileText className="text-primary h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-foreground text-sm font-medium">
                        {formatCurrency(
                          payment.amountInCents,
                          payment.currency
                        )}
                      </p>
                      <Badge
                        variant={
                          payment.status === "succeeded"
                            ? "success"
                            : payment.status === "partially_refunded" ||
                                payment.status === "refunded"
                              ? "secondary"
                              : "destructive"
                        }
                        className="text-xs"
                      >
                        {payment.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
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
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3 py-8 text-center">
            <FileText className="text-muted-foreground/50 mx-auto h-12 w-12" />
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                No payment history
              </p>
              <p className="text-muted-foreground/70 text-xs">
                Your payment history will appear here once you make a purchase
              </p>
            </div>
          </div>
        )}
      </DashboardSectionCard>

      {/* Cancel Subscription Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="bg-overlay/50 absolute inset-0 backdrop-blur-sm"
            onClick={() => setShowCancelModal(false)}
          />

          {/* Modal */}
          <div className="border-border bg-card relative mx-4 w-full max-w-md space-y-6 rounded-xl border p-6 shadow-xl">
            <div className="space-y-2">
              <h3 className="text-dashboard-foreground text-lg leading-6 font-semibold">
                Cancel Subscription
              </h3>
              <p className="text-muted-foreground text-sm">
                We're sorry to see you go. Please choose how you'd like to
                cancel:
              </p>
            </div>

            <div className="space-y-3">
              {/* Cancel at period end option */}
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCancelSubscription(false)}
                disabled={cancellingSubscription}
                className="hover:border-primary/50 h-auto w-full justify-start p-4 text-left whitespace-normal"
              >
                <span>
                  <span className="text-foreground block font-medium">
                    Cancel at end of billing period
                  </span>
                  <span className="text-muted-foreground mt-1 block text-sm">
                    Keep access until{" "}
                    {subscription?.currentPeriodEnd &&
                      formatDate(subscription.currentPeriodEnd)}
                    . You won't be charged again.
                  </span>
                </span>
              </Button>

              {/* Cancel immediately option */}
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCancelSubscription(true)}
                disabled={cancellingSubscription}
                className="border-destructive/30 hover:border-destructive/50 h-auto w-full justify-start p-4 text-left whitespace-normal"
              >
                <span>
                  <span className="text-destructive block font-medium">
                    Cancel immediately
                  </span>
                  <span className="text-muted-foreground mt-1 block text-sm">
                    End subscription now. Any billing adjustment will appear
                    separately after it is processed.
                  </span>
                </span>
              </Button>
            </div>

            {cancellingSubscription && (
              <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing cancellation...
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowCancelModal(false)}
                disabled={cancellingSubscription}
                className="flex-1"
              >
                Keep Subscription
              </Button>
            </div>

            <p className="text-muted-foreground text-center text-xs">
              Need help?{" "}
              <a href="/contact" className="text-primary hover:underline">
                Contact support
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
