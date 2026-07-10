"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/sections/header";
import { QuestionSignInModal } from "@/components/explore/question-signin-modal";
import { ExploreStructuredData } from "@/components/explore/structured-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Home,
  ChevronRight as BreadcrumbArrow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { usePostHog } from "posthog-js/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/providers/auth-provider";
import { buildInternalRequestDestination } from "@/lib/auth/safe-redirect";
import { buildQuestionInterviewHref } from "@/lib/navigation/interview-launch";

interface Question {
  id: string;
  company: string | null;
  questionText: string;
  questionType: string;
  askedAt: Date | null;
  isActive: boolean;
  createdAt: Date | null;
}

// Format relative time for question recency
function formatRelativeTime(date: Date | null): string {
  if (!date) return "";

  const now = new Date();
  const askedDate = new Date(date);
  const diffInMs = now.getTime() - askedDate.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays < 7) {
    return diffInDays === 0
      ? "Today"
      : diffInDays === 1
        ? "Yesterday"
        : `${diffInDays} days ago`;
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  } else if (diffInDays < 365) {
    const months = Math.floor(diffInDays / 30);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  } else {
    return askedDate.getFullYear().toString();
  }
}

// Capitalize company name
function formatCompanyName(company: string | null): string {
  if (!company) return "Unknown";
  return company.charAt(0).toUpperCase() + company.slice(1);
}

// Capitalize first letter of question text
function formatQuestionText(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const QUESTIONS_PER_PAGE = 20;

export default function ExplorePage() {
  const posthog = usePostHog();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedType, setSelectedType] = useState("All Types");
  const [currentPage, setCurrentPage] = useState(1);
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(
    null
  );

  // Track page view
  useEffect(() => {
    posthog?.capture("explore_page_viewed", {
      total_questions: totalQuestions,
    });
  }, [posthog, totalQuestions]);

  // Fetch questions
  useEffect(() => {
    const controller = new AbortController();

    async function fetchQuestions() {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          limit: String(QUESTIONS_PER_PAGE),
          offset: String((currentPage - 1) * QUESTIONS_PER_PAGE),
          activeOnly: "true",
        });

        if (debouncedSearchQuery) {
          params.set("search", debouncedSearchQuery);
        }

        if (selectedType !== "All Types") {
          const typeMap: Record<string, string> = {
            Behavioral: "behavioral",
            "Product Sense": "product_sense",
            Execution: "execution",
            Strategy: "strategy",
          };
          params.append("type", typeMap[selectedType]);
        }

        const res = await fetch(`/api/questions?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Question request failed with ${res.status}`);
        }
        const data = await res.json();
        setQuestions(data.questions || []);
        setTotalQuestions(data.pagination?.total || 0);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Error fetching questions:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchQuestions();
    return () => controller.abort();
  }, [currentPage, debouncedSearchQuery, selectedType]);

  // Paginate questions
  const totalPages = Math.ceil(totalQuestions / QUESTIONS_PER_PAGE);
  const paginatedQuestions = questions;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, selectedType]);

  // Track search queries
  useEffect(() => {
    if (debouncedSearchQuery) {
      posthog?.capture("explore_search", {
        query: debouncedSearchQuery,
        results_count: totalQuestions,
      });
    }
  }, [debouncedSearchQuery, posthog, totalQuestions]);

  // Track filter changes
  useEffect(() => {
    if (selectedType !== "All Types") {
      posthog?.capture("explore_filter_type", {
        filter_type: selectedType,
        results_count: totalQuestions,
      });
    }
  }, [selectedType, posthog, totalQuestions]);

  const handleQuestionClick = (question: Question) => {
    // Track click
    posthog?.capture("explore_question_clicked", {
      question_id: question.id,
      question_type: question.questionType,
      company: question.company,
      page: currentPage,
    });

    if (authLoading) {
      return;
    }

    if (user) {
      router.push(
        buildQuestionInterviewHref(
          question.id,
          buildInternalRequestDestination(pathname, searchParams.toString())
        )
      );
      return;
    }

    // Show sign-in modal for signed-out candidates.
    setSelectedQuestion(question);
    setSignInModalOpen(true);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
    posthog?.capture("explore_page_changed", {
      page,
      total_pages: totalPages,
    });
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="bg-background flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
            <p className="text-muted-foreground text-sm">
              Loading questions...
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Structured Data for SEO & LLM Indexing */}
      <ExploreStructuredData
        questions={questions}
        currentPage={currentPage}
        totalPages={totalPages}
        totalQuestions={totalQuestions}
      />

      <Header />

      <main className="bg-background min-h-screen">
        {/* Breadcrumb Navigation - SEO & UX */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto max-w-4xl px-4 pt-6 sm:px-6"
        >
          <ol className="text-muted-foreground flex items-center gap-2 text-sm">
            <li>
              <Link
                href="/"
                className="hover:text-foreground flex items-center gap-1.5 transition-colors"
                aria-label="Home"
              >
                <Home className="h-4 w-4" />
                <span>Home</span>
              </Link>
            </li>
            <li aria-hidden="true">
              <BreadcrumbArrow className="h-4 w-4" />
            </li>
            <li aria-current="page">
              <span className="text-foreground font-medium">
                Explore Questions
              </span>
            </li>
          </ol>
        </nav>

        {/* Page Header - H1 for SEO */}
        <header className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <h1 className="text-foreground mb-3 text-3xl font-bold sm:text-4xl">
            Product Manager Interview Questions
          </h1>
          <p className="text-muted-foreground max-w-3xl text-lg">
            Browse {totalQuestions.toLocaleString()} real interview questions
            from Google, Meta, Amazon, and 100+ top companies. Practice Product
            Sense, Behavioral, Execution, and Strategy questions with AI
            coaching.
          </p>
        </header>

        {/* Sticky Search & Filter Bar */}
        <div className="top-header sticky z-40">
          {/* Solid background with backdrop blur */}
          <div className="bg-background/95 backdrop-blur-xl">
            <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    type="text"
                    placeholder="Search questions or companies..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Type Filter */}
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-full rounded-lg font-medium sm:w-[180px]">
                    <SelectValue placeholder="Question type" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="All Types">All Types</SelectItem>
                    <SelectItem value="Product Sense">Product Sense</SelectItem>
                    <SelectItem value="Execution">Execution</SelectItem>
                    <SelectItem value="Behavioral">Behavioral</SelectItem>
                    <SelectItem value="Strategy">Strategy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          {/* Gradient fade at bottom */}
          <div className="from-background/80 via-background/40 pointer-events-none h-8 bg-gradient-to-b to-transparent" />
        </div>

        {/* Questions Feed - Semantic Section */}
        <section
          className="mx-auto max-w-4xl px-4 pt-0 pb-12 sm:px-6"
          aria-label="Interview questions list"
        >
          {paginatedQuestions.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-foreground mb-2 text-lg font-medium">
                No questions found
              </p>
              <p className="text-muted-foreground text-sm">
                Try adjusting your search or filters
              </p>
            </div>
          ) : (
            <div className="space-y-0" role="list">
              {paginatedQuestions.map((question, index) => (
                <article
                  key={question.id}
                  className={cn(
                    "group py-6 transition-all duration-200",
                    "hover:bg-muted/20 -mx-4 rounded-lg px-4",
                    index !== paginatedQuestions.length - 1 &&
                      "border-border/40 border-b"
                  )}
                  role="listitem"
                  itemScope
                  itemType="https://schema.org/Question"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleQuestionClick(question)}
                    className="hover:text-foreground h-auto w-full flex-col items-stretch justify-start rounded-lg p-0 text-left hover:bg-transparent"
                    aria-label={`Practice question: ${question.questionText}`}
                  >
                    {/* Metadata */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className="text-foreground text-xs font-medium"
                        itemProp="author"
                        itemScope
                        itemType="https://schema.org/Organization"
                      >
                        <span itemProp="name">
                          {formatCompanyName(question.company)}
                        </span>
                      </span>
                      <span
                        className="text-muted-foreground text-xs"
                        aria-hidden="true"
                      >
                        •
                      </span>
                      <span
                        className="text-muted-foreground text-xs font-normal"
                        itemProp="about"
                      >
                        {question.questionType}
                      </span>
                      {question.askedAt && (
                        <>
                          <span
                            className="text-muted-foreground text-xs"
                            aria-hidden="true"
                          >
                            •
                          </span>
                          <time
                            className="text-muted-foreground text-xs font-normal"
                            dateTime={new Date(question.askedAt).toISOString()}
                            itemProp="dateCreated"
                          >
                            {formatRelativeTime(question.askedAt)}
                          </time>
                        </>
                      )}
                    </div>

                    {/* Question Text */}
                    <div className="flex items-start justify-between gap-4">
                      <h2
                        className="text-foreground group-hover:text-primary text-lg leading-[1.4] font-semibold transition-colors"
                        itemProp="name"
                      >
                        {formatQuestionText(question.questionText)}
                      </h2>
                      <div className="mt-0.5 flex flex-shrink-0 items-center gap-2">
                        <ArrowRight
                          className="text-primary h-5 w-5 opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </Button>
                </article>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-border/40 mt-12 flex items-center justify-between border-t pt-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  Page {currentPage} of {totalPages}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="gap-2"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </section>
      </main>

      {/* Sign-In Modal */}
      {selectedQuestion && (
        <QuestionSignInModal
          isOpen={signInModalOpen}
          onClose={() => setSignInModalOpen(false)}
          questionText={selectedQuestion.questionText}
          questionId={selectedQuestion.id}
        />
      )}

      {/* Live region for accessibility */}
      <div role="status" aria-live="polite" className="sr-only">
        Showing {paginatedQuestions.length} of {totalQuestions} questions
      </div>
    </>
  );
}
