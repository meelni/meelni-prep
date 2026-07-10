"use client";

import { companies } from "@/lib/data/companies";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  Home,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/sections/header";
import {
  MarketingCard,
  MarketingCtaCard,
  MarketingEyebrow,
  MarketingHero,
  MarketingMetaRow,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import { Button } from "@/components/ui/button";

// Structured Data for SEO
function CompaniesStructuredData() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://meelni.com";

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
        name: "Company Guides",
        item: `${baseUrl}/companies`,
      },
    ],
  };

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "PM Interview Company Guides",
    description: `PM interview practice guides for ${companies.length} companies, with illustrative questions organized by round type.`,
    numberOfItems: companies.length,
    itemListElement: companies.map((company, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Article",
        name: `${company.name} PM Interview Guide`,
        description: `Illustrative PM practice questions associated with ${company.name}.`,
        url: `${baseUrl}/companies/${company.slug}`,
      },
    })),
  };

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Company Interview Guides | Meelni",
    description:
      "Explore PM interview practice guides with illustrative questions organized by company and round type.",
    url: `${baseUrl}/companies`,
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />
    </>
  );
}

export default function CompaniesPage() {
  return (
    <MarketingPage>
      {/* Structured Data for SEO */}
      <CompaniesStructuredData />

      {/* Site Header */}
      <Header />

      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mx-auto max-w-6xl px-6 pt-8">
        <ol className="text-muted-foreground flex items-center gap-2 text-sm">
          <li>
            <Link
              href="/"
              className="hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              <Home className="h-4 w-4" />
              <span>Home</span>
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-4 w-4" />
          </li>
          <li aria-current="page">
            <span className="text-foreground font-medium">Company Guides</span>
          </li>
        </ol>
      </nav>

      {/* Page Header */}
      <div className="mx-auto max-w-6xl px-6 pb-12">
        <MarketingHero
          eyebrow={
            <MarketingEyebrow icon={Building2}>
              Interview Guides
            </MarketingEyebrow>
          }
          title="Company Guides"
          description="Explore illustrative PM questions organized by company and round type. Confirm each company's current interview process with your recruiter."
        />

        {/* Company Cards Grid */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <MarketingCard key={company.slug}>
              <div className="p-6 pb-4">
                <MarketingEyebrow className="min-h-8 px-3 py-1.5 text-xs">
                  {company.industry.split(" / ")[0]}
                </MarketingEyebrow>
              </div>

              <div className="flex flex-1 flex-col gap-4 px-6 pb-6">
                <div className="space-y-4">
                  <h2 className="font-display text-foreground group-hover:text-primary text-2xl leading-tight font-bold transition-colors duration-200">
                    {company.name}
                  </h2>
                  <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
                    Illustrative PM practice questions associated with
                    {company.name}.
                  </p>
                </div>

                <div className="mt-auto space-y-4">
                  <MarketingMetaRow
                    items={[
                      {
                        icon: MessageSquare,
                        label: `${company.questionCategories.reduce(
                          (count, category) =>
                            count + category.questions.length,
                          0
                        )} practice questions`,
                      },
                    ]}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground text-xs">
                      Current process varies by role.
                    </span>
                    <Button asChild variant="link" className="h-auto p-0">
                      <Link
                        href={`/companies/${company.slug}`}
                        className="gap-1"
                      >
                        View guide
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </MarketingCard>
          ))}
        </div>

        {/* Bottom CTA */}
        <MarketingCtaCard
          className="mt-20"
          mark="M"
          title="Ready to practice?"
          description="Practice a PM question out loud, then review feedback and choose what to improve next."
          action={
            <Button asChild size="lg" variant="glow">
              <Link href="/dashboard/new-interview">
                Start mock interview
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          }
        />
      </div>
    </MarketingPage>
  );
}
