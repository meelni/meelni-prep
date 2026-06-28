"use client";

import { companies } from "@/lib/data/companies";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  Clock,
  Home,
  Users,
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
    description: `Comprehensive interview guides for ${companies.length} top tech companies including process, questions, tips, and salary information.`,
    numberOfItems: companies.length,
    itemListElement: companies.map((company, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Article",
        name: `${company.name} PM Interview Guide`,
        description: company.description,
        url: `${baseUrl}/companies/${company.slug}`,
      },
    })),
  };

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Company Interview Guides | Meelni",
    description: "Master your PM interviews with detailed guides for top tech companies. Learn the interview process, practice real questions, and land your dream role.",
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
      <nav aria-label="Breadcrumb" className="max-w-6xl mx-auto px-6 pt-8">
        <ol className="flex items-center gap-2 text-sm text-muted-foreground">
          <li>
            <Link
              href="/"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="w-4 h-4" />
          </li>
          <li aria-current="page">
            <span className="text-foreground font-medium">Company Guides</span>
          </li>
        </ol>
      </nav>

      {/* Page Header */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <MarketingHero
          eyebrow={
            <MarketingEyebrow icon={Building2}>Interview Guides</MarketingEyebrow>
          }
          title="Company Guides"
          description="Master your PM interviews with detailed guides for top tech companies. Learn the process, practice real questions, and land your dream role."
        />

        {/* Company Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {companies.map((company) => (
            <MarketingCard key={company.slug}>
              <div className="p-6 pb-4">
                <MarketingEyebrow className="px-3 py-1.5 text-xs uppercase tracking-wide">
                  {company.industry.split(" / ")[0]}
                </MarketingEyebrow>
              </div>

              <div className="flex flex-1 flex-col gap-4 px-6 pb-6">
                <div className="space-y-4">
                  <h2 className="font-display text-2xl font-bold leading-tight text-foreground transition-colors duration-200 group-hover:text-primary">
                    {company.name}
                  </h2>
                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {company.description}
                  </p>
                </div>

                <div className="mt-auto space-y-4">
                  <MarketingMetaRow
                    items={[
                      { icon: Clock, label: company.interviewDuration },
                      { icon: Users, label: `${company.interviewRounds} rounds` },
                    ]}
                  />

                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      {company.difficulty}
                    </span>
                    <Button asChild variant="link" className="h-auto p-0">
                      <Link href={`/companies/${company.slug}`} className="gap-1">
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
          description="Put your knowledge into action with Meelni's AI interview coach. Get real-time feedback and improve faster than solo practice."
          action={
            <Button asChild size="lg" variant="glow">
              <Link href="/setup">
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
