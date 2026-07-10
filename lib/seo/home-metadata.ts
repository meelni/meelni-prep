import type { Metadata } from "next";
import { PRODUCT_LANGUAGE } from "@/lib/product-language";

export function getHomeMetadata(reactivated: boolean): Metadata {
  if (!reactivated) {
    const description =
      "Meelni is not currently accepting new PM interview practice sessions or subscriptions.";

    return {
      title: { absolute: "Meelni — Service Update" },
      description,
      alternates: { canonical: "/" },
      openGraph: {
        title: "Meelni — Service Update",
        description,
        type: "website",
        url: "/",
      },
      twitter: {
        card: "summary_large_image",
        title: "Meelni — Service Update",
        description,
      },
    };
  }

  const description = PRODUCT_LANGUAGE.oneLine;

  return {
    title: { absolute: "Meelni — Live PM Interview Practice" },
    description,
    keywords: [
      "PM interview practice",
      "product manager interview prep",
      "product sense interview",
      "behavioral interview practice",
      "execution interview questions",
      "strategy interview prep",
      "PM interview feedback",
      "voice interview practice",
      "PM interview questions",
      "product management interview",
    ],
    alternates: { canonical: "/" },
    openGraph: {
      title: "Meelni — Live PM Interview Practice",
      description,
      type: "website",
      url: "/",
    },
    twitter: {
      card: "summary_large_image",
      title: "Meelni — Live PM Interview Practice",
      description,
      creator: "@trymeelni",
      site: "@trymeelni",
    },
  };
}
