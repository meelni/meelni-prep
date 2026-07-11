import type { Metadata } from "next";

import { publicMetadata } from "@/lib/seo/public-metadata";

export const metadata: Metadata = publicMetadata("/pricing", {
  title: "Pricing",
  description: "Review Meelni interview practice plans and availability.",
});

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
