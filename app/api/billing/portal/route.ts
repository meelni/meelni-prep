import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe-catalog";
import { isStripeLiveServerKey } from "@/lib/billing/stripe-key-mode";
import { reportOperationalFailure } from "@/lib/operations/operational-events";

/**
 * POST /api/billing/portal
 *
 * Create a Stripe Customer Portal session
 *
 * Returns:
 * - portalUrl: string (URL to redirect user to Customer Portal)
 *
 * The Customer Portal allows users to:
 * - View subscription details
 * - Update payment methods
 * - Cancel or upgrade subscription
 * - View invoices and payment history
 */
export async function POST(req: Request) {
  try {
    const stripe = getStripe();

    // Check authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user's subscription to get Stripe customer ID
    let userSubs;
    try {
      userSubs = await db
        .select()
        .from(subscription)
        .where(eq(subscription.userId, user.id))
        .limit(1);
    } catch {
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

    if (userSubs.length === 0) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    const sub = userSubs[0];

    // Check if user has a Stripe customer ID
    if (!sub.stripeCustomerId) {
      return NextResponse.json(
        {
          error:
            "No Stripe customer found. Please upgrade to a paid plan first.",
        },
        { status: 400 }
      );
    }

    // Parse return URL from request body (optional)
    let returnUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/dashboard/subscription`;

    try {
      const body = await req.json();
      if (body.returnUrl) {
        returnUrl = body.returnUrl;
      }
    } catch {
      // No body provided or invalid JSON - use default return URL
    }

    // Verify customer exists in current Stripe mode (test vs live)
    try {
      await stripe.customers.retrieve(sub.stripeCustomerId);
    } catch {
      reportOperationalFailure({
        operation: "billing_portal",
        errorCode: "billing_portal_customer_lookup_failed",
        retryable: true,
      });

      // Check if this is a mode mismatch (test customer with live keys or vice versa)
      const isTestCustomer =
        sub.stripeCustomerId.startsWith("cus_") &&
        !sub.stripeCustomerId.includes("live");
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

    // Create Stripe Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: returnUrl,
    });

    return NextResponse.json({
      portalUrl: portalSession.url,
    });
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
