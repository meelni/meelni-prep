"use client";

import { useParams } from "next/navigation";
import { getCompanyBySlug, Company } from "@/lib/data/companies";
import { Button } from "@/components/ui/button";
import {
  MarketingArticleHeader,
  MarketingCtaCard,
  MarketingEyebrow,
  MarketingMetaRow,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import {
  ArrowRight,
  ArrowLeft,
  Clock,
  Users,
  DollarSign,
  CheckCircle2,
  Lightbulb,
  MessageSquare,
  Briefcase,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Home,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Header } from "@/components/sections/header";

// Structured Data for SEO
function CompanyStructuredData({ company }: { company: Company }) {
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
      {
        "@type": "ListItem",
        position: 3,
        name: `${company.name} Interview Guide`,
        item: `${baseUrl}/companies/${company.slug}`,
      },
    ],
  };

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${company.name} PM Interview Guide`,
    description: company.description,
    url: `${baseUrl}/companies/${company.slug}`,
    inLanguage: "en-US",
    publisher: {
      "@type": "Organization",
      name: "Meelni",
      url: baseUrl,
    },
    author: {
      "@type": "Organization",
      name: "Meelni",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${baseUrl}/companies/${company.slug}`,
    },
    about: {
      "@type": "Organization",
      name: company.name,
      industry: company.industry,
    },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: company.questionCategories.flatMap((cat) =>
      cat.questions.slice(0, 3).map((q) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: {
          "@type": "Answer",
          text: `This is a real ${cat.category} interview question asked at ${company.name}. Practice with Meelni's AI interview coach to prepare your answer.`,
        },
      }))
    ),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </>
  );
}

export default function CompanyDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const company = getCompanyBySlug(slug);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  if (!company) {
    return (
      <MarketingPage className="flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-foreground mb-2 text-2xl font-bold">
            Company not found
          </h1>
          <p className="text-muted-foreground mb-4">
            We don't have a guide for this company yet.
          </p>
          <Button asChild variant="outline">
            <Link href="/companies">View all companies</Link>
          </Button>
        </div>
      </MarketingPage>
    );
  }

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  return (
    <MarketingPage>
      {/* Structured Data for SEO */}
      <CompanyStructuredData company={company} />

      {/* Site Header */}
      <Header />

      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mx-auto max-w-3xl px-6 pt-8">
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
          <li>
            <Link
              href="/companies"
              className="hover:text-foreground transition-colors"
            >
              Companies
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-4 w-4" />
          </li>
          <li aria-current="page">
            <span className="text-foreground font-medium">{company.name}</span>
          </li>
        </ol>
      </nav>

      {/* Article */}
      <article className="mx-auto max-w-3xl px-6 py-12">
        <MarketingArticleHeader
          className="border-border/30 mb-12 border-b pb-10"
          eyebrow={
            <MarketingEyebrow className="px-3 py-1.5 text-xs tracking-wide uppercase">
              {company.industry}
            </MarketingEyebrow>
          }
          title={`${company.name} PM Interview Guide`}
          meta={
            <div className="space-y-6">
              <p className="text-foreground/85 text-lg leading-loose">
                {company.description}
              </p>
              <MarketingMetaRow
                className="border-t-0 pt-0 text-sm"
                items={[
                  { icon: Clock, label: company.interviewDuration },
                  {
                    icon: Users,
                    label: `${company.interviewRounds} interview rounds`,
                  },
                ]}
              >
                <span className="border-border/40 bg-muted/50 text-muted-foreground rounded-lg border px-3 py-1.5 font-medium">
                  {company.difficulty}
                </span>
              </MarketingMetaRow>
            </div>
          }
        />

        {/* Table of Contents */}
        <nav className="bg-muted/30 border-border/40 mb-14 rounded-2xl border p-6">
          <h2 className="text-foreground mb-4 text-sm font-semibold tracking-wide uppercase">
            On this page
          </h2>
          <ul className="space-y-3 text-sm">
            <li>
              <a
                href="#role"
                className="text-foreground/70 hover:text-primary flex items-center gap-2 transition-colors"
              >
                <Briefcase className="h-4 w-4" />
                Role Overview & Salary
              </a>
            </li>
            <li>
              <a
                href="#process"
                className="text-foreground/70 hover:text-primary flex items-center gap-2 transition-colors"
              >
                <Users className="h-4 w-4" />
                Interview Process
              </a>
            </li>
            <li>
              <a
                href="#questions"
                className="text-foreground/70 hover:text-primary flex items-center gap-2 transition-colors"
              >
                <MessageSquare className="h-4 w-4" />
                Example Questions
              </a>
            </li>
            <li>
              <a
                href="#tips"
                className="text-foreground/70 hover:text-primary flex items-center gap-2 transition-colors"
              >
                <Lightbulb className="h-4 w-4" />
                Interview Tips
              </a>
            </li>
            <li>
              <a
                href="#preparation"
                className="text-foreground/70 hover:text-primary flex items-center gap-2 transition-colors"
              >
                <GraduationCap className="h-4 w-4" />
                How to Prepare
              </a>
            </li>
          </ul>
        </nav>

        {/* Role Overview & Salary */}
        <section id="role" className="mb-16 scroll-mt-24">
          <h2 className="font-display text-foreground border-border/20 mb-6 flex items-center gap-3 border-b pb-3 text-3xl leading-tight font-bold">
            <Briefcase className="text-primary h-6 w-6" />
            Role Overview & Salary
          </h2>

          <p className="text-foreground/85 mb-8 text-lg leading-loose">
            {company.roleOverview.description}
          </p>

          {/* Skills */}
          <div className="mb-10">
            <h3 className="font-display text-foreground mb-4 text-xl font-semibold">
              Key Skills Required
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {company.roleOverview.skills.map((skill, index) => (
                <li
                  key={index}
                  className="text-foreground/85 flex items-start gap-3 text-base"
                >
                  <CheckCircle2 className="text-primary mt-0.5 h-5 w-5 flex-shrink-0" />
                  <span>{skill}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Salary Table */}
          {company.salaryLevels && (
            <div className="border-border/40 overflow-hidden rounded-2xl border">
              <div className="from-primary/10 to-primary/5 border-border/40 border-b bg-gradient-to-r px-6 py-4">
                <h3 className="font-display text-foreground flex items-center gap-2 text-lg font-semibold">
                  <DollarSign className="text-primary h-5 w-5" />
                  {company.name} PM Compensation
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-border/40 bg-muted/30 border-b">
                      <th className="text-foreground px-6 py-4 text-left text-sm font-semibold">
                        Level
                      </th>
                      <th className="text-foreground px-6 py-4 text-left text-sm font-semibold">
                        Base Salary
                      </th>
                      <th className="text-foreground px-6 py-4 text-left text-sm font-semibold">
                        Total Comp
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {company.salaryLevels.map((level, index) => (
                      <tr
                        key={index}
                        className="border-border/30 hover:bg-muted/20 border-b transition-colors last:border-0"
                      >
                        <td className="text-foreground px-6 py-4 text-sm font-medium">
                          {level.level}
                        </td>
                        <td className="text-foreground/70 px-6 py-4 text-sm">
                          {level.baseSalary}
                        </td>
                        <td className="text-primary px-6 py-4 text-sm font-semibold">
                          {level.totalComp}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {company.salaryNote && (
                <div className="bg-muted/20 border-border/40 border-t px-6 py-4">
                  <p className="text-foreground/60 text-xs leading-relaxed">
                    {company.salaryNote}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Interview Process */}
        <section id="process" className="mb-16 scroll-mt-24">
          <h2 className="font-display text-foreground border-border/20 mb-8 flex items-center gap-3 border-b pb-3 text-3xl leading-tight font-bold">
            <Users className="text-primary h-6 w-6" />
            Interview Process
          </h2>

          <div className="space-y-6">
            {company.interviewStages.map((stage, index) => (
              <div key={index} className="relative pl-12">
                {/* Timeline line */}
                {index !== company.interviewStages.length - 1 && (
                  <div className="from-primary/40 to-border/40 absolute top-12 bottom-0 left-[17px] w-0.5 bg-gradient-to-b" />
                )}

                {/* Timeline dot */}
                <div className="from-primary to-primary/60 shadow-primary/20 absolute top-0 left-0 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br shadow-lg">
                  <span className="text-primary-foreground text-xs font-bold">
                    {index + 1}
                  </span>
                </div>

                {/* Content */}
                <div className="border-border/40 bg-card/50 hover:bg-card/80 rounded-2xl border p-6 transition-colors">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="font-display text-foreground text-lg font-semibold">
                      {stage.name}
                    </h3>
                    {stage.duration && (
                      <span className="bg-primary/10 text-primary border-primary/20 rounded-full border px-3 py-1 text-xs font-medium">
                        {stage.duration}
                      </span>
                    )}
                  </div>
                  <p className="text-foreground/70 text-sm leading-relaxed">
                    {stage.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Example Questions */}
        <section id="questions" className="mb-16 scroll-mt-24">
          <h2 className="font-display text-foreground border-border/20 mb-8 flex items-center gap-3 border-b pb-3 text-3xl leading-tight font-bold">
            <MessageSquare className="text-primary h-6 w-6" />
            Example Interview Questions
          </h2>

          <div className="space-y-6">
            {company.questionCategories.map((category) => {
              const isExpanded = expandedCategories.has(category.category);
              const displayQuestions = isExpanded
                ? category.questions
                : category.questions.slice(0, 3);

              return (
                <div
                  key={category.category}
                  className="border-border/40 bg-card/50 overflow-hidden rounded-2xl border"
                >
                  <div className="from-muted/50 border-border/40 border-b bg-gradient-to-r to-transparent px-6 py-4">
                    <h3 className="font-display text-foreground text-base font-semibold">
                      {category.category}
                    </h3>
                    <p className="text-foreground/50 mt-1 text-xs">
                      {category.questions.length} questions
                    </p>
                  </div>
                  <ul className="divide-border/30 divide-y">
                    {displayQuestions.map((question, index) => (
                      <li
                        key={index}
                        className="text-foreground/85 hover:bg-muted/30 px-6 py-4 text-sm leading-relaxed transition-colors"
                      >
                        {question}
                      </li>
                    ))}
                  </ul>
                  {category.questions.length > 3 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => toggleCategory(category.category)}
                      className="border-border/40 text-primary w-full rounded-none border-t"
                    >
                      {isExpanded ? (
                        <>
                          Show less
                          <ChevronUp className="h-4 w-4" />
                        </>
                      ) : (
                        <>
                          Show {category.questions.length - 3} more questions
                          <ChevronDown className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mini CTA */}
          <div className="bg-muted/30 border-border/40 mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center">
            <p className="text-foreground/70 text-sm">
              Practice these questions in a live mock interview
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard/new-interview">
                Start practicing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        {/* Interview Tips */}
        <section id="tips" className="mb-16 scroll-mt-24">
          <h2 className="font-display text-foreground border-border/20 mb-8 flex items-center gap-3 border-b pb-3 text-3xl leading-tight font-bold">
            <Lightbulb className="text-primary h-6 w-6" />
            Interview Tips
          </h2>

          <div className="grid gap-5">
            {company.interviewTips.map((tip, index) => (
              <div
                key={index}
                className="border-border/40 bg-card/50 hover:bg-card/80 hover:border-primary/30 rounded-2xl border p-6 transition-all"
              >
                <h3 className="font-display text-foreground mb-3 text-base font-semibold">
                  {tip.title}
                </h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  {tip.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Preparation Steps */}
        <section id="preparation" className="mb-16 scroll-mt-24">
          <h2 className="font-display text-foreground border-border/20 mb-8 flex items-center gap-3 border-b pb-3 text-3xl leading-tight font-bold">
            <GraduationCap className="text-primary h-6 w-6" />
            How to Prepare
          </h2>

          <div className="space-y-4">
            {company.preparationSteps.map((step, index) => (
              <div
                key={index}
                className="border-border/40 bg-card/50 hover:bg-card/80 flex items-start gap-4 rounded-2xl border p-5 transition-colors"
              >
                <div className="from-primary to-primary/60 shadow-primary/20 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-md">
                  <span className="text-primary-foreground text-xs font-bold">
                    {index + 1}
                  </span>
                </div>
                <p className="text-foreground/85 pt-1 text-base leading-relaxed">
                  {step}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <MarketingCtaCard
          mark="M"
          title={`Ready to ace your ${company.name} interview?`}
          description="Practice with Meelni's AI interviewer, then review feedback tied to your completed interview."
          action={
            <Button asChild size="lg" variant="glow">
              <Link href="/dashboard/new-interview">
                Start mock interview
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          }
        />

        {/* Back Link */}
        <div className="border-border/30 mt-16 border-t pt-10">
          <Button
            asChild
            variant="link"
            className="text-muted-foreground h-auto p-0"
          >
            <Link href="/companies" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              View all companies
            </Link>
          </Button>
        </div>
      </article>
    </MarketingPage>
  );
}
