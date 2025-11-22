"use client";

import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/sections/header";
import { ExploreHero } from "@/components/explore/hero";
import { ConversionCTA } from "@/components/explore/conversion-cta";
import { PublicQuestionCard } from "@/components/explore/public-question-card";
import { QuestionSignInModal } from "@/components/explore/question-signin-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterPopover } from "@/components/question-bank/filter-popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Lock, Calendar, Building2, SearchX } from "lucide-react";
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

const QUESTION_TYPE_COLORS = {
  Behavioral:
    "bg-blue-500/8 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "Product Sense":
    "bg-purple-500/8 text-purple-600 dark:text-purple-400 border-purple-500/20",
  Execution:
    "bg-green-500/8 text-green-600 dark:text-green-400 border-green-500/20",
  "Product Strategy":
    "bg-orange-500/8 text-orange-600 dark:text-orange-400 border-orange-500/20",
};

export default function ExplorePage() {
  const posthog = usePostHog();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedType, setSelectedType] = useState("All Types");
  const [sortBy, setSortBy] = useState<"recent" | "company" | "type">("recent");
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(
    null
  );

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
          // Map display name to API format
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

  // Filter and sort questions
  const filteredQuestions = useMemo(() => {
    return questions
      .filter((q) => {
        // Search filter (debounced)
        const matchesSearch =
          debouncedSearchQuery === "" ||
          q.questionText
            .toLowerCase()
            .includes(debouncedSearchQuery.toLowerCase()) ||
          q.company?.toLowerCase().includes(debouncedSearchQuery.toLowerCase());

        if (!matchesSearch) return false;

        // Type filter
        if (selectedType !== "All Types" && q.questionType !== selectedType) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "recent") {
          return (
            new Date(b.askedAt || 0).getTime() -
            new Date(a.askedAt || 0).getTime()
          );
        } else if (sortBy === "company") {
          return (a.company || "").localeCompare(b.company || "");
        } else {
          return a.questionType.localeCompare(b.questionType);
        }
      });
  }, [questions, debouncedSearchQuery, selectedType, sortBy]);

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

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedType("All Types");
    posthog?.capture("explore_filters_cleared");
  };

  const handleSignIn = (question: Question) => {
    setSelectedQuestion(question);
    setSignInModalOpen(true);

    // Track conversion attempt
    posthog?.capture("explore_sign_in_prompted", {
      question_id: question.id,
      question_type: question.questionType,
      company: question.company,
    });
  };

  // Insert conversion CTAs every 15 questions
  const questionsWithCTAs = useMemo(() => {
    const result: Array<Question | { type: "cta"; index: number }> = [];
    filteredQuestions.forEach((question, index) => {
      result.push(question);
      if ((index + 1) % 15 === 0 && index < filteredQuestions.length - 1) {
        result.push({ type: "cta", index });
      }
    });
    return result;
  }, [filteredQuestions]);

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">
              Loading questions...
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-background">
        {/* Hero Section */}
        <ExploreHero />

        {/* Questions Content */}
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 pb-16">
          {/* Search & Filter Toolbar */}
          <div className="mb-6 rounded-lg border border-border bg-card shadow-sm p-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search questions by text or company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
                  aria-label="Search questions"
                />
              </div>
              <FilterPopover
                selectedType={selectedType}
                onSelectType={setSelectedType}
                sortBy={sortBy}
                onSortChange={setSortBy}
                onClearAll={clearAllFilters}
              />
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              Showing {filteredQuestions.length} questions
            </div>
          </div>

          {filteredQuestions.length === 0 ? (
            /* Empty State */
            <div className="rounded-lg border border-border overflow-hidden bg-card">
              <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
                <div className="mb-6 p-6 rounded-2xl bg-muted/30 border border-border">
                  <SearchX className="w-12 h-12 text-muted-foreground opacity-50" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  No questions match your search
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mb-8">
                  Try different keywords or browse all questions
                </p>
                <Button variant="outline" onClick={clearAllFilters}>
                  Clear filters
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Simple Card Grid for All Screen Sizes */}
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {questionsWithCTAs.map((item, index) => {
                  if ("type" in item && item.type === "cta") {
                    return (
                      <div key={`cta-${index}`} className="md:col-span-2 lg:col-span-3">
                        <ConversionCTA index={index} />
                      </div>
                    );
                  }

                  const question = item as Question;
                  return (
                    <PublicQuestionCard
                      key={question.id}
                      question={question}
                      onSignIn={() => handleSignIn(question)}
                      badgeClassName={
                        QUESTION_TYPE_COLORS[
                          question.questionType as keyof typeof QUESTION_TYPE_COLORS
                        ]
                      }
                      index={index}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

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
        {filteredQuestions.length} questions found
      </div>
    </>
  );
}
