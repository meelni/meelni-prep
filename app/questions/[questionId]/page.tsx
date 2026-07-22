import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, Home, MessageSquare } from "lucide-react";
import Link from "next/link";
import { normalizeQuestionRound } from "@meelni/core";

import { Header } from "@/components/sections/header";
import {
  MarketingArticleHeader,
  MarketingCtaCard,
  MarketingEyebrow,
  MarketingMetaRow,
  MarketingPage,
  MarketingProse,
} from "@/components/marketing/marketing-surface";
import { PublicActivationButton } from "@/components/public-activation-action";
import { JsonLd } from "@/components/seo/json-ld";
import { getActiveQuestionById } from "@/lib/db/questions";
import { buildQuestionInterviewHref } from "@/lib/navigation/interview-launch";
import { PUBLIC_ORIGIN, publicMetadata } from "@/lib/seo/public-metadata";
import {
  interviewTypePath,
  questionPath,
} from "@/lib/seo/interview-route-content";

export const dynamic = "force-dynamic";

interface QuestionPageParams {
  params: Promise<{ questionId: string }>;
}

export async function generateMetadata({ params }: QuestionPageParams) {
  const { questionId } = await params;
  const question = await getActiveQuestionById(questionId);

  if (!question) {
    return {
      title: "Question Not Found",
      robots: { index: false, follow: false },
    };
  }

  return publicMetadata(questionPath(question.id), {
    title: `${question.questionType} PM Interview Question | Meelni`,
    description: question.company
      ? `Practice this ${question.questionType} PM interview question tagged to ${question.company}.`
      : `Practice this ${question.questionType} PM interview question out loud and review feedback afterward.`,
  });
}

function QuestionStructuredData({
  question,
}: {
  question: {
    id: string;
    company: string | null;
    questionText: string;
    questionType: string;
  };
}) {
  const url = `${PUBLIC_ORIGIN}${questionPath(question.id)}`;
  const roundType = normalizeQuestionRound(question.questionType);

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
      {
        "@type": "ListItem",
        position: 3,
        name: question.questionType,
        item: roundType
          ? `${PUBLIC_ORIGIN}${interviewTypePath(roundType)}`
          : `${PUBLIC_ORIGIN}/explore`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: "Practice question",
        item: url,
      },
    ],
  };

  const questionSchema = {
    "@context": "https://schema.org",
    "@type": "Question",
    name: question.questionText,
    text: question.questionText,
    url,
    about: {
      "@type": "Thing",
      name: question.questionType,
    },
  };

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${question.questionType} PM Interview Question`,
    description:
      "Practice a PM interview question out loud and review feedback afterward.",
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
      <JsonLd id="question-breadcrumb-schema" data={breadcrumbSchema} />
      <JsonLd id="question-schema" data={questionSchema} />
      <JsonLd id="question-page-schema" data={webPageSchema} />
    </>
  );
}

export default async function QuestionPage({ params }: QuestionPageParams) {
  const { questionId } = await params;
  const question = await getActiveQuestionById(questionId);

  if (!question) notFound();

  const roundType = normalizeQuestionRound(question.questionType);
  const practiceHref = buildQuestionInterviewHref(
    question.id,
    questionPath(question.id)
  );

  return (
    <MarketingPage>
      <QuestionStructuredData question={question} />
      <Header />

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
            <Link href="/explore" className="hover:text-foreground">
              Explore
            </Link>
          </li>
          {roundType && (
            <>
              <li aria-hidden="true">
                <ChevronRight className="h-4 w-4" />
              </li>
              <li>
                <Link
                  href={interviewTypePath(roundType)}
                  className="hover:text-foreground"
                >
                  {question.questionType}
                </Link>
              </li>
            </>
          )}
        </ol>
      </nav>

      <article className="mx-auto max-w-3xl px-6 py-12">
        <MarketingArticleHeader
          className="border-border/30 mb-10 border-b pb-10"
          eyebrow={
            <MarketingEyebrow icon={MessageSquare}>
              {question.questionType}
            </MarketingEyebrow>
          }
          title={question.questionText}
          meta={
            <div className="space-y-5">
              <p className="text-foreground/85 text-lg leading-loose">
                Practice this PM interview question out loud, then review
                feedback after a completed mock interview.
              </p>
              <MarketingMetaRow
                className="border-t-0 pt-0 text-sm"
                items={[
                  {
                    icon: MessageSquare,
                    label: question.company
                      ? `Company tag: ${question.company}`
                      : "Company tag: general PM practice",
                  },
                ]}
              />
            </div>
          }
        />

        <MarketingProse>
          <section>
            <h2>How to use this question</h2>
            <p>
              Treat this as a practice prompt, not as a claim about a current
              hiring loop. Say your answer out loud, make your assumptions
              explicit, and use the feedback review to decide what to improve
              next.
            </p>
          </section>
        </MarketingProse>

        <MarketingCtaCard
          className="mt-12"
          mark="M"
          title="Practice this question"
          description="Start a mock interview with this exact selected question preserved through sign-in and setup."
          action={
            <PublicActivationButton href={practiceHref} size="lg" variant="glow">
              Start mock interview
              <ArrowRight className="ml-2 h-4 w-4" />
            </PublicActivationButton>
          }
        />
      </article>
    </MarketingPage>
  );
}
