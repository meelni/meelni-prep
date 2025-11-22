import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore 2,879+ Real Interview Questions | Meelni",
  description:
    "Browse real interview questions from Google, Meta, Amazon, and 100+ top companies. Practice product sense, execution, behavioral, and strategy questions with AI coaching.",
  keywords: [
    "interview questions",
    "product manager interview",
    "google interview questions",
    "meta interview questions",
    "amazon interview questions",
    "product sense questions",
    "behavioral interview questions",
    "execution interview questions",
    "strategy interview questions",
    "PM interview prep",
    "interview practice",
  ],
  openGraph: {
    title: "Explore 2,879+ Real Interview Questions | Meelni",
    description:
      "Browse real interview questions from top companies. Free to explore, sign up to practice with AI coaching.",
    url: "https://meelni.com/explore",
    siteName: "Meelni",
    images: [
      {
        url: "/og-image-explore.png", // You'll need to create this
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
    images: ["/og-image-explore.png"], // You'll need to create this
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
