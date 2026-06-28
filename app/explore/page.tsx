"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/sections/header";
import { QuestionSignInModal } from "@/components/explore/question-signin-modal";
import { ExploreStructuredData } from "@/components/explore/structured-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowRight, ChevronLeft, ChevronRight, Home, ChevronRight as BreadcrumbArrow } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { usePostHog } from "posthog-js/react";

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
    return diffInDays === 0 ? "Today" : diffInDays === 1 ? "Yesterday" : `${diffInDays} days ago`;
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
  const router = useRouter();
  const posthog = usePostHog();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedType, setSelectedType] = useState("All Types");
  const [currentPage, setCurrentPage] = useState(1);
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);

  // Track page view
  useEffect(() => {
    posthog?.capture("explore_page_viewed", {
      total_questions: questions.length,
    });
  }, [posthog, questions.length]);

  // Fetch questions
  useEffect(() => {
    async function fetchQuestions() {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          limit: "500",
          activeOnly: "true",
        });

        if (selectedType !== "All Types") {
          const typeMap: Record<string, string> = {
            Behavioral: "behavioral",
            "Product Sense": "product_sense",
            Execution: "execution",
            "Product Strategy": "strategy",
          };
          params.append("type", typeMap[selectedType]);
        }

        const res = await fetch(`/api/questions?${params.toString()}`);
        const data = await res.json();
        setQuestions(data.questions || []);
      } catch (error) {
        console.error("Error fetching questions:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchQuestions();
  }, [selectedType]);

  // Filter questions
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchesSearch =
        debouncedSearchQuery === "" ||
        q.questionText.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        q.company?.toLowerCase().includes(debouncedSearchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedType !== "All Types" && q.questionType !== selectedType) {
        return false;
      }

      return true;
    });
  }, [questions, debouncedSearchQuery, selectedType]);

  // Paginate questions
  const totalPages = Math.ceil(filteredQuestions.length / QUESTIONS_PER_PAGE);
  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * QUESTIONS_PER_PAGE;
    const endIndex = startIndex + QUESTIONS_PER_PAGE;
    return filteredQuestions.slice(startIndex, endIndex);
  }, [filteredQuestions, currentPage, totalPages]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, selectedType]);

  // Track search queries
  useEffect(() => {
    if (debouncedSearchQuery) {
      posthog?.capture("explore_search", {
        query: debouncedSearchQuery,
        results_count: filteredQuestions.length,
      });
    }
  }, [debouncedSearchQuery, filteredQuestions.length, posthog]);

  // Track filter changes
  useEffect(() => {
    if (selectedType !== "All Types") {
      posthog?.capture("explore_filter_type", {
        filter_type: selectedType,
        results_count: filteredQuestions.length,
      });
    }
  }, [selectedType, filteredQuestions.length, posthog]);

  const handleQuestionClick = (question: Question) => {
    // Track click
    posthog?.capture("explore_question_clicked", {
      question_id: question.id,
      question_type: question.questionType,
      company: question.company,
      page: currentPage,
    });

    // Show sign-in modal
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
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading questions...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Structured Data for SEO & LLM Indexing */}
      <ExploreStructuredData
        questions={filteredQuestions}
        currentPage={currentPage}
        totalPages={totalPages}
        totalQuestions={questions.length}
      />

      <Header />

      <main className="min-h-screen bg-background">
        {/* Breadcrumb Navigation - SEO & UX */}
        <nav aria-label="Breadcrumb" className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
          <ol className="flex items-center gap-2 text-sm text-muted-foreground">
            <li>
              <Link
                href="/"
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                aria-label="Home"
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </Link>
            </li>
            <li aria-hidden="true">
              <BreadcrumbArrow className="w-4 h-4" />
            </li>
            <li aria-current="page">
              <span className="text-foreground font-medium">Explore Questions</span>
            </li>
          </ol>
        </nav>

        {/* Page Header - H1 for SEO */}
        <header className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Product Manager Interview Questions
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Browse {questions.length.toLocaleString()}+ real interview questions from Google, Meta, Amazon,
            and 100+ top companies. Practice Product Sense, Behavioral, Execution, and Strategy questions
            with AI coaching.
          </p>
        </header>

        {/* Sticky Search & Filter Bar */}
        <div className="sticky top-[60px] z-40">
          {/* Solid background with backdrop blur */}
          <div className="bg-background/95 backdrop-blur-xl">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Search questions or companies..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Type Filter */}
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-4 py-2.5 bg-background border border-border rounded-lg text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                >
                  <option>All Types</option>
                  <option>Product Sense</option>
                  <option>Execution</option>
                  <option>Behavioral</option>
                  <option>Product Strategy</option>
                </select>
              </div>
            </div>
          </div>
          {/* Gradient fade at bottom */}
          <div className="h-8 bg-gradient-to-b from-background/80 via-background/40 to-transparent pointer-events-none" />
        </div>

        {/* Questions Feed - Semantic Section */}
        <section
          className="max-w-4xl mx-auto px-4 sm:px-6 pt-0 pb-12"
          aria-label="Interview questions list"
        >
          {paginatedQuestions.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-lg font-medium text-foreground mb-2">
                No questions found
              </p>
              <p className="text-sm text-muted-foreground">
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
                    "hover:bg-muted/20 -mx-4 px-4 rounded-lg",
                    index !== paginatedQuestions.length - 1 && "border-b border-border/40"
                  )}
                  role="listitem"
                  itemScope
                  itemType="https://schema.org/Question"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleQuestionClick(question)}
                    className="h-auto w-full flex-col items-stretch justify-start rounded-lg p-0 text-left hover:bg-transparent hover:text-foreground"
                    aria-label={`Practice question: ${question.questionText}`}
                  >
                    {/* Metadata */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span
                        className="text-xs font-medium text-foreground"
                        itemProp="author"
                        itemScope
                        itemType="https://schema.org/Organization"
                      >
                        <span itemProp="name">{formatCompanyName(question.company)}</span>
                      </span>
                      <span className="text-xs text-muted-foreground" aria-hidden="true">•</span>
                      <span className="text-xs text-muted-foreground font-normal" itemProp="about">
                        {question.questionType}
                      </span>
                      {question.askedAt && (
                        <>
                          <span className="text-xs text-muted-foreground" aria-hidden="true">•</span>
                          <time
                            className="text-xs text-muted-foreground font-normal"
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
                        className="text-lg font-semibold text-foreground leading-[1.4] group-hover:text-primary transition-colors"
                        itemProp="name"
                      >
                        {formatQuestionText(question.questionText)}
                      </h2>
                      <div className="flex-shrink-0 flex items-center gap-2 mt-0.5">
                        <ArrowRight
                          className="w-5 h-5 text-primary opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1"
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
            <div className="flex items-center justify-between mt-12 pt-8 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
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
                <ChevronRight className="w-4 h-4" />
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
        Showing {paginatedQuestions.length} of {filteredQuestions.length} questions
      </div>
    </>
  );
}
