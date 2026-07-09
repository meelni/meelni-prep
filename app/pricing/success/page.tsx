"use client";

import { CheckCircle } from "lucide-react";
import Link from "next/link";
import {
  MarketingCtaCard,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

// Loading fallback component
function LoadingFallback() {
  return (
    <MarketingPage className="flex items-center justify-center px-4">
      <MarketingCtaCard
        className="w-full max-w-md"
        mark={
          <div className="border-primary/20 border-b-primary h-7 w-7 animate-spin rounded-full border-2" />
        }
        title="Loading..."
        description="Please wait while we load your page."
        action={null}
      />
    </MarketingPage>
  );
}

// Component that uses useSearchParams (must be wrapped in Suspense)
function CheckoutSuccessContent() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    // If not authenticated, redirect to signup with session ID preserved
    if (!isLoading && !user) {
      const redirectUrl = sessionId
        ? `/auth/signup?redirectTo=/pricing/success&session_id=${sessionId}`
        : "/auth/signup?redirectTo=/pricing/success";
      router.push(redirectUrl);
    }
  }, [user, isLoading, router, sessionId]);

  // Show loading state while checking auth
  if (isLoading || !user) {
    return (
      <MarketingPage className="flex items-center justify-center px-4">
        <MarketingCtaCard
          className="w-full max-w-md"
          mark={
            <div className="border-primary/20 border-b-primary h-7 w-7 animate-spin rounded-full border-2" />
          }
          title="Processing..."
          description="Please wait while we set up your account."
          action={null}
        />
      </MarketingPage>
    );
  }

  return (
    <MarketingPage className="flex items-center justify-center px-4">
      <MarketingCtaCard
        className="w-full max-w-md"
        tone="success"
        mark={<CheckCircle className="h-8 w-8" />}
        title="Credits added to your account"
        description="Your purchase is complete. Your interview credits will be available as soon as Stripe finishes processing the webhook."
        action={
          <div className="flex w-full flex-col gap-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>

            <Button asChild size="lg" variant="outline" className="w-full">
              <Link href="/dashboard/new-interview">Start an Interview</Link>
            </Button>
          </div>
        }
        footer={
          <>Subscription plans can be managed from your billing settings.</>
        }
      />
    </MarketingPage>
  );
}

// Main page component with Suspense boundary
export default function CheckoutSuccess() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
