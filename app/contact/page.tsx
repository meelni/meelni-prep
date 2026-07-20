import type { Metadata } from "next";

import ContactPageClient from "@/components/contact/contact-page-client";

export const metadata: Metadata = {
  title: "Contact",
  description: "Current support options for Meelni accounts and billing.",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
};

export default function ContactPage() {
  return <ContactPageClient />;
}
