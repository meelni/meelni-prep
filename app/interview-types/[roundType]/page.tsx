import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, Home, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { RoundType } from "@meelni/core";

import { Header } from "@/components/sections/header";
import {
  MarketingArticleHeader,
  MarketingCtaCard,
  MarketingEyebrow,
  MarketingMetaRow,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import { Button } from "@/components/ui/button";
import { PublicActivationButton } from "@/components/public-activation-action";
import { JsonLd } from "@/components/seo/json-ld";
import { loadPublicQuestionCorpus } from "@/lib/workflows/public-question-corpus";
import { buildNewInterviewHref } from "@/lib/navigation/interview-launch";
import { PUBLIC_ORIGIN, publicMetadata } from "@/lib/seo/public-metadata";
import {
  INTERVIEW_TYPE_ROUTE_SEGMENTS,
  assertInterviewTypeRoute,
  interviewTypeDescription,
  interviewTypeLabel,
  interviewTypePath,
  interviewTypePracticeDescription,
  questionPath,
} from "@/lib/seo/interview-route-content";

export const dynamic = "force-dynamic";

const QUESTION_PREVIEW_LIMIT = 12;

interface InterviewTypePageParams {
  params: Promise<{ roundType: string }>;
}

export function generateStaticParams() {
  return INTERVIEW_TYPE_ROUTE_SEGMENTS.map((roundType) => ({ roundType }));
}

export async function generateMetadata({ params }: InterviewTypePageParams) {
  const { roundType } = await params;
  if (!assertInterviewTypeRoute(roundType)) {
    return {
      title: "Interview Type Not Found",
      robots: { index: false, follow: false },
    };
  }

  const label = interviewTypeLabel(roundType);
  return publicMetadata(interviewTypePath(roundType), {
    title: `${label} PM Interview Questions | Meelni`,
    description: interviewTypePracticeDescription(roundType),
  });
}

function InterviewTypeStructuredData({
  roundType,
  totalQuestions,
}: {
  roundType: RoundType;
  totalQuestions: number | null;
}) {
  const label = interviewTypeLabel(roundType);
  const url = `${PUBLIC_ORIGIN}${interviewTypePath(roundType)}`;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: PUBLIC_ORIGIN },
      {
        "@type": "ListItem",
        position: 2,
        name: "Explore Questions",
        item: `${PUBLIC_ORIGIN}/explore`,
      },
      { "@type": "ListItem", position: 3, name: label, item: url },
    ],
  };

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${label} PM Interview Questions`,
    description:
      totalQuestions === null
        ? interviewTypePracticeDescription(roundType)
        : `${totalQuestions.toLocaleString()} currently available ${label} PM practice questions.`,
    url,
    inLanguage: "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: "Meelni",
      url: PUBLIC_ORIGIN,
    },
  };

  return (
    <>
      <JsonLd id="interview-type-breadcrumb-schema" data={breadcrumbSchema} />
      <JsonLd id="interview-type-page-schema" data={pageSchema} />
    </>
  );
}

export default async function InterviewTypePage({
  params,
}: InterviewTypePageParams) {
  const { roundType: rawRoundType } = await params;
  if (!assertInterviewTypeRoute(rawRoundType)) notFound();

  const roundType = rawRoundType;
  const label = interviewTypeLabel(roundType);
  const practiceHref = buildNewInterviewHref(
    new URLSearchParams({ interview_type: roundType })
  );

  let questions: Awaited<
    ReturnType<typeof loadPublicQuestionCorpus>
  >["questions"] = [];
  let totalQuestions: number | null = null;
  let loadFailed = false;

  try {
    const corpus = await loadPublicQuestionCorpus({
      roundType,
      limit: QUESTION_PREVIEW_LIMIT,
      offset: 0,
    });
    questions = corpus.questions;
    totalQuestions = corpus.total;
  } catch {
    loadFailed = true;
  }

  return (
    <MarketingPage>
      <InterviewTypeStructuredData
        roundType={roundType}
        totalQuestions={totalQuestions}
      />
      <Header />

      <nav aria-label="Breadcrumb" className="mx-auto max-w-5xl px-6 pt-8">
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
            <Link href="/explore" className="hover:text-foreground">
              Explore
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-4 w-4" />
          </li>
          <li aria-current="page">
            <span className="text-foreground font-medium">{label}</span>
          </li>
        </ol>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <MarketingArticleHeader
          className="border-border/30 mb-10 border-b pb-10"
          eyebrow={
            <MarketingEyebrow icon={MessageSquare}>{label}</MarketingEyebrow>
          }
          title={`${label} PM Interview Questions`}
          meta={
            <div className="space-y-5">
              <p className="text-foreground/85 text-lg leading-loose">
                {interviewTypePracticeDescription(roundType)}
              </p>
              <MarketingMetaRow
                className="border-t-0 pt-0 text-sm"
                items={[
                  {
                    icon: MessageSquare,
                    label:
                      totalQuestions === null
                        ? "Practice-question count unavailable"
                        : `${totalQuestions.toLocaleString()} currently available questions`,
                  },
                ]}
              />
            </div>
          }
        />

        <section className="mb-12">
          <h2 className="font-display text-foreground mb-4 text-2xl font-semibold">
            Practice prompts
          </h2>
          <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
            {interviewTypeDescription(roundType)} These prompts are active
            practice questions, not claims about any company&apos;s current
            hiring process.
          </p>

          {loadFailed ? (
            <div className="border-border/40 bg-card/50 rounded-2xl border p-6">
              <p className="text-muted-foreground text-sm">
                We couldn&apos;t load this question set. Explore all questions
                or start a {label} mock interview from the setup flow.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {questions.map((question) => (
                <article
                  key={question.id}
                  className="border-border/40 bg-card/50 rounded-2xl border p-5"
                >
                  <p className="text-muted-foreground mb-2 text-xs">
                    {question.company ?? "General PM practice"}
                  </p>
                  <h3 className="text-foreground mb-4 text-base leading-snug font-semibold">
                    {question.questionText}
                  </h3>
                  <Button asChild variant="link" className="h-auto p-0">
                    <Link href={questionPath(question.id)}>
                      View question
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>

        <MarketingCtaCard
          mark="M"
          title={`Practice a ${label} interview`}
          description="Start a mock interview with this round type preserved through sign-in and setup."
          action={
            <PublicActivationButton
              href={practiceHref}
              size="lg"
              variant="glow"
            >
              Start mock interview
              <ArrowRight className="ml-2 h-4 w-4" />
            </PublicActivationButton>
          }
        />
      </main>
    </MarketingPage>
  );
}
