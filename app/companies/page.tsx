"use client";

import { companies } from "@/lib/data/companies";
import { Clock, Users, Building2, Home, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/sections/header";

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
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/5 to-background">
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
        <div className="text-center space-y-6 mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 mb-4">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Building2 className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-[13px] font-semibold text-primary">Interview Guides</span>
          </div>
          <h1 className="text-[48px] sm:text-[64px] font-display font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent leading-[1.1]">
            Company Guides
          </h1>
          <p className="text-[19px] text-foreground/70 max-w-2xl mx-auto leading-relaxed">
            Master your PM interviews with detailed guides for top tech companies.
            Learn the process, practice real questions, and land your dream role.
          </p>
        </div>

        {/* Company Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {companies.map((company) => (
            <Link key={company.slug} href={`/companies/${company.slug}`}>
              <article className="group h-full bg-card/60 backdrop-blur-sm border border-border/40 rounded-2xl overflow-hidden transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-2">
                {/* Industry Badge */}
                <div className="p-6 pb-4">
                  <span className="inline-block px-3 py-1.5 rounded-full bg-gradient-to-r from-primary/10 to-primary/5 text-primary text-[11px] font-semibold tracking-wide uppercase border border-primary/20">
                    {company.industry.split(" / ")[0]}
                  </span>
                </div>

                {/* Content */}
                <div className="px-6 pb-6 space-y-4">
                  <h2 className="text-[24px] font-display font-bold leading-tight text-foreground group-hover:text-primary transition-colors duration-200">
                    {company.name}
                  </h2>
                  <p className="text-[15px] text-foreground/70 line-clamp-3 leading-relaxed">
                    {company.description}
                  </p>

                  {/* Meta Info */}
                  <div className="flex items-center gap-4 text-[12px] text-muted-foreground pt-3 border-t border-border/30">
                    <div className="flex items-center gap-1.5 mt-3">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{company.interviewDuration}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3">
                      <Users className="h-3.5 w-3.5" />
                      <span>{company.interviewRounds} rounds</span>
                    </div>
                  </div>

                  {/* Difficulty + Read more */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground border border-border/40">
                      {company.difficulty}
                    </span>
                    <span className="text-[14px] font-medium text-primary group-hover:gap-2 inline-flex items-center gap-1 transition-all duration-200">
                      View guide
                      <svg className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-3xl" />
          <div className="relative p-10 rounded-3xl border border-primary/20 backdrop-blur-sm text-center">
            <div className="flex flex-col items-center">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-6 shadow-lg shadow-primary/20">
                <span className="text-[18px] font-bold text-primary-foreground">M</span>
              </div>
              <h3 className="text-[26px] font-display font-bold mb-2 text-foreground">
                Ready to practice?
              </h3>
              <p className="text-[17px] text-foreground/70 leading-relaxed mb-6 max-w-xl">
                Put your knowledge into action with Meelni's AI interview coach.
                Get real-time feedback and improve faster than solo practice.
              </p>
              <Link
                href="/setup"
                className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-primary-foreground font-semibold text-[16px] hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] transition-all duration-200"
              >
                Start mock interview
                <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
