import Link from "next/link";
import { ArrowLeft, CreditCard, Mail, ShieldCheck } from "lucide-react";

import { ContactForm } from "@/components/contact/contact-form";
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
          description="Send a support request for account, billing, interview, feedback, or privacy questions."
        />

        <div className="grid gap-6 md:grid-cols-2">
          <MarketingCard className="md:col-span-2">
            <ShieldCheck className="text-primary mb-4 h-6 w-6" />
            <AppSurfaceTitle>Message Meelni support</AppSurfaceTitle>
            <AppSurfaceDescription className="mt-2">
              We store the request before showing success. A receipt confirms
              intake for support triage; it does not promise an automated email,
              response time, or refund decision.
            </AppSurfaceDescription>
            <div className="mt-6">
              <ContactForm />
            </div>
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
