import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

// Initialize Stripe
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is required");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-10-29.clover",
});

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
    // Check authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
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
        { error: "No Stripe customer found. Please upgrade to a paid plan first." },
        { status: 400 }
      );
    }

    // Parse return URL from request body (optional)
    let returnUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/dashboard/subscription`;

    try {
      const body = await req.json();
      if (body.returnUrl) {
        returnUrl = body.returnUrl;
      }
    } catch (error) {
      // No body provided or invalid JSON - use default return URL
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
