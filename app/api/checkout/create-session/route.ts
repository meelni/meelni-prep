import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";

// Request validation schema
const checkoutSchema = z.object({
  tier: z.enum(["pro"]),
  billingPeriod: z.enum(["monthly", "annual"]),
  email: z.string().email().optional(), // Optional email for unauthenticated users
});

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();

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

    // 3. CRITICAL: Check for existing active subscription (prevent double-charge)
    if (userId) {
      const existingSubscription = await db
        .select()
        .from(subscription)
        .where(eq(subscription.userId, userId))
        .limit(1);

      if (existingSubscription.length > 0) {
        const sub = existingSubscription[0];

        // Block if user already has an active paid subscription
        if (
          sub.tier !== "free" &&
          (sub.status === "active" || sub.status === "trialing") &&
          !sub.cancelAtPeriodEnd
        ) {
          return NextResponse.json(
            {
              error: "You already have an active subscription",
              existingTier: sub.tier,
              status: sub.status,
            },
            { status: 400 }
          );
        }

        // If they have a Stripe customer ID, reuse it for better tracking
        if (sub.stripeCustomerId) {
          // Check if there's already an open checkout session for this customer
          try {
            const existingSessions = await stripe.checkout.sessions.list({
              customer: sub.stripeCustomerId,
              status: "open",
              limit: 1,
            });

            // If there's an open session for the same tier, return it instead of creating new
            if (existingSessions.data.length > 0) {
              const existingSession = existingSessions.data[0];
              if (existingSession.metadata?.tier === tier) {
                return NextResponse.json({
                  url: existingSession.url,
                  sessionId: existingSession.id,
                  reused: true,
                });
              }
            }
          } catch (stripeError) {
            console.warn("Could not check existing sessions:", stripeError);
            // Continue with new session creation
          }
        }
      }
    }

    // 4. Map tier + billing period to Stripe price ID
    const priceMap: Record<string, string> = {
      "pro-monthly": process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
      "pro-annual": process.env.STRIPE_PRO_ANNUAL_PRICE_ID!,
    };

    const priceId = priceMap[`${tier}-${billingPeriod}`];
    if (!priceId) {
      return NextResponse.json(
        { error: "Invalid tier or billing period" },
        { status: 400 }
      );
    }

    // 4. Determine trial period (7 days for Pro)
    const trialPeriodDays = 7;

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

function getStripe() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is required");
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: "2025-10-29.clover",
  });
}
