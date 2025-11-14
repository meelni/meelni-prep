"use client";

import { CheckCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/app/providers/auth-provider";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function CheckoutSuccess() {
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
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </div>
          <h1 className="text-2xl font-display font-semibold text-foreground mb-2">
            Processing...
          </h1>
          <p className="text-muted-foreground">
            Please wait while we set up your account.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
        </div>

        <h1 className="text-2xl font-display font-semibold text-foreground mb-2">
          Welcome to Meelni Pro!
        </h1>

        <p className="text-muted-foreground mb-6">
          Your subscription has been activated. Your trial starts now!
        </p>

        <div className="space-y-3">
          <Link href="/dashboard" className="block">
            <Button size="lg" className="w-full">
              Go to Dashboard
            </Button>
          </Link>

          <Link href="/setup" className="block">
            <Button size="lg" variant="outline" className="w-full">
              Start Your First Interview
            </Button>
          </Link>
        </div>

        <p className="text-sm text-muted-foreground mt-6">
          You won't be charged until your trial ends. Cancel anytime from your
          dashboard.
        </p>
      </Card>
    </div>
  );
}
