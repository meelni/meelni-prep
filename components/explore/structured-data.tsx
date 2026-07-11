import { PUBLIC_ORIGIN } from "@/lib/seo/public-metadata";
import { JsonLd } from "@/components/seo/json-ld";

/**
 * Structured Data (JSON-LD) for Explore Questions Page
 *
 * Provides rich semantic data for:
 * - Search engines (Google, Bing)
 * - LLM crawlers (ChatGPT, Perplexity, Claude)
 * - Social platforms
 *
 * The schema is intentionally limited to facts represented by the active
 * public-question response and the visible Explore page.
 */

interface Question {
  id: string;
  company: string | null;
  questionText: string;
  questionType: string;
  askedAt: Date | null;
  isActive: boolean;
  createdAt: Date | null;
}

interface ExploreStructuredDataProps {
  questions: Question[];
  currentPage: number;
  totalPages: number;
  totalQuestions: number;
}

export function ExploreStructuredData({
  questions,
  currentPage,
  totalPages,
  totalQuestions,
}: ExploreStructuredDataProps) {
  const baseUrl = PUBLIC_ORIGIN;
  const pageCount = Math.max(1, totalPages);

  // 1. ItemList Schema - for the collection of questions
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Product Manager Interview Questions",
    description: `Browse ${totalQuestions.toLocaleString()} currently available PM practice questions by company and round type.`,
    numberOfItems: totalQuestions,
    itemListElement: questions.slice(0, 20).map((question, index) => ({
      "@type": "ListItem",
      position: (currentPage - 1) * 20 + index + 1,
      item: {
        "@type": "Question",
        name: question.questionText,
        text: question.questionText,
      },
    })),
  };

  // 2. BreadcrumbList Schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: baseUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Explore Questions",
        item: `${baseUrl}/explore`,
      },
    ],
  };

  // 3. WebPage Schema with API-derived count
  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Explore PM Interview Practice Questions",
    description: `Browse and search ${totalQuestions.toLocaleString()} currently available Product Manager practice questions by company and round type.`,
    url: `${baseUrl}/explore`,
    inLanguage: "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: "Meelni",
      url: baseUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "Meelni",
      url: baseUrl,
    },
  };

  // 4. CollectionPage Schema
  const collectionPageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `PM Interview Questions - Page ${currentPage} of ${pageCount}`,
    description:
      "Browse PM practice questions organized by company tag and round type.",
    url: `${baseUrl}/explore`,
    about: {
      "@type": "Thing",
      name: "Product Manager Interviews",
      description: "Practice prompts for Product Manager interviews",
    },
  };

  // 5. Dataset Schema for the visible public collection
  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Meelni PM Interview Question Database",
    description: `Question bank containing ${totalQuestions.toLocaleString()} currently available Product Manager practice questions.`,
    url: `${baseUrl}/explore`,
    creator: {
      "@type": "Organization",
      name: "Meelni",
      url: baseUrl,
    },
  };

  return (
    <>
      <JsonLd id="explore-item-list-schema" data={itemListSchema} />
      <JsonLd id="explore-breadcrumb-schema" data={breadcrumbSchema} />
      <JsonLd id="explore-web-page-schema" data={webPageSchema} />
      <JsonLd id="explore-collection-page-schema" data={collectionPageSchema} />
      <JsonLd id="explore-dataset-schema" data={datasetSchema} />
    </>
  );
}
