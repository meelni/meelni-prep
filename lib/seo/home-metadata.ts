import type { Metadata } from "next";

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

  const description =
    "Practice real Product Sense, Execution, Strategy, and Behavioral questions out loud in a live PM mock interview, then get specific feedback on what to improve next.";

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
      "real-time interview feedback",
      "voice interview practice",
      "PM interview questions",
      "product management interview",
    ],
    alternates: { canonical: "/" },
    openGraph: {
      title: "Meelni — Live PM Interview Practice",
      description:
        "Practice real PM interview questions out loud, handle realistic follow-ups, and get specific feedback on what to improve next.",
      type: "website",
      url: "/",
    },
    twitter: {
      card: "summary_large_image",
      title: "Meelni — Live PM Interview Practice",
      description:
        "Practice real PM interview questions out loud and get specific feedback on what to improve next.",
      creator: "@trymeelni",
      site: "@trymeelni",
    },
  };
}
