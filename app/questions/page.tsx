"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/providers/auth-provider";
import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterPopover } from "@/components/question-bank/filter-popover";
import { SearchAutocomplete } from "@/components/question-bank/search-autocomplete";
import { HoverPreview } from "@/components/question-bank/hover-preview";
import { BulkActionToolbar } from "@/components/question-bank/bulk-action-toolbar";
import { EmptyState } from "@/components/question-bank/empty-state";
import { QuestionCard } from "@/components/question-bank/question-card";
import { MobileFilterDrawer } from "@/components/question-bank/mobile-filter-drawer";
import {
  Play,
  Calendar,
  Building2,
} from "lucide-react";
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
        {/* Simplified Search & Filter Bar */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search - Full width on left */}
              <div className="flex-1">
                <SearchAutocomplete
                  questions={questions}
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSelect={handleAutocompleteSelect}
                />
              </div>

              {/* Desktop Filters Button */}
              <div className="hidden sm:block">
                <FilterPopover
                  quickFilters={quickFilters}
                  onToggleQuickFilter={toggleQuickFilter}
                  selectedType={selectedType}
                  onSelectType={setSelectedType}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onClearAll={clearAllFilters}
                />
              </div>

              {/* Mobile Filter Button */}
              <button
                onClick={() => setIsFilterDrawerOpen(true)}
                className="sm:hidden px-4 py-2.5 bg-card border border-border rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-muted/50 transition-colors min-h-[44px]"
                aria-label="Open filters"
              >
                <span>Filters</span>
                {(quickFilters.size > 0 || selectedType !== "All Types") && (
                  <Badge
                    variant="default"
                    className="h-5 min-w-5 px-1.5 text-xs rounded-full"
                  >
                    {quickFilters.size + (selectedType !== "All Types" ? 1 : 0)}
                  </Badge>
                )}
              </button>
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
                <div className="overflow-x-auto max-h-[calc(100vh-16rem)]">
                  <Table className="border-separate border-spacing-0 [&_td]:border-border [&_th]:border-b [&_th]:border-border [&_tr]:border-none [&_tr:not(:last-child)_td]:border-b">
                    <TableHeader className="sticky top-0 z-10 bg-card/90 backdrop-blur-xs">
                      <TableRow className="hover:bg-transparent">
                        {/* Checkbox column */}
                        <TableHead className="w-12">
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
                        </TableHead>
                        <TableHead>Question</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Asked Date</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredQuestions.map((question, index) => {
                        const isSelected = selectedQuestions.has(question.id);
                        return (
                          <TableRow
                            key={question.id}
                            className={cn(
                              "transition-all duration-150 hover:bg-primary/3",
                              isSelected && "bg-primary/5 border-l-2 border-l-primary"
                            )}
                            style={{
                              opacity: index < 20 ? 0 : 1,
                              animation: index < 20 ? `fadeInUp 0.3s ease-out ${index * 0.015}s forwards` : 'none',
                            }}
                          >
                            {/* Checkbox */}
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleQuestionSelection(question.id)}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
                                aria-label={`Select question: ${question.questionText}`}
                                aria-checked={isSelected}
                              />
                            </TableCell>

                            {/* Question with hover preview */}
                            <TableCell>
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
                            </TableCell>

                            {/* Type */}
                            <TableCell>
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
                            </TableCell>

                            {/* Company */}
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Building2 className="w-4 h-4 opacity-60" />
                                <span>{question.company || "N/A"}</span>
                              </div>
                            </TableCell>

                            {/* Date */}
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="w-4 h-4 opacity-60" />
                                <span>
                                  {question.askedAt
                                    ? new Date(question.askedAt).toLocaleDateString()
                                    : "N/A"}
                                </span>
                              </div>
                            </TableCell>

                            {/* Action */}
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                onClick={() => handleTryQuestion(question.id, question.questionType)}
                                className="gap-2"
                              >
                                <Play className="w-4 h-4" />
                                Try Question
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
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
