"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/sections/header";
import { QuestionSignInModal } from "@/components/explore/question-signin-modal";
import { ExploreStructuredData } from "@/components/explore/structured-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExploreQuestionListItem } from "@/components/explore/explore-question-list-item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Home,
  ChevronRight as BreadcrumbArrow,
} from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/providers/auth-provider";
import { analytics } from "@/lib/analytics/analytics-service";
import { buildInternalRequestDestination } from "@/lib/auth/safe-redirect";
import { buildQuestionInterviewHref } from "@/lib/navigation/interview-launch";
import { resolveQuestionEntryAction } from "@/lib/navigation/question-auth-entry";
import {
  getExploreResultsAnnouncement,
  resolvePublicQuestionAvailability,
  type QuestionLoadState,
} from "@/lib/explore/public-question-availability";

interface Question {
  id: string;
  company: string | null;
  questionText: string;
  questionType: string;
  askedAt: Date | null;
  isActive: boolean;
  createdAt: Date | null;
}

const QUESTIONS_PER_PAGE = 20;

export default function ExplorePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loadState, setLoadState] = useState<QuestionLoadState>("loading");
  const [requestVersion, setRequestVersion] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedType, setSelectedType] = useState("All Types");
  const [currentPage, setCurrentPage] = useState(1);
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(
    null
  );
  const questionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const publicAvailability = resolvePublicQuestionAvailability(
    loadState,
    totalQuestions
  );

  // Track page view
  useEffect(() => {
    if (loadState === "success") {
      analytics.track("explore_page_viewed", {
        total_questions: totalQuestions,
      });
    }
  }, [loadState, totalQuestions]);

  // Fetch questions
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function fetchQuestions() {
      try {
        setLoadState("loading");
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
        if (
          !Array.isArray(data.questions) ||
          !Number.isSafeInteger(data.pagination?.total) ||
          data.pagination.total < 0
        ) {
          throw new Error(
            "Question response did not match the public contract"
          );
        }
        if (!active) return;
        setQuestions(data.questions);
        setTotalQuestions(data.pagination.total);
        setLoadState("success");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Error fetching questions:", error);
        if (active) {
          setQuestions([]);
          setTotalQuestions(0);
          setLoadState("error");
        }
      }
    }

    fetchQuestions();
    return () => {
      active = false;
      controller.abort();
    };
  }, [currentPage, debouncedSearchQuery, selectedType, requestVersion]);

  // Paginate questions
  const totalPages = Math.ceil(totalQuestions / QUESTIONS_PER_PAGE);
  const paginatedQuestions = questions;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, selectedType]);

  // Track search queries
  useEffect(() => {
    if (debouncedSearchQuery && loadState === "success") {
      analytics.track("explore_search", {
        results_count: totalQuestions,
      });
    }
  }, [debouncedSearchQuery, loadState, totalQuestions]);

  // Track filter changes
  useEffect(() => {
    if (selectedType !== "All Types" && loadState === "success") {
      analytics.track("explore_filter_type", {
        filter_type: selectedType,
        results_count: totalQuestions,
      });
    }
  }, [loadState, selectedType, totalQuestions]);

  const handleQuestionClick = (
    question: Question,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    // Track click
    analytics.track("explore_question_clicked", {
      question_type: question.questionType,
      company: question.company,
      page: currentPage,
    });

    const entryAction = resolveQuestionEntryAction({
      authLoading,
      isAuthenticated: Boolean(user),
    });

    if (entryAction === "wait") {
      return;
    }

    if (entryAction === "launch") {
      router.push(
        buildQuestionInterviewHref(
          question.id,
          buildInternalRequestDestination(pathname, searchParams.toString())
        )
      );
      return;
    }

    // Show sign-in modal for signed-out candidates.
    questionTriggerRef.current = event.currentTarget;
    setSelectedQuestion(question);
    setSignInModalOpen(true);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
    analytics.track("explore_page_changed", {
      page,
      total_pages: totalPages,
    });
  };

  return (
    <>
      {/* Structured Data for SEO & LLM Indexing */}
      {publicAvailability.totalQuestions !== null && (
        <ExploreStructuredData
          questions={questions}
          currentPage={currentPage}
          totalPages={totalPages}
          totalQuestions={publicAvailability.totalQuestions}
        />
      )}

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
            {publicAvailability.totalQuestions !== null ? (
              <>
                Browse {publicAvailability.totalQuestions.toLocaleString()}{" "}
                available practice questions tagged by company and round type.
              </>
            ) : (
              <>Browse practice questions tagged by company and round type.</>
            )}{" "}
            Practice Product Sense, Behavioral, Execution, and Strategy answers
            out loud.
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
                    className="min-h-11 pl-10"
                    aria-label="Search interview questions or companies"
                    aria-controls="explore-question-list"
                  />
                </div>

                {/* Type Filter */}
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger
                    className="min-h-11 w-full rounded-lg font-medium sm:w-[180px]"
                    aria-label="Filter by question type"
                  >
                    <SelectValue placeholder="Question type" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem className="min-h-11" value="All Types">
                      All Types
                    </SelectItem>
                    <SelectItem className="min-h-11" value="Product Sense">
                      Product Sense
                    </SelectItem>
                    <SelectItem className="min-h-11" value="Execution">
                      Execution
                    </SelectItem>
                    <SelectItem className="min-h-11" value="Behavioral">
                      Behavioral
                    </SelectItem>
                    <SelectItem className="min-h-11" value="Strategy">
                      Strategy
                    </SelectItem>
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
          id="explore-question-list"
          className="mx-auto max-w-4xl px-4 pt-0 pb-12 sm:px-6"
          aria-label="Interview questions list"
          aria-busy={loadState === "loading"}
        >
          {loadState === "loading" ? (
            <div className="space-y-0" aria-label="Loading questions">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="border-border/40 border-b py-6 last:border-b-0"
                  aria-hidden="true"
                >
                  <div className="bg-muted mb-3 h-3 w-40 max-w-3/5 animate-pulse rounded" />
                  <div className="bg-muted h-5 w-full animate-pulse rounded" />
                  <div className="bg-muted mt-2 h-5 w-4/5 animate-pulse rounded" />
                  <div className="bg-muted mt-4 h-11 w-36 animate-pulse rounded" />
                </div>
              ))}
              <span className="sr-only" role="status">
                Loading questions
              </span>
            </div>
          ) : loadState === "error" ? (
            <div className="py-20 text-center" role="alert">
              <p className="text-foreground mb-2 text-lg font-medium">
                Questions are temporarily unavailable
              </p>
              <p className="text-muted-foreground mx-auto mb-6 max-w-md text-sm">
                We could not load the question bank. Check your connection and
                try again.
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setRequestVersion((version) => version + 1)}
              >
                Try again
              </Button>
            </div>
          ) : paginatedQuestions.length === 0 ? (
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
                <ExploreQuestionListItem
                  key={question.id}
                  question={question}
                  index={index}
                  isLast={index === paginatedQuestions.length - 1}
                  disabled={authLoading}
                  onPractice={(event) => handleQuestionClick(question, event)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <nav
              className="border-border/40 mt-12 grid grid-cols-2 items-center gap-3 border-t pt-8 sm:grid-cols-3"
              aria-label="Question pages"
            >
              <div className="col-span-2 row-start-1 text-center sm:col-span-1 sm:col-start-2">
                <span className="text-muted-foreground text-sm">
                  Page {currentPage} of {totalPages}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="col-start-1 row-start-2 min-h-11 w-full gap-2 sm:row-start-1 sm:w-fit sm:justify-self-start"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="col-start-2 row-start-2 min-h-11 w-full gap-2 sm:col-start-3 sm:row-start-1 sm:w-fit sm:justify-self-end"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
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
          returnFocusRef={questionTriggerRef}
        />
      )}

      {/* Live region for accessibility */}
      <div role="status" aria-live="polite" className="sr-only">
        {getExploreResultsAnnouncement({
          authLoading,
          availability: publicAvailability,
          visibleQuestions: paginatedQuestions.length,
        })}
      </div>
    </>
  );
}
