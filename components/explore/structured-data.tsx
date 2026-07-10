/**
 * Structured Data (JSON-LD) for Explore Questions Page
 *
 * Provides rich semantic data for:
 * - Search engines (Google, Bing)
 * - LLM crawlers (ChatGPT, Perplexity, Claude)
 * - Social platforms
 *
 * Implements:
 * - ItemList schema (for the question collection)
 * - BreadcrumbList schema (navigation hierarchy)
 * - WebPage schema (page metadata)
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://meelni.com";

  // 1. ItemList Schema - for the collection of questions
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Product Manager Interview Questions",
    description: `Browse ${totalQuestions.toLocaleString()} real interview questions from top tech companies including Google, Meta, Amazon, and more.`,
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

  // 3. WebPage Schema with detailed metadata
  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Explore Real PM Interview Questions",
    description: `Browse and search through ${totalQuestions.toLocaleString()} real Product Manager interview questions from companies like Google, Meta, Amazon, Apple, and more.`,
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
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/logo.png`,
      },
    },
  };

  // 4. CollectionPage Schema (more specific than WebPage)
  const collectionPageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `PM Interview Questions - Page ${currentPage} of ${totalPages}`,
    description: "Searchable database of real Product Manager interview questions",
    url: `${baseUrl}/explore`,
    about: {
      "@type": "Thing",
      name: "Product Manager Interviews",
      description: "Interview questions for Product Manager roles at top technology companies",
    },
    keywords: [
      "product manager interview questions",
      "PM interview prep",
      "product sense questions",
      "behavioral interview questions",
      "execution interview questions",
      "strategy interview questions",
      "Google PM interview",
      "Meta PM interview",
      "Amazon PM interview",
    ].join(", "),
  };

  // 5. Dataset Schema (helps Google understand this as a structured data source)
  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Meelni PM Interview Question Database",
    description: `Public collection of ${totalQuestions.toLocaleString()} Product Manager interview questions available in Meelni Explore.`,
    url: `${baseUrl}/explore`,
    numberOfItems: totalQuestions,
    keywords: [
      "product manager",
      "interview questions",
      "product sense",
      "behavioral",
      "execution",
      "strategy",
      "PM interview",
    ],
    creator: {
      "@type": "Organization",
      name: "Meelni",
      url: baseUrl,
    },
  };

  return (
    <>
      {/* ItemList Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(itemListSchema),
        }}
      />

      {/* BreadcrumbList Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema),
        }}
      />

      {/* WebPage Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webPageSchema),
        }}
      />

      {/* CollectionPage Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(collectionPageSchema),
        }}
      />

      {/* Dataset Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(datasetSchema),
        }}
      />
    </>
  );
}
