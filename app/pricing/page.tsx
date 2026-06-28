"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft } from "lucide-react";
import {
  MarketingCtaCard,
  MarketingEyebrow,
  MarketingHero,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/sections/header";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

export default function PricingPage() {
  return (
    <MarketingPage>
      {/* Header */}
      <Header />

      {/* Hero Section */}
      <section className="border-b border-border/60 py-20">
        <div className="container mx-auto px-4">
          <motion.div {...fadeInUp}>
            <MarketingHero
              className="mb-0"
              eyebrow={
                <MarketingEyebrow icon={AlertCircle}>
                  Subscription Update
                </MarketingEyebrow>
              }
              title="Pricing"
              description="Meelni is no longer accepting new subscriptions, but the public demo remains available from the homepage."
            />
          </motion.div>
        </div>
      </section>

      {/* Discontinued Notice */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto max-w-2xl"
          >
            <MarketingCtaCard
              tone="muted"
              mark={<AlertCircle className="h-7 w-7" />}
              title="Service Discontinued"
              description="Meelni is no longer accepting new subscriptions. We appreciate everyone who supported our AI-powered mock interview platform during its operation."
              action={
                <Button asChild variant="outline" size="lg">
                  <Link href="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Home
                  </Link>
                </Button>
              }
              footer="You can still try our demo on the homepage to experience what Meelni was like."
            />
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
          </div>
        </div>
      </footer>
    </MarketingPage>
  );
}
