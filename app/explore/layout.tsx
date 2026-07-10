import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PM Interview Practice Questions by Company and Round | Meelni",
  description:
    "Browse curated Product Sense, Behavioral, Execution, and Strategy practice questions. Filter by company or round, then carry a selected question into a mock interview.",
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
    title: "Explore PM Interview Practice Questions | Meelni",
    description:
      "Browse curated PM practice questions by company and round type, then practice a selected question out loud.",
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
    title: "Explore PM Interview Practice Questions | Meelni",
    description:
      "Browse curated PM practice questions by company and round type. Free to explore.",
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
