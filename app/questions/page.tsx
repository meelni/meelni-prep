"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/providers/auth-provider";
import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterPill } from "@/components/ui/filter-pill";
import { SearchAutocomplete } from "@/components/question-bank/search-autocomplete";
import { HoverPreview } from "@/components/question-bank/hover-preview";
import { BulkActionToolbar } from "@/components/question-bank/bulk-action-toolbar";
import { EmptyState } from "@/components/question-bank/empty-state";
import { QuestionCard } from "@/components/question-bank/question-card";
import { MobileFilterDrawer } from "@/components/question-bank/mobile-filter-drawer";
import {
  Search,
  Filter,
  ArrowUpDown,
  Play,
  Calendar,
  Building2,
  Tag,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useSessions } from "@/lib/api/queries";
import { useDebounce } from "@/lib/hooks/use-debounce";

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
  Behavioral: "bg-blue-500/8 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "Product Sense": "bg-purple-500/8 text-purple-600 dark:text-purple-400 border-purple-500/20",
  Execution: "bg-green-500/8 text-green-600 dark:text-green-400 border-green-500/20",
  "Product Strategy": "bg-orange-500/8 text-orange-600 dark:text-orange-400 border-orange-500/20",
};

const QUESTION_TYPES = [
  "All Types",
  "Behavioral",
  "Product Sense",
  "Execution",
  "Product Strategy",
];

const FAANG_COMPANIES = ["Meta", "Amazon", "Apple", "Netflix", "Google"];

type QuickFilter = "recent" | "faang" | "weak-areas";

export default function QuestionBankPage() {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedType, setSelectedType] = useState("All Types");
  const [sortBy, setSortBy] = useState<"recent" | "company" | "type">("recent");
  const [activeSection, setActiveSection] = useState("questions");
  const [quickFilters, setQuickFilters] = useState<Set<QuickFilter>>(new Set());
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Fetch sessions for dashboard stats
  const { data: sessionsData } = useSessions(20);
  const stats = sessionsData?.stats || {
    totalSessions: 0,
    totalMinutes: 0,
    avgScore: 0,
  };

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/signin");
    }
  }, [authLoading, user, router]);

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

  // Toggle quick filter
  const toggleQuickFilter = (filter: QuickFilter) => {
    setQuickFilters((prev) => {
      const newFilters = new Set(prev);
      if (newFilters.has(filter)) {
        newFilters.delete(filter);
      } else {
        newFilters.add(filter);
      }
      return newFilters;
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedType("All Types");
    setQuickFilters(new Set());
  };

  // Filter and sort questions
  const filteredQuestions = useMemo(() => {
    return questions
      .filter((q) => {
        // Search filter (debounced)
        const matchesSearch =
          debouncedSearchQuery === "" ||
          q.questionText.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          q.company?.toLowerCase().includes(debouncedSearchQuery.toLowerCase());

        if (!matchesSearch) return false;

        // Quick filters
        if (quickFilters.size > 0) {
          // Recent questions (last 12 months)
          if (quickFilters.has("recent")) {
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            if (!q.askedAt || new Date(q.askedAt) < oneYearAgo) {
              return false;
            }
          }

          // FAANG companies
          if (quickFilters.has("faang")) {
            if (!q.company || !FAANG_COMPANIES.includes(q.company)) {
              return false;
            }
          }

          // Weak areas (placeholder - just filter out for now)
          if (quickFilters.has("weak-areas")) {
            // TODO: Implement based on user performance data
            return false;
          }
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
  }, [questions, debouncedSearchQuery, quickFilters, sortBy]);

  const handleTryQuestion = (questionId: string, questionType: string) => {
    // Map display question type to roundType
    const typeMap: Record<string, string> = {
      "Behavioral": "behavioral",
      "Product Sense": "product_sense",
      "Execution": "execution",
      "Product Strategy": "strategy",
    };

    const roundType = typeMap[questionType] || "product_sense";

    // Navigate directly to interview with question and smart defaults
    const params = new URLSearchParams({
      questionId,
      roundType,
      mode: "mock_interview",
      voice: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b", // Tessa voice
      speed: "1.0",
      emotion: "confident",
    });

    router.push(`/interview?${params.toString()}`);
  };

  // Bulk action handlers
  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestions((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(questionId)) {
        newSelection.delete(questionId);
      } else {
        newSelection.add(questionId);
      }
      return newSelection;
    });
  };

  const toggleSelectAll = () => {
    if (selectedQuestions.size === filteredQuestions.length) {
      setSelectedQuestions(new Set());
    } else {
      setSelectedQuestions(new Set(filteredQuestions.map((q) => q.id)));
    }
  };

  const handleBookmark = () => {
    // TODO: Implement bookmark functionality
    alert(`Bookmarked ${selectedQuestions.size} questions (placeholder)`);
  };

  const handleCreatePracticeSet = () => {
    // TODO: Implement practice set creation
    alert(`Creating practice set with ${selectedQuestions.size} questions (placeholder)`);
  };

  const handleDeselectAll = () => {
    setSelectedQuestions(new Set());
  };

  // Handle autocomplete select
  const handleAutocompleteSelect = (questionId?: string) => {
    if (questionId) {
      const question = questions.find((q) => q.id === questionId);
      if (question) {
        handleTryQuestion(question.id, question.questionType);
      }
    }
  };

  // Determine empty state type
  const getEmptyStateType = (): "no-search" | "no-filter" | "first-time" | null => {
    if (filteredQuestions.length > 0) return null;
    if (debouncedSearchQuery) return "no-search";
    if (quickFilters.size > 0 || selectedType !== "All Types") return "no-filter";
    if (questions.length === 0) return "first-time";
    return "no-filter";
  };

  const emptyStateType = getEmptyStateType();

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">
            Loading question bank...
          </p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout
      activeSection={activeSection}
      setActiveSection={setActiveSection}
      totalSessions={stats.totalSessions}
      totalMinutes={stats.totalMinutes}
      avgScore={stats.avgScore}
      user={user}
      onSignOut={handleSignOut}
    >
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-display font-bold text-foreground">
                  Question Bank
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {filteredQuestions.length} questions available
                </p>
              </div>
            </div>

            {/* Quick Filters - Desktop only */}
            <div className="mb-4 hidden md:block">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Quick Filters
                </span>
                <FilterPill
                  active={quickFilters.has("recent")}
                  onClick={() => toggleQuickFilter("recent")}
                  aria-label="Filter by recent questions"
                >
                  Recent Questions
                </FilterPill>
                <FilterPill
                  active={quickFilters.has("faang")}
                  onClick={() => toggleQuickFilter("faang")}
                  aria-label="Filter by FAANG companies"
                >
                  FAANG Companies
                </FilterPill>
                <FilterPill
                  active={quickFilters.has("weak-areas")}
                  onClick={() => toggleQuickFilter("weak-areas")}
                  aria-label="Filter by weak areas"
                  title="Coming soon - based on your performance data"
                >
                  My Weak Areas
                </FilterPill>
                {(quickFilters.size > 0 || selectedType !== "All Types") && (
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-primary hover:underline ml-2"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search with Autocomplete */}
              <div className="flex-1 flex gap-2">
                <SearchAutocomplete
                  questions={questions}
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSelect={handleAutocompleteSelect}
                />

                {/* Mobile Filter Button */}
                <button
                  onClick={() => setIsFilterDrawerOpen(true)}
                  className="md:hidden px-4 py-2.5 bg-card border border-border rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-muted/50 transition-colors min-h-[44px]"
                  aria-label="Open filters"
                >
                  <Filter className="w-4 h-4" />
                  {(quickFilters.size > 0 || selectedType !== "All Types") && (
                    <span className="px-1.5 py-0.5 bg-primary text-primary-foreground rounded-full text-xs font-semibold min-w-[20px] text-center">
                      {quickFilters.size + (selectedType !== "All Types" ? 1 : 0)}
                    </span>
                  )}
                </button>
              </div>

              {/* Type Filter - Desktop only */}
              <div className="hidden md:flex gap-2 overflow-x-auto">
                {QUESTION_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                      selectedType === type
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Sort - Desktop only */}
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as "recent" | "company" | "type")
                }
                className="hidden md:block px-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="recent">Most Recent</option>
                <option value="company">Company</option>
                <option value="type">Type</option>
              </select>
            </div>
          </div>
        </div>

        {/* Questions Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {emptyStateType ? (
            <div className="rounded-lg border border-border overflow-hidden bg-card">
              <EmptyState
                type={emptyStateType}
                onClearFilters={clearAllFilters}
                onExploreProductSense={() => setSelectedType("Product Sense")}
                onBackToDashboard={() => router.push("/dashboard")}
                selectedType={selectedType}
              />
            </div>
          ) : (
            <>
              {/* Desktop Table View (≥768px) */}
              <div className="hidden md:block rounded-lg border border-border overflow-hidden bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-card/80 backdrop-blur-md border-b border-border">
                      <tr>
                        {/* Checkbox column */}
                        <th className="text-left px-6 py-3 w-12">
                          <input
                            type="checkbox"
                            checked={
                              selectedQuestions.size === filteredQuestions.length &&
                              filteredQuestions.length > 0
                            }
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
                            aria-label="Select all questions"
                          />
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Question
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Type
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Company
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Asked Date
                        </th>
                        <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQuestions.map((question, index) => {
                        const isSelected = selectedQuestions.has(question.id);
                        return (
                          <motion.tr
                            key={question.id}
                            initial={index < 20 ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={index < 20 ? { delay: index * 0.015 } : { duration: 0 }}
                            className={cn(
                              "border-b border-border last:border-b-0 transition-all duration-150 hover:bg-primary/3",
                              isSelected && "bg-primary/5 border-l-2 border-l-primary"
                            )}
                          >
                            {/* Checkbox */}
                            <td className="px-6 py-4">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleQuestionSelection(question.id)}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
                                aria-label={`Select question: ${question.questionText}`}
                                aria-checked={isSelected}
                              />
                            </td>

                            {/* Question with hover preview */}
                            <td className="px-6 py-4">
                              <HoverPreview
                                question={question}
                                badgeClassName={
                                  QUESTION_TYPE_COLORS[
                                    question.questionType as keyof typeof QUESTION_TYPE_COLORS
                                  ]
                                }
                              >
                                <p className="text-sm font-medium text-foreground line-clamp-2 transition-colors duration-150 cursor-help">
                                  {question.questionText}
                                </p>
                              </HoverPreview>
                            </td>

                            {/* Type */}
                            <td className="px-6 py-4">
                              <Badge
                                variant="subtle"
                                className={cn(
                                  QUESTION_TYPE_COLORS[
                                    question.questionType as keyof typeof QUESTION_TYPE_COLORS
                                  ]
                                )}
                              >
                                {question.questionType}
                              </Badge>
                            </td>

                            {/* Company */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Building2 className="w-4 h-4 opacity-60" />
                                <span>{question.company || "N/A"}</span>
                              </div>
                            </td>

                            {/* Date */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="w-4 h-4 opacity-60" />
                                <span>
                                  {question.askedAt
                                    ? new Date(question.askedAt).toLocaleDateString()
                                    : "N/A"}
                                </span>
                              </div>
                            </td>

                            {/* Action */}
                            <td className="px-6 py-4 text-right">
                              <Button
                                size="sm"
                                onClick={() => handleTryQuestion(question.id, question.questionType)}
                                className="gap-2"
                              >
                                <Play className="w-4 h-4" />
                                Try Question
                              </Button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card Grid (<768px) */}
              <div className="md:hidden grid gap-4 grid-cols-1 sm:grid-cols-2">
                {filteredQuestions.map((question, index) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    selected={selectedQuestions.has(question.id)}
                    onToggleSelect={() => toggleQuestionSelection(question.id)}
                    onTryQuestion={() => handleTryQuestion(question.id, question.questionType)}
                    badgeClassName={
                      QUESTION_TYPE_COLORS[
                        question.questionType as keyof typeof QUESTION_TYPE_COLORS
                      ]
                    }
                    index={index}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={selectedQuestions.size}
        onBookmark={handleBookmark}
        onCreatePracticeSet={handleCreatePracticeSet}
        onDeselectAll={handleDeselectAll}
      />

      {/* Mobile Filter Drawer */}
      <MobileFilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        quickFilters={quickFilters}
        onToggleQuickFilter={toggleQuickFilter}
        selectedType={selectedType}
        onSelectType={setSelectedType}
        onClearAll={clearAllFilters}
      />

      {/* Live region for accessibility */}
      <div role="status" aria-live="polite" className="sr-only">
        {filteredQuestions.length} questions found
        {selectedQuestions.size > 0 && `, ${selectedQuestions.size} selected`}
      </div>
    </DashboardLayout>
  );
}
