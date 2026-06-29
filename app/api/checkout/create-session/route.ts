import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import {
  STRIPE_API_VERSION,
  getCheckoutModeForCatalogId,
  getStripePriceIdForCatalogId,
} from "@/lib/billing/stripe-catalog";

// Request validation schema
const checkoutSchema = z.object({
  catalogId: z.enum(["interview_pass", "starter", "pro"]),
  email: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();

    // 1. Parse and validate request body
    const body = await req.json();
    const { catalogId } = checkoutSchema.parse(body);

    // 2. Check if user is authenticated (optional)
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const userId = session?.user.id;
    const userEmail = session?.user.email;

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required for checkout" },
        { status: 401 }
      );
    }

    // 3. CRITICAL: Check for existing active subscription (prevent double-charge)
    const existingSubscription = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);

    const existingStripeCustomerId = existingSubscription[0]?.stripeCustomerId;

    if (existingSubscription.length > 0) {
      const sub = existingSubscription[0];

      // Block duplicate subscription checkout, but allow one-time pass purchases.
      if (
        catalogId !== "interview_pass" &&
        (sub.tier === "starter" || sub.tier === "pro") &&
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

      if (existingStripeCustomerId) {
        try {
          const existingSessions = await stripe.checkout.sessions.list({
            customer: existingStripeCustomerId,
            status: "open",
            limit: 1,
          });

          const existingSession = existingSessions.data.find(
            (openSession) => openSession.metadata?.catalogId === catalogId
          );

          if (existingSession) {
            return NextResponse.json({
              url: existingSession.url,
              sessionId: existingSession.id,
              reused: true,
            });
          }
        } catch (stripeError) {
          console.warn("Could not check existing sessions:", stripeError);
        }
      }
    }

    const priceId = getStripePriceIdForCatalogId(catalogId);
    const mode = getCheckoutModeForCatalogId(catalogId);
    const metadata = {
      userId,
      catalogId,
    };

    // 5. Create Stripe Checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      ...(existingStripeCustomerId
        ? { customer: existingStripeCustomerId }
        : userEmail
          ? { customer_email: userEmail }
          : {}),
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode,
      ...(mode === "subscription"
        ? {
            subscription_data: {
              metadata,
            },
          }
        : {}),
      metadata,
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
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}
