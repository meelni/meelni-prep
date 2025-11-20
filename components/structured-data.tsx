import Script from "next/script";

/**
 * Structured Data (JSON-LD) for SEO
 * Includes FAQ Schema and Organization Schema
 */
export function StructuredData() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Meelni?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Meelni is an AI-powered interview coach that helps you practice product management interviews through natural voice conversations. It provides real-time feedback on Product Sense, Behavioral, Execution, and Strategy questions.",
        },
      },
      {
        "@type": "Question",
        name: "How does the AI interview coach work?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Meelni conducts realistic voice interviews where you can speak naturally with an AI interviewer. The system uses advanced speech recognition and natural language processing to understand your answers and provide structured feedback based on PM interview frameworks.",
        },
      },
      {
        "@type": "Question",
        name: "What types of PM interviews can I practice?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "You can practice all 4 major PM interview types: Product Sense (product design and strategy), Behavioral (leadership and teamwork), Execution (metrics and tradeoffs), and Strategy (business cases and market analysis). The question bank includes 2,879+ curated questions.",
        },
      },
      {
        "@type": "Question",
        name: "Is Meelni free to use?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes! Meelni offers 3 free AI mock interviews per month with access to Product Sense questions. For unlimited interviews and all 4 interview types, you can upgrade to Pro for $29/month or $249/year with a 7-day free trial.",
        },
      },
      {
        "@type": "Question",
        name: "How is Meelni different from other interview prep tools?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Unlike traditional interview prep platforms, Meelni offers natural voice conversations (not just text), real-time interruptions and follow-ups like a real interviewer, instant feedback on your frameworks and structure, and a massive question bank of 2,879+ curated PM questions with continuous updates.",
        },
      },
      {
        "@type": "Question",
        name: "Can I practice interviews for specific companies?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes! Meelni's question bank includes questions commonly asked at top tech companies like Google, Meta, Amazon, Microsoft, and Apple. The AI coach is trained on proven frameworks used in interviews at these companies.",
        },
      },
      {
        "@type": "Question",
        name: "What kind of feedback do I get after an interview?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "After each interview, you receive comprehensive feedback including scores on structure, clarity, insight, and communication, specific strengths and areas for improvement, framework usage analysis, and suggested practice drills. All sessions are saved with full transcripts in your dashboard.",
        },
      },
      {
        "@type": "Question",
        name: "How long does a mock interview take?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "A typical mock interview session lasts 15-25 minutes, similar to a real PM interview round. You can end the session at any time, and the AI will adapt to your pace and depth of responses.",
        },
      },
    ],
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Meelni",
    description:
      "AI-powered mock interview coach for product managers. Practice PM interviews with natural voice conversations and get real-time feedback.",
    url: "https://meelni.com",
    logo: "https://meelni.com/logo.png",
    sameAs: ["https://twitter.com/trymeelni"],
    contactPoint: {
      "@type": "ContactPoint",
      email: "support@meelni.com",
      contactType: "Customer Support",
    },
  };

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Meelni",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web Browser",
    offers: [
      {
        "@type": "Offer",
        name: "Free Plan",
        price: "0",
        priceCurrency: "USD",
        description: "3 AI mock interviews per month with Product Sense questions",
      },
      {
        "@type": "Offer",
        name: "Pro Plan (Monthly)",
        price: "29",
        priceCurrency: "USD",
        description:
          "Unlimited AI mock interviews with all 4 interview types and 2,879+ questions",
        priceValidUntil: "2025-12-31",
      },
      {
        "@type": "Offer",
        name: "Pro Plan (Yearly)",
        price: "249",
        priceCurrency: "USD",
        description:
          "Unlimited AI mock interviews with all 4 interview types and 2,879+ questions (yearly)",
        priceValidUntil: "2025-12-31",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "127",
    },
    description:
      "Practice product management interviews with AI-powered voice coaching. Master Product Sense, Behavioral, Execution & Strategy interviews with real-time feedback on 2,879+ curated questions.",
  };

  return (
    <>
      <Script
        id="faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <Script
        id="organization-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <Script
        id="software-app-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
    </>
  );
}
