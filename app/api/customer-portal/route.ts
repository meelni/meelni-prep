import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

/**
 * POST /api/customer-portal
 *
 * Create a Stripe Customer Portal session for managing subscription
 */
export async function POST(request: NextRequest) {
  try {
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
      .single();

    if (subError || !subscriptionData?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 }
      );
    }

    const stripeCustomerId = subscriptionData.stripe_customer_id;

    // Verify customer exists in current Stripe mode (test vs live)
    try {
      await stripe.customers.retrieve(stripeCustomerId);
    } catch (stripeError) {
      // Customer doesn't exist in current mode (likely test customer ID with live keys)
      console.error(`Stripe customer ${stripeCustomerId} not found:`, getErrorMessage(stripeError));

      // Check if this is a mode mismatch (test customer with live keys or vice versa)
      const isTestCustomer = stripeCustomerId.startsWith('cus_') && !stripeCustomerId.includes('live');
      const isLiveMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live');

      if (isTestCustomer && isLiveMode) {
        return NextResponse.json(
          {
            error: "Your subscription was created in test mode. Please create a new subscription to access the customer portal.",
            code: "MODE_MISMATCH"
          },
          { status: 400 }
        );
      }

      // Generic customer not found error
      return NextResponse.json(
        {
          error: "Stripe customer not found. Your subscription may need to be recreated.",
          code: "CUSTOMER_NOT_FOUND"
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
  } catch (error) {
    console.error("Error creating customer portal session:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
