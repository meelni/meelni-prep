import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe-catalog";
import { isStripeLiveServerKey } from "@/lib/billing/stripe-key-mode";
import { reportOperationalFailure } from "@/lib/operations/operational-events";

/**
 * POST /api/customer-portal
 *
 * Create a Stripe Customer Portal session for managing subscription
 */
export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();

    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Stripe customer ID from database
    const { data: subscriptionData, error: subError } = await supabase
      .from("subscription")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) {
      reportOperationalFailure({
        operation: "billing_portal",
        errorCode: "billing_portal_subscription_read_failed",
        retryable: true,
      });
      return NextResponse.json(
        { error: "Failed to create portal session" },
        { status: 500 }
      );
    }

    if (!subscriptionData?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 }
      );
    }

    const stripeCustomerId = subscriptionData.stripe_customer_id;

    // Verify customer exists in current Stripe mode (test vs live)
    try {
      await stripe.customers.retrieve(stripeCustomerId);
    } catch {
      reportOperationalFailure({
        operation: "billing_portal",
        errorCode: "billing_portal_customer_lookup_failed",
        retryable: true,
      });

      // Check if this is a mode mismatch (test customer with live keys or vice versa)
      const isTestCustomer =
        stripeCustomerId.startsWith("cus_") &&
        !stripeCustomerId.includes("live");
      const isLiveMode = isStripeLiveServerKey(process.env.STRIPE_SECRET_KEY);

      if (isTestCustomer && isLiveMode) {
        return NextResponse.json(
          {
            error:
              "Your subscription was created in test mode. Please create a new subscription to access the customer portal.",
            code: "MODE_MISMATCH",
          },
          { status: 400 }
        );
      }

      // Generic customer not found error
      return NextResponse.json(
        {
          error:
            "Stripe customer not found. Your subscription may need to be recreated.",
          code: "CUSTOMER_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    // Create Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${request.nextUrl.origin}/dashboard?section=billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch {
    reportOperationalFailure({
      operation: "billing_portal",
      errorCode: "billing_portal_session_failed",
      retryable: true,
    });
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}

function getStripe() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is required");
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}
