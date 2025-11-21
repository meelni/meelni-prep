"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, X, Sparkles, Zap, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/app/providers/auth-provider";
import { useRouter } from "next/navigation";
import { Header } from "@/components/sections/header";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

type BillingPeriod = "monthly" | "annual";

interface PricingTier {
  name: string;
  tagline: string;
  monthlyPrice: number;
  annualPrice: number;
  annualSavings: number;
  icon: typeof Sparkles;
  popular?: boolean;
  features: Array<{ text: string; included: boolean }>;
  cta: string;
  trial: string;
}

const pricingTiers: PricingTier[] = [
  {
    name: "Free",
    tagline: "Perfect for exploring",
    monthlyPrice: 0,
    annualPrice: 0,
    annualSavings: 0,
    icon: Sparkles,
    features: [
      { text: "3 AI mock interviews per month", included: true },
      { text: "Product Sense questions only", included: true },
      { text: "View-only question bank", included: true },
      { text: "Basic scoring (overall + 4 dimensions)", included: true },
      { text: "Last 5 sessions visible", included: true },
      { text: "Community support", included: true },
      { text: "All interview types", included: false },
      { text: "Detailed framework feedback", included: false },
      { text: "Performance analytics", included: false },
    ],
    cta: "Start Free",
    trial: "No credit card required",
  },
  {
    name: "Pro",
    tagline: "For serious interview prep",
    monthlyPrice: 29,
    annualPrice: 249,
    annualSavings: 99,
    icon: Zap,
    popular: true,
    features: [
      { text: "UNLIMITED AI mock interviews", included: true },
      { text: "All interview types (PS/Analytical/Leadership/Strategy)", included: true },
      { text: "2,800+ curated PM questions", included: true },
      { text: "Product Sense, Analytical, Leadership & Strategy", included: true },
      { text: "Full session history & analytics", included: true },
      { text: "Detailed framework-based feedback + rubrics", included: true },
      { text: "All difficulty levels (Junior → Senior PM)", included: true },
      { text: "PDF export of feedback reports", included: true },
      { text: "Email support (24h response)", included: true },
    ],
    cta: "Start 7-Day Free Trial",
    trial: "Cancel anytime",
  },
];

const faqs = [
  {
    question: "How does the free trial work?",
    answer:
      "Pro tier offers a 7-day free trial. You'll need to enter a credit card, but you won't be charged until the trial ends. Cancel anytime before the trial expires and you won't pay anything.",
  },
  {
    question: "Can I upgrade or downgrade my plan?",
    answer:
      "Yes! You can upgrade, downgrade, or cancel your subscription at any time from your dashboard. Changes take effect at the start of your next billing cycle, and we'll prorate any differences.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards (Visa, Mastercard, American Express, Discover) through Stripe's secure payment processing. We also support Apple Pay and Google Pay.",
  },
  {
    question: "Do annual plans auto-renew?",
    answer:
      "Yes, both monthly and annual plans auto-renew unless you cancel. We'll send you an email reminder before each renewal. Annual subscribers save 20% compared to monthly billing.",
  },
  {
    question: "How many interviews can I do with the free tier?",
    answer:
      "The free tier includes 3 AI mock interviews per month, focused on Product Sense questions. This resets on the 1st of each month. Upgrade to Pro for unlimited interviews across all 4 interview types.",
  },
  {
    question: "Can I switch between monthly and annual billing?",
    answer:
      "Yes! You can switch from monthly to annual billing at any time to start saving 20%. If you're switching from annual to monthly, the change will take effect at the end of your current annual period.",
  },
];

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  const handleCheckout = async (tierName: string) => {
    // Free tier - redirect to signup
    if (tierName === "Free") {
      router.push("/auth/signup");
      return;
    }

    setLoadingTier(tierName);

    try {
      const response = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tier: tierName.toLowerCase(),
          billingPeriod: billingPeriod === "monthly" ? "monthly" : "annual",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      console.error("[Checkout] Error:", error);
      alert("Failed to start checkout. Please try again.");
      setLoadingTier(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header />

      {/* Hero Section */}
      <section className="border-b border-border bg-gradient-to-b from-background to-muted/20 py-20">
        <div className="container mx-auto px-4 text-center">
          <motion.div {...fadeInUp}>
            <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">
              Simple, transparent pricing
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Choose the plan that fits your interview prep needs. All plans include AI-powered
              feedback and unlimited practice.
            </p>
          </motion.div>

          {/* Billing Toggle */}
          <motion.div
            className="mt-12 flex items-center justify-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span
              className={`text-sm ${
                billingPeriod === "monthly" ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              Monthly
            </span>
            <button
              onClick={() => setBillingPeriod(billingPeriod === "monthly" ? "annual" : "monthly")}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                billingPeriod === "annual" ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-background shadow-lg transition-transform ${
                  billingPeriod === "annual" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span
              className={`text-sm ${
                billingPeriod === "annual" ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              Annual
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                Save 20%
              </span>
            </span>
          </motion.div>
        </div>
      </section>

      {/* Pricing Tiers */}
      <section className="py-20">
        <motion.div
          className="container mx-auto px-4"
          variants={stagger}
          initial="initial"
          animate="animate"
        >
          <div className="grid gap-8 lg:grid-cols-2 max-w-4xl mx-auto">
            {pricingTiers.map((tier, index) => {
              const Icon = tier.icon;
              const displayPrice =
                billingPeriod === "annual" ? tier.annualPrice : tier.monthlyPrice;
              const perMonth = billingPeriod === "annual" && displayPrice > 0;

              return (
                <motion.div key={tier.name} variants={fadeInUp}>
                  <Card
                    className={`relative h-full p-8 ${
                      tier.popular
                        ? "border-2 border-primary shadow-2xl shadow-primary/10"
                        : "border border-border"
                    }`}
                  >
                    {tier.popular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                          Recommended
                        </span>
                      </div>
                    )}

                    {/* Header */}
                    <div className="border-b border-border pb-6">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-display text-2xl font-bold">{tier.name}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{tier.tagline}</p>

                      {/* Price */}
                      <div className="mt-6">
                        <div className="flex items-baseline gap-2">
                          <span className="text-5xl font-bold tracking-tight">
                            ${displayPrice}
                          </span>
                          <span className="text-muted-foreground">
                            {perMonth ? "/year" : displayPrice > 0 ? "/month" : ""}
                          </span>
                        </div>
                        {billingPeriod === "annual" && tier.annualSavings > 0 && (
                          <p className="mt-2 text-sm text-primary">
                            Save ${tier.annualSavings} per year
                          </p>
                        )}
                        {perMonth && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            ${(displayPrice / 12).toFixed(2)}/month billed annually
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="my-8 space-y-3">
                      {tier.features.map((feature) => (
                        <li key={feature.text} className="flex items-start gap-3">
                          {feature.included ? (
                            <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                          ) : (
                            <X className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground/50" />
                          )}
                          <span
                            className={
                              feature.included
                                ? "text-sm text-foreground"
                                : "text-sm text-muted-foreground/70 line-through"
                            }
                          >
                            {feature.text}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <div className="mt-auto space-y-2">
                      <Button
                        onClick={() => handleCheckout(tier.name)}
                        disabled={loadingTier !== null}
                        variant={tier.popular ? "default" : "outline"}
                        className="w-full"
                        size="lg"
                      >
                        {loadingTier === tier.name ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          tier.cta
                        )}
                      </Button>
                      <p className="text-center text-xs text-muted-foreground">{tier.trial}</p>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* Comparison Table */}
      <section className="border-y border-border bg-muted/20 py-20">
        <div className="container mx-auto px-4">
          <motion.div {...fadeInUp} className="mb-12 text-center">
            <h2 className="font-display text-4xl font-bold">Compare plans</h2>
            <p className="mt-4 text-muted-foreground">
              Detailed feature comparison across all tiers
            </p>
          </motion.div>

          <motion.div
            {...fadeInUp}
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-6 py-4 text-left text-sm font-semibold">Feature</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold">Free</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold">Pro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-6 py-4 text-sm">AI mock interviews</td>
                    <td className="px-6 py-4 text-center text-sm text-muted-foreground">
                      3/month
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-semibold text-primary">
                      Unlimited
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm">Interview types</td>
                    <td className="px-6 py-4 text-center text-sm text-muted-foreground">
                      Product Sense only
                    </td>
                    <td className="px-6 py-4 text-center text-sm">All types</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm">Question bank</td>
                    <td className="px-6 py-4 text-center text-sm text-muted-foreground">
                      View-only
                    </td>
                    <td className="px-6 py-4 text-center text-sm">2,800+ questions</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm">Difficulty levels</td>
                    <td className="px-6 py-4 text-center text-sm text-muted-foreground">
                      Intermediate only
                    </td>
                    <td className="px-6 py-4 text-center text-sm">Junior to Senior</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm">AI feedback</td>
                    <td className="px-6 py-4 text-center text-sm text-muted-foreground">
                      Basic scores
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      Detailed framework rubric
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm">Performance analytics</td>
                    <td className="px-6 py-4 text-center text-sm">
                      <X className="mx-auto h-5 w-5 text-muted-foreground/50" />
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      <Check className="mx-auto h-5 w-5 text-primary" />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm">Session history</td>
                    <td className="px-6 py-4 text-center text-sm text-muted-foreground">
                      Last 5 sessions
                    </td>
                    <td className="px-6 py-4 text-center text-sm">Unlimited history</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm">PDF export</td>
                    <td className="px-6 py-4 text-center text-sm">
                      <X className="mx-auto h-5 w-5 text-muted-foreground/50" />
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      <Check className="mx-auto h-5 w-5 text-primary" />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm">Support</td>
                    <td className="px-6 py-4 text-center text-sm text-muted-foreground">
                      Community
                    </td>
                    <td className="px-6 py-4 text-center text-sm">Email (24h)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="container mx-auto max-w-4xl px-4">
          <motion.div {...fadeInUp} className="mb-12 text-center">
            <h2 className="font-display text-4xl font-bold">Frequently asked questions</h2>
            <p className="mt-4 text-muted-foreground">
              Everything you need to know about pricing and billing
            </p>
          </motion.div>

          <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">
            {faqs.map((faq) => (
              <motion.div
                key={faq.question}
                variants={fadeInUp}
                className="rounded-lg border border-border bg-card p-6"
              >
                <h3 className="mb-3 font-semibold">{faq.question}</h3>
                <p className="text-sm text-muted-foreground">{faq.answer}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div {...fadeInUp} className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              Still have questions?{" "}
              <a href="mailto:contact@meelni.com" className="text-primary hover:underline">
                Contact our support team
              </a>
            </p>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border bg-gradient-to-b from-background to-muted/20 py-20">
        <div className="container mx-auto px-4 text-center">
          <motion.div {...fadeInUp}>
            <h2 className="font-display text-4xl font-bold">Ready to ace your PM interviews?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              Start practicing with AI-powered mock interviews today.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button asChild size="lg">
                <Link href="/auth/signup">Start Free Trial</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/dashboard">View Demo</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 Meelni. All rights reserved.</p>
          <div className="mt-4 flex justify-center gap-6">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="mailto:support@meelni.com" className="hover:text-foreground">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
