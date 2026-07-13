import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createStripeRuntimeClient } from "@/lib/billing/stripe-client";
import { isStripeLiveServerKey } from "@/lib/billing/stripe-key-mode";

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
    const userSubs = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, user.id))
      .limit(1);

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
    } catch (stripeError) {
      // Customer doesn't exist in current mode (likely test customer ID with live keys)
      console.error(
        `Stripe customer ${sub.stripeCustomerId} not found:`,
        getErrorMessage(stripeError)
      );

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
  } catch (error) {
    console.error("Error creating portal session:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getStripe() {
  return createStripeRuntimeClient();
}
