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
 * - FAQPage schema (for individual questions)
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
        dateCreated: question.createdAt?.toISOString(),
        author: {
          "@type": "Organization",
          name: question.company || "Various Companies",
        },
        acceptedAnswer: {
          "@type": "Answer",
          text: "Practice this question with Meelni's AI interview coach to receive personalized feedback and guidance.",
        },
      },
    })),
  };

  // 2. FAQPage Schema - helps with featured snippets
  const faqPageSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.slice(0, 10).map((question) => ({
      "@type": "Question",
      name: question.questionText,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${question.questionText} - This is a real ${question.questionType} interview question asked at ${question.company || "top tech companies"}. Practice with Meelni's AI interview coach to prepare for your PM interview.`,
      },
    })),
  };

  // 3. BreadcrumbList Schema
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

  // 4. WebPage Schema with detailed metadata
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
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: `${baseUrl}/og-image-explore.png`,
      width: 1200,
      height: 630,
    },
    datePublished: "2024-11-01T00:00:00Z",
    dateModified: new Date().toISOString(),
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

  // 5. CollectionPage Schema (more specific than WebPage)
  const collectionPageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `PM Interview Questions - Page ${currentPage} of ${totalPages}`,
    description: "Searchable database of real Product Manager interview questions",
    url: `${baseUrl}/explore?page=${currentPage}`,
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

  // 6. Dataset Schema (helps Google understand this as a structured data source)
  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Meelni PM Interview Question Database",
    description: `Comprehensive database of ${totalQuestions.toLocaleString()} real Product Manager interview questions collected from actual interviews at top tech companies.`,
    url: `${baseUrl}/explore`,
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
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "text/html",
        contentUrl: `${baseUrl}/explore`,
      },
    ],
    temporalCoverage: "2024/..",
    spatialCoverage: "Worldwide",
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

      {/* FAQPage Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqPageSchema),
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
