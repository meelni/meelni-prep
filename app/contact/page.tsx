import Link from "next/link";
import { AlertTriangle, ArrowLeft, CreditCard, Mail } from "lucide-react";

import {
  MarketingCard,
  MarketingEyebrow,
  MarketingHero,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import { Header } from "@/components/sections/header";
import {
  AppSurfaceDescription,
  AppSurfaceTitle,
} from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Current support options for Meelni accounts and billing.",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
};

export default function ContactPage() {
  return (
    <MarketingPage>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <MarketingHero
          eyebrow={<MarketingEyebrow icon={Mail}>Support</MarketingEyebrow>}
          title="Contact Meelni"
          description="We’re rebuilding our support workflow so messages are not accepted without reliable delivery."
        />

        <div className="grid gap-6 md:grid-cols-2">
          <MarketingCard className="border-warning/30 bg-warning/5">
            <AlertTriangle className="text-warning mb-4 h-6 w-6" />
            <AppSurfaceTitle>
              Contact form temporarily unavailable
            </AppSurfaceTitle>
            <AppSurfaceDescription className="mt-2">
              We are not collecting support messages on this page right now.
              Please check back after the support workflow is restored.
            </AppSurfaceDescription>
          </MarketingCard>

          <MarketingCard>
            <CreditCard className="text-primary mb-4 h-6 w-6" />
            <AppSurfaceTitle>Account or billing changes</AppSurfaceTitle>
            <AppSurfaceDescription className="mt-2">
              Signed-in customers can review their plan and account settings
              from the dashboard.
            </AppSurfaceDescription>
            <Button asChild className="mt-6">
              <Link href="/dashboard/settings">Open account settings</Link>
            </Button>
          </MarketingCard>
        </div>

        <Button asChild variant="ghost" className="mt-8">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Return home
          </Link>
        </Button>
      </main>
    </MarketingPage>
  );
}
