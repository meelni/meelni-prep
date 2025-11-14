import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { z } from "zod";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

// Request validation schema
const checkoutSchema = z.object({
  tier: z.enum(["pro", "premium"]),
  billingPeriod: z.enum(["monthly", "annual"]),
  email: z.string().email().optional(), // Optional email for unauthenticated users
});

export async function POST(req: NextRequest) {
  try {
    // 1. Parse and validate request body
    const body = await req.json();
    const { tier, billingPeriod } = checkoutSchema.parse(body);

    // 2. Check if user is authenticated (optional)
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const userId = session?.user.id;
    const userEmail = session?.user.email;

    // 3. Map tier + billing period to Stripe price ID
    const priceMap: Record<string, string> = {
      "pro-monthly": process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
      "pro-annual": process.env.STRIPE_PRO_ANNUAL_PRICE_ID!,
      "premium-monthly": process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID!,
      "premium-annual": process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID!,
    };

    const priceId = priceMap[`${tier}-${billingPeriod}`];
    if (!priceId) {
      return NextResponse.json(
        { error: "Invalid tier or billing period" },
        { status: 400 }
      );
    }

    // 4. Determine trial period (7 days for Pro, 14 days for Premium)
    const trialPeriodDays = tier === "pro" ? 7 : 14;

    // 5. Create Stripe Checkout session
    // Only include customer_email if authenticated, otherwise Stripe will collect it
    const checkoutSession = await stripe.checkout.sessions.create({
      ...(userEmail ? { customer_email: userEmail } : {}),
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      subscription_data: {
        trial_period_days: trialPeriodDays,
        metadata: {
          ...(userId ? { userId } : {}),
          tier,
          billingPeriod,
        },
      },
      metadata: {
        ...(userId ? { userId } : {}),
        tier,
        billingPeriod,
      },
      success_url: `${req.nextUrl.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.nextUrl.origin}/pricing/canceled`,
      allow_promotion_codes: true,
    });

    // 6. Return checkout URL
    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    console.error("[Checkout] Error creating session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
