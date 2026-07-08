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
  ChevronRight
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  if (!company) {
    return (
      <MarketingPage className="flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Company not found</h1>
          <p className="text-muted-foreground mb-4">
            We don't have a guide for this company yet.
          </p>
          <Button asChild variant="outline">
            <Link href="/companies">
              View all companies
            </Link>
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
      <nav aria-label="Breadcrumb" className="max-w-3xl mx-auto px-6 pt-8">
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
          <li>
            <Link
              href="/companies"
              className="hover:text-foreground transition-colors"
            >
              Companies
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="w-4 h-4" />
          </li>
          <li aria-current="page">
            <span className="text-foreground font-medium">{company.name}</span>
          </li>
        </ol>
      </nav>

      {/* Article */}
      <article className="max-w-3xl mx-auto px-6 py-12">
        <MarketingArticleHeader
          className="mb-12 border-b border-border/30 pb-10"
          eyebrow={
            <MarketingEyebrow className="px-3 py-1.5 text-xs uppercase tracking-wide">
              {company.industry}
            </MarketingEyebrow>
          }
          title={`${company.name} PM Interview Guide`}
          meta={
            <div className="space-y-6">
              <p className="text-lg leading-loose text-foreground/85">
                {company.description}
              </p>
              <MarketingMetaRow
                className="border-t-0 pt-0 text-sm"
                items={[
                  { icon: Clock, label: company.interviewDuration },
                  { icon: Users, label: `${company.interviewRounds} interview rounds` },
                ]}
              >
                <span className="rounded-lg border border-border/40 bg-muted/50 px-3 py-1.5 font-medium text-muted-foreground">
                  {company.difficulty}
                </span>
              </MarketingMetaRow>
            </div>
          }
        />

        {/* Table of Contents */}
        <nav className="mb-14 p-6 rounded-2xl bg-muted/30 border border-border/40">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">On this page</h2>
          <ul className="space-y-3 text-sm">
            <li>
              <a href="#role" className="text-foreground/70 hover:text-primary transition-colors flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Role Overview & Salary
              </a>
            </li>
            <li>
              <a href="#process" className="text-foreground/70 hover:text-primary transition-colors flex items-center gap-2">
                <Users className="h-4 w-4" />
                Interview Process
              </a>
            </li>
            <li>
              <a href="#questions" className="text-foreground/70 hover:text-primary transition-colors flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Example Questions
              </a>
            </li>
            <li>
              <a href="#tips" className="text-foreground/70 hover:text-primary transition-colors flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Interview Tips
              </a>
            </li>
            <li>
              <a href="#preparation" className="text-foreground/70 hover:text-primary transition-colors flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                How to Prepare
              </a>
            </li>
          </ul>
        </nav>

        {/* Role Overview & Salary */}
        <section id="role" className="mb-16 scroll-mt-24">
          <h2 className="text-3xl font-display font-bold mb-6 leading-tight text-foreground border-b border-border/20 pb-3 flex items-center gap-3">
            <Briefcase className="h-6 w-6 text-primary" />
            Role Overview & Salary
          </h2>

          <p className="text-lg leading-loose mb-8 text-foreground/85">
            {company.roleOverview.description}
          </p>

          {/* Skills */}
          <div className="mb-10">
            <h3 className="text-xl font-display font-semibold mb-4 text-foreground">Key Skills Required</h3>
            <ul className="grid sm:grid-cols-2 gap-3">
              {company.roleOverview.skills.map((skill, index) => (
                <li key={index} className="flex items-start gap-3 text-base text-foreground/85">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>{skill}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Salary Table */}
          {company.salaryLevels && (
            <div className="overflow-hidden rounded-2xl border border-border/40">
              <div className="px-6 py-4 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border/40">
                <h3 className="font-display font-semibold text-foreground flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5 text-primary" />
                  {company.name} PM Compensation
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Level</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Base Salary</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Total Comp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {company.salaryLevels.map((level, index) => (
                      <tr key={index} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4 text-sm text-foreground font-medium">{level.level}</td>
                        <td className="px-6 py-4 text-sm text-foreground/70">{level.baseSalary}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-primary">{level.totalComp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {company.salaryNote && (
                <div className="px-6 py-4 bg-muted/20 border-t border-border/40">
                  <p className="text-xs text-foreground/60 leading-relaxed">{company.salaryNote}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Interview Process */}
        <section id="process" className="mb-16 scroll-mt-24">
          <h2 className="text-3xl font-display font-bold mb-8 leading-tight text-foreground border-b border-border/20 pb-3 flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            Interview Process
          </h2>

          <div className="space-y-6">
            {company.interviewStages.map((stage, index) => (
              <div
                key={index}
                className="relative pl-12"
              >
                {/* Timeline line */}
                {index !== company.interviewStages.length - 1 && (
                  <div className="absolute left-[17px] top-12 bottom-0 w-0.5 bg-gradient-to-b from-primary/40 to-border/40" />
                )}

                {/* Timeline dot */}
                <div className="absolute left-0 top-0 w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
                  <span className="text-xs font-bold text-primary-foreground">{index + 1}</span>
                </div>

                {/* Content */}
                <div className="rounded-2xl border border-border/40 p-6 bg-card/50 hover:bg-card/80 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-display font-semibold text-foreground text-lg">{stage.name}</h3>
                    {stage.duration && (
                      <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                        {stage.duration}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground/70 leading-relaxed">
                    {stage.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Example Questions */}
        <section id="questions" className="mb-16 scroll-mt-24">
          <h2 className="text-3xl font-display font-bold mb-8 leading-tight text-foreground border-b border-border/20 pb-3 flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-primary" />
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
                  className="rounded-2xl border border-border/40 overflow-hidden bg-card/50"
                >
                  <div className="px-6 py-4 bg-gradient-to-r from-muted/50 to-transparent border-b border-border/40">
                    <h3 className="font-display font-semibold text-foreground text-base">{category.category}</h3>
                    <p className="text-xs text-foreground/50 mt-1">
                      {category.questions.length} questions
                    </p>
                  </div>
                  <ul className="divide-y divide-border/30">
                    {displayQuestions.map((question, index) => (
                      <li key={index} className="px-6 py-4 text-sm text-foreground/85 hover:bg-muted/30 transition-colors leading-relaxed">
                        {question}
                      </li>
                    ))}
                  </ul>
                  {category.questions.length > 3 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => toggleCategory(category.category)}
                      className="w-full rounded-none border-t border-border/40 text-primary"
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
          <div className="mt-8 p-6 rounded-2xl bg-muted/30 border border-border/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-sm text-foreground/70">
              Practice these questions with real-time AI feedback
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard/new-rep">
                Start practicing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        {/* Interview Tips */}
        <section id="tips" className="mb-16 scroll-mt-24">
          <h2 className="text-3xl font-display font-bold mb-8 leading-tight text-foreground border-b border-border/20 pb-3 flex items-center gap-3">
            <Lightbulb className="h-6 w-6 text-primary" />
            Interview Tips
          </h2>

          <div className="grid gap-5">
            {company.interviewTips.map((tip, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl border border-border/40 bg-card/50 hover:bg-card/80 hover:border-primary/30 transition-all"
              >
                <h3 className="font-display font-semibold text-foreground mb-3 text-base">{tip.title}</h3>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {tip.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Preparation Steps */}
        <section id="preparation" className="mb-16 scroll-mt-24">
          <h2 className="text-3xl font-display font-bold mb-8 leading-tight text-foreground border-b border-border/20 pb-3 flex items-center gap-3">
            <GraduationCap className="h-6 w-6 text-primary" />
            How to Prepare
          </h2>

          <div className="space-y-4">
            {company.preparationSteps.map((step, index) => (
              <div
                key={index}
                className="flex items-start gap-4 p-5 rounded-2xl border border-border/40 bg-card/50 hover:bg-card/80 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/20">
                  <span className="text-xs font-bold text-primary-foreground">{index + 1}</span>
                </div>
                <p className="text-base text-foreground/85 leading-relaxed pt-1">{step}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <MarketingCtaCard
          mark="M"
          title={`Ready to ace your ${company.name} interview?`}
          description="Practice with Meelni's AI interview coach. Get real-time feedback, improve your answers, and build confidence before your big day."
          action={
            <Button asChild size="lg" variant="glow">
              <Link href="/dashboard/new-rep">
                Start mock interview
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          }
        />

        {/* Back Link */}
        <div className="mt-16 pt-10 border-t border-border/30">
          <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
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
