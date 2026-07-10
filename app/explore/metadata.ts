import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore PM Interview Practice Questions | Meelni",
  description:
    "Browse curated Product Sense, Execution, Behavioral, and Strategy practice questions by company and round type.",
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
    title: "Explore PM Interview Practice Questions | Meelni",
    description:
      "Browse curated PM practice questions by company and round type, then practice a selected question out loud.",
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
    title: "Explore PM Interview Practice Questions | Meelni",
    description:
      "Browse curated PM practice questions by company and round type. Free to explore.",
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
