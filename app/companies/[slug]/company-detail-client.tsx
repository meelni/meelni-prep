"use client";

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
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Home,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { normalizeQuestionRound } from "@meelni/core";

import { Header } from "@/components/sections/header";
import type { PublicCompanyGuide } from "@/lib/data/public-company";
import { PublicActivationButton } from "@/components/public-activation-action";
import {
  buildNewInterviewHref,
  NEW_INTERVIEW_PATH,
} from "@/lib/navigation/interview-launch";

function buildCompanyRoundPracticeHref(
  company: PublicCompanyGuide,
  category: string
): string {
  const searchParams = new URLSearchParams({
    company: company.name,
    returnTo: `/companies/${company.slug}`,
  });
  const roundType = normalizeQuestionRound(category);
  if (roundType) {
    searchParams.set("interview_type", roundType);
  }
  return buildNewInterviewHref(searchParams);
}

export function CompanyDetailClient({
  company,
}: {
  company: PublicCompanyGuide;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

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
                Practice illustrative PM interview questions associated with{" "}
                {company.name}.
              </p>
              <p className="text-muted-foreground border-border/40 border-t pt-4 text-sm leading-relaxed">
                Interview formats vary by role, level, location, and hiring
                cycle. Confirm the current stages and timing with your
                recruiter.
              </p>
              <MarketingMetaRow
                className="border-t-0 pt-0 text-sm"
                items={[
                  {
                    icon: MessageSquare,
                    label: `${company.questionCategories.reduce(
                      (count, category) => count + category.questions.length,
                      0
                    )} illustrative practice questions`,
                  },
                ]}
              />
            </div>
          }
        />

        {/* Example Questions */}
        <section id="questions" className="mb-16 scroll-mt-24">
          <h2 className="font-display text-foreground border-border/20 mb-8 flex items-center gap-3 border-b pb-3 text-3xl leading-tight font-bold">
            <MessageSquare className="text-primary h-6 w-6" />
            Example Interview Questions
          </h2>

          <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
            These are illustrative practice questions tagged to {company.name},
            not a claim about the company&apos;s current interview process.
          </p>

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
                  <div className="border-border/40 flex flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground text-xs">
                      Practice this company tag and round type in setup.
                    </p>
                    <PublicActivationButton
                      href={buildCompanyRoundPracticeHref(
                        company,
                        category.category
                      )}
                      variant="outline"
                      size="sm"
                    >
                      Practice {category.category}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </PublicActivationButton>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mini CTA */}
          <div className="bg-muted/30 border-border/40 mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center">
            <p className="text-foreground/70 text-sm">
              Practice a question out loud and review feedback afterward.
            </p>
            <PublicActivationButton href={NEW_INTERVIEW_PATH} variant="outline">
              Start practicing
              <ArrowRight className="ml-2 h-4 w-4" />
            </PublicActivationButton>
          </div>
        </section>

        {/* Final CTA */}
        <MarketingCtaCard
          mark="M"
          title={`Prepare for your ${company.name} interview.`}
          description="Practice a PM question out loud, then review feedback and choose what to improve next."
          action={
            <PublicActivationButton
              href={NEW_INTERVIEW_PATH}
              size="lg"
              variant="glow"
            >
              Start mock interview
              <ArrowRight className="ml-2 h-4 w-4" />
            </PublicActivationButton>
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
