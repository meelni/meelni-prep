import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "2,879+ Real PM Interview Questions from Google, Meta, Amazon | Meelni",
  description:
    "Search and practice 2,879+ real Product Manager interview questions asked at Google, Meta, Amazon, Apple, Netflix, and 100+ top tech companies. Free to browse. Includes Product Sense, Behavioral, Execution, and Strategy questions with AI coaching. Updated daily with new questions from actual PM interviews.",
  keywords: [
    // Primary keywords
    "PM interview questions",
    "product manager interview questions",
    "product management interview questions",

    // Company-specific long-tail keywords
    "google PM interview questions",
    "meta product manager interview",
    "amazon PM interview questions",
    "apple product manager interview",
    "netflix PM interview questions",
    "microsoft product manager interview",
    "stripe PM interview",
    "airbnb product manager questions",
    "uber PM interview prep",
    "spotify product manager interview",

    // Question type long-tail keywords
    "product sense interview questions",
    "behavioral interview questions for PM",
    "execution interview questions product manager",
    "product strategy interview questions",
    "product design interview questions",
    "product analytics interview questions",
    "PM technical interview questions",
    "product prioritization questions",

    // Intent-based keywords
    "PM interview prep",
    "how to prepare for PM interview",
    "product manager interview practice",
    "mock PM interview questions",
    "real PM interview questions",
    "actual interview questions from google",
    "what questions are asked in PM interviews",
    "common PM interview questions",
    "PM interview question bank",
    "free PM interview questions",

    // Problem-solving keywords
    "tell me about a product you love",
    "how would you improve product X",
    "design a product for X",
    "estimate market size",
    "prioritize features",
    "handle difficult stakeholders",
    "product roadmap questions",
    "product metrics questions",
  ],
  openGraph: {
    title: "Explore 2,879+ Real Interview Questions | Meelni",
    description:
      "Browse real interview questions from top companies. Free to explore, sign up to practice with AI coaching.",
    url: "https://meelni.com/explore",
    siteName: "Meelni",
    images: [
      {
        url: "/og-image-explore.png",
        width: 1200,
        height: 630,
        alt: "Meelni - Explore Interview Questions",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore 2,879+ Real Interview Questions | Meelni",
    description:
      "Browse real interview questions from Google, Meta, Amazon, and 100+ top companies. Free to explore.",
    images: ["/og-image-explore.png"],
  },
  alternates: {
    canonical: "https://meelni.com/explore",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
