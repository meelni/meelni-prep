"use client";

import { AlertCircle, CheckCircle, Clock3, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/app/providers/auth-provider";
import {
  MarketingCtaCard,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import { Button } from "@/components/ui/button";
import { buildCheckoutSuccessSigninHref } from "@/lib/billing/checkout-success-navigation";
import {
  clearCheckoutReturnHandle,
  readCheckoutReturnHandle,
} from "@/lib/billing/checkout-return-cookie";
import {
  checkoutError,
  checkoutPending,
  isCheckoutSuccessPublicState,
  type CheckoutSuccessPublicState,
} from "@/lib/billing/checkout-success-state";
import { useFeatureFlag } from "@/lib/feature-flags";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";

const AUTOMATIC_RETRY_DELAYS_MS = [1_500, 3_000, 6_000, 12_000] as const;

export function LoadingFallback() {
  return (
    <MarketingPage className="flex items-center justify-center px-4">
      <MarketingCtaCard
        className="w-full max-w-md"
        role="status"
        aria-live="polite"
        mark={
          <div
            aria-hidden="true"
            className="border-primary/20 border-b-primary h-7 w-7 animate-spin rounded-full border-2 motion-reduce:animate-none"
          />
        }
        title="Checking your purchase"
        description="We’re confirming your account before showing purchase status."
        action={null}
      />
    </MarketingPage>
  );
}

function CheckoutSuccessContent() {
  const { user, isLoading } = useAuth();
  const practiceAvailable = useFeatureFlag(
    FEATURE_GATES.meelniReactivationAccess
  );
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [returnHandle, setReturnHandle] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [checking, setChecking] = useState(false);
  const [confirmation, setConfirmation] =
    useState<CheckoutSuccessPublicState>(checkoutPending());

  useEffect(() => {
    const storedHandle = readCheckoutReturnHandle(window.sessionStorage);
    setReturnHandle(storedHandle);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && !isLoading && !user) {
      router.replace(buildCheckoutSuccessSigninHref());
    }
  }, [hydrated, isLoading, router, user]);

  useEffect(() => {
    if (!hydrated || !user) return;

    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const checkStatus = async (attempt: number) => {
      setChecking(true);
      try {
        const response = await fetch("/api/checkout/status", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(returnHandle ? { returnHandle } : {}),
          signal: controller.signal,
        });
        if (response.status === 401) {
          router.replace(buildCheckoutSuccessSigninHref());
          return;
        }
        const payload: unknown = await response.json();
        if (!isCheckoutSuccessPublicState(payload)) {
          throw new Error("checkout_status_response_invalid");
        }
        if (controller.signal.aborted) return;
        setConfirmation(payload);
        if (
          payload.status === "confirmed" ||
          (payload.status === "error" && !payload.retryable)
        ) {
          if (returnHandle) {
            clearCheckoutReturnHandle(window.sessionStorage, returnHandle);
          }
        }
        if (
          payload.status === "pending" &&
          attempt < AUTOMATIC_RETRY_DELAYS_MS.length
        ) {
          retryTimer = setTimeout(
            () => void checkStatus(attempt + 1),
            AUTOMATIC_RETRY_DELAYS_MS[attempt]
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          setConfirmation(checkoutError("temporarily_unavailable", true));
        }
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    };

    void checkStatus(0);
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [hydrated, returnHandle, retryNonce, router, user]);

  if (!hydrated || isLoading || !user) {
    return <LoadingFallback />;
  }

  return (
    <CheckoutStatusCard
      state={confirmation}
      checking={checking}
      practiceAvailable={practiceAvailable}
      onRetry={() => setRetryNonce((value) => value + 1)}
    />
  );
}

export function CheckoutStatusCard({
  state,
  checking,
  practiceAvailable,
  onRetry,
}: {
  state: CheckoutSuccessPublicState;
  checking: boolean;
  practiceAvailable: boolean;
  onRetry: () => void;
}) {
  if (state.status === "confirmed") {
    return (
      <MarketingPage className="flex items-center justify-center px-4">
        <MarketingCtaCard
          className="w-full max-w-md"
          role="status"
          aria-live="polite"
          tone="success"
          mark={<CheckCircle aria-hidden="true" className="h-8 w-8" />}
          title="Purchase confirmed"
          description={
            state.purchase === "interview_pass"
              ? "Your purchase is confirmed, and one interview credit was added to your account."
              : "Your purchase is confirmed, and your plan credits were added to your account."
          }
          action={
            <div className="flex w-full flex-col gap-3">
              {practiceAvailable ? (
                <>
                  <Button asChild size="lg" className="w-full">
                    <Link href="/dashboard/new-interview">
                      Start an Interview
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="w-full"
                  >
                    <Link href="/dashboard">Go to Dashboard</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild size="lg" className="w-full">
                    <Link href="/dashboard">Go to Dashboard</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="w-full"
                  >
                    <Link href="/dashboard/settings">Billing Settings</Link>
                  </Button>
                </>
              )}
            </div>
          }
          footer="You can review your plan and purchase history in billing settings."
        />
      </MarketingPage>
    );
  }

  if (state.status === "pending") {
    return (
      <MarketingPage className="flex items-center justify-center px-4">
        <MarketingCtaCard
          className="w-full max-w-md"
          role="status"
          aria-live="polite"
          tone="muted"
          mark={
            checking ? (
              <RefreshCw
                aria-hidden="true"
                className="h-7 w-7 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Clock3 aria-hidden="true" className="h-8 w-8" />
            )
          }
          title="Confirming your purchase"
          description="We’re checking that your payment and credits are both recorded. This usually takes a moment."
          action={
            <div className="flex w-full flex-col gap-3">
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={checking}
                aria-busy={checking}
                onClick={onRetry}
              >
                {checking ? "Checking..." : "Check again"}
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full">
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            </div>
          }
          footer="We’ll only confirm this purchase after its credit grant is recorded."
        />
      </MarketingPage>
    );
  }

  const errorCopy = checkoutErrorCopy(state.reason);
  return (
    <MarketingPage className="flex items-center justify-center px-4">
      <MarketingCtaCard
        className="w-full max-w-md"
        role="alert"
        tone="danger"
        mark={<AlertCircle aria-hidden="true" className="h-8 w-8" />}
        title={errorCopy.title}
        description={errorCopy.description}
        action={
          <div className="flex w-full flex-col gap-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/pricing">Return to Pricing</Link>
            </Button>
            {state.retryable && (
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-full"
                disabled={checking}
                aria-busy={checking}
                onClick={onRetry}
              >
                {checking ? "Checking..." : "Check again"}
              </Button>
            )}
          </div>
        }
        footer={errorCopy.footer}
      />
    </MarketingPage>
  );
}

function checkoutErrorCopy(
  reason: Extract<CheckoutSuccessPublicState, { status: "error" }>["reason"]
) {
  if (reason === "payment_reversed") {
    return {
      title: "This purchase was reversed",
      description:
        "This payment was refunded or disputed, so the purchase is no longer confirmed. Any related credit adjustment is reflected in your account.",
      footer:
        "Review billing settings for the current account record, or contact support if the reversal looks unfamiliar.",
    };
  }
  if (reason === "payment_failed") {
    return {
      title: "Payment not completed",
      description:
        "The payment did not complete. If your payment method settles later, you can return here and check again.",
      footer:
        "We’ll confirm the purchase only after both payment and its credit grant are recorded.",
    };
  }
  if (reason === "temporarily_unavailable") {
    return {
      title: "Purchase status is temporarily unavailable",
      description:
        "We couldn’t check the payment and credit record right now. Your purchase status has not been changed.",
      footer: "Try again shortly, or review billing settings later.",
    };
  }
  return {
    title: "We couldn’t confirm this purchase",
    description:
      "We couldn’t match this return to a confirmed payment and credit record. Return to pricing, or check again if you recently completed a purchase.",
    footer:
      "If you were charged, review billing settings or contact support with the time of purchase.",
  };
}

export default function CheckoutSuccessClient() {
  return <CheckoutSuccessContent />;
}
