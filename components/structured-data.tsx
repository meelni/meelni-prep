import Script from "next/script";
import { getStructuredDataOffers } from "@/lib/billing/catalog-presentation";

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
          text: "Meelni is an AI-powered interview coach that helps you practice product management interviews through natural voice conversations. After a completed interview, it provides PM-calibrated feedback on Product Sense, Behavioral, Execution, and Strategy answers.",
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
        name: "How does Meelni pricing work?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Meelni uses interview credits. The trial includes 2 credits for 7 days, Interview Pass includes 1 credit for $9, Starter includes 4 monthly credits for $19/month, and Pro includes 12 monthly credits for $49/month. One credit unlocks one full PM mock interview across any supported round type.",
        },
      },
      {
        "@type": "Question",
        name: "How is Meelni different from other interview prep tools?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Unlike traditional interview prep platforms, Meelni offers natural voice conversations, live follow-up questions, evidence-linked feedback after completed interviews, and a large question bank of curated PM questions.",
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
          text: "After a completed interview, Meelni provides scores on structure, clarity, insight, and communication, evidence-linked strengths and areas for improvement, and suggested focused practice. Completed sessions and their transcripts are available from your dashboard.",
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
      "AI-powered mock interview coach for product managers. Practice PM interviews with natural voice conversations and review feedback after completed interviews.",
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
    offers: getStructuredDataOffers(),
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "127",
    },
    description:
      "Practice Product Sense, Behavioral, Execution, and Strategy interviews with AI-powered voice coaching and completed-interview feedback.",
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
