"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
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
import { BulkActionToolbar } from "@/components/question-bank/bulk-action-toolbar";
import { EmptyState } from "@/components/question-bank/empty-state";
import { QuestionCard } from "@/components/question-bank/question-card";
import { MobileFilterDrawer } from "@/components/question-bank/mobile-filter-drawer";
import {
  Play,
  Calendar,
  Building2,
  Filter,
  Search,
  Bookmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

export const QuestionsSection = memo(function QuestionsSection() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedType, setSelectedType] = useState("All Types");
  const [sortBy, setSortBy] = useState<"recent" | "company" | "type">("recent");
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [bookmarkedQuestionIds, setBookmarkedQuestionIds] = useState<Set<string>>(new Set());
  const [showOnlyBookmarked, setShowOnlyBookmarked] = useState(false);

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

  // Fetch bookmarked question IDs
  useEffect(() => {
    async function fetchBookmarks() {
      try {
        const res = await fetch("/api/questions/bookmark");
        const data = await res.json();
        setBookmarkedQuestionIds(new Set(data.questionIds || []));
      } catch (error) {
        console.error("Error fetching bookmarks:", error);
      }
    }

    fetchBookmarks();
  }, []);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedType("All Types");
    setShowOnlyBookmarked(false);
  };

  // Filter and sort questions
  const filteredQuestions = useMemo(() => {
    return questions
      .filter((q) => {
        // Bookmark filter
        if (showOnlyBookmarked && !bookmarkedQuestionIds.has(q.id)) {
          return false;
        }

        // Search filter (debounced)
        const matchesSearch =
          debouncedSearchQuery === "" ||
          q.questionText.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
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
  }, [questions, debouncedSearchQuery, selectedType, sortBy, showOnlyBookmarked, bookmarkedQuestionIds]);

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

  const handleBookmark = async () => {
    if (selectedQuestions.size === 0) return;

    try {
      // Optimistic UI update
      const questionsToBookmark = Array.from(selectedQuestions);
      setBookmarkedQuestionIds(prev => {
        const updated = new Set(prev);
        questionsToBookmark.forEach(id => updated.add(id));
        return updated;
      });

      // Bookmark all selected questions
      await Promise.all(
        questionsToBookmark.map(questionId =>
          fetch("/api/questions/bookmark", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questionId }),
          })
        )
      );

      // Clear selection after bookmarking
      setSelectedQuestions(new Set());
    } catch (error) {
      console.error("Error bookmarking questions:", error);
      // Revert optimistic update on error
      const res = await fetch("/api/questions/bookmark");
      const data = await res.json();
      setBookmarkedQuestionIds(new Set(data.questionIds || []));
    }
  };

  const toggleBookmark = async (questionId: string) => {
    const isBookmarked = bookmarkedQuestionIds.has(questionId);

    // Optimistic UI update
    setBookmarkedQuestionIds(prev => {
      const updated = new Set(prev);
      if (isBookmarked) {
        updated.delete(questionId);
      } else {
        updated.add(questionId);
      }
      return updated;
    });

    try {
      if (isBookmarked) {
        // Remove bookmark
        await fetch(`/api/questions/bookmark?questionId=${questionId}`, {
          method: "DELETE",
        });
      } else {
        // Add bookmark
        await fetch("/api/questions/bookmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId }),
        });
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      // Revert optimistic update on error
      setBookmarkedQuestionIds(prev => {
        const updated = new Set(prev);
        if (isBookmarked) {
          updated.add(questionId);
        } else {
          updated.delete(questionId);
        }
        return updated;
      });
    }
  };

  const handleCreatePracticeSet = () => {
    // TODO: Implement practice set creation
    alert(`Creating practice set with ${selectedQuestions.size} questions (placeholder)`);
  };

  const handleDeselectAll = () => {
    setSelectedQuestions(new Set());
  };

  // Determine empty state type
  const getEmptyStateType = (): "no-search" | "no-filter" | "first-time" | "no-bookmarks" | null => {
    if (filteredQuestions.length > 0) return null;
    if (showOnlyBookmarked && bookmarkedQuestionIds.size === 0) return "no-bookmarks";
    if (debouncedSearchQuery) return "no-search";
    if (selectedType !== "All Types") return "no-filter";
    if (questions.length === 0) return "first-time";
    return "no-filter";
  };

  const emptyStateType = getEmptyStateType();

  // Handler to practice with bookmarked questions
  const handlePracticeWithBookmarked = () => {
    if (bookmarkedQuestionIds.size === 0) return;

    // Navigate to interview with a random bookmarked question
    const bookmarkedQuestions = questions.filter(q => bookmarkedQuestionIds.has(q.id));
    if (bookmarkedQuestions.length > 0) {
      const randomQuestion = bookmarkedQuestions[Math.floor(Math.random() * bookmarkedQuestions.length)];
      handleTryQuestion(randomQuestion.id, randomQuestion.questionType);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-display font-light text-foreground">Question Bank</h2>
        <p className="text-muted-foreground font-sans">
          Browse and practice with real interview questions from top companies.
        </p>
      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg">
          <button
            onClick={() => setShowOnlyBookmarked(false)}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
              !showOnlyBookmarked
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            All Questions
          </button>
          <button
            onClick={() => setShowOnlyBookmarked(true)}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2",
              showOnlyBookmarked
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Bookmark className={cn("w-4 h-4", showOnlyBookmarked && "fill-current")} />
            Saved
            {bookmarkedQuestionIds.size > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-xs rounded-full">
                {bookmarkedQuestionIds.size}
              </Badge>
            )}
          </button>
        </div>

        {showOnlyBookmarked && bookmarkedQuestionIds.size > 0 && (
          <Button onClick={handlePracticeWithBookmarked} className="gap-2">
            <Play className="w-4 h-4" />
            Practice with these
          </Button>
        )}
      </div>

      {/* Questions Content */}
      <div>
        {emptyStateType ? (
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            <EmptyState
              type={emptyStateType}
              onClearFilters={clearAllFilters}
              onExploreProductSense={
                emptyStateType === "no-bookmarks"
                  ? () => setShowOnlyBookmarked(false)
                  : () => setSelectedType("Product Sense")
              }
              onBackToDashboard={() => router.push("/dashboard")}
              selectedType={selectedType}
            />
          </div>
        ) : (
          <>
            {/* Desktop Table View (≥768px) */}
            <div className="hidden md:block rounded-lg border border-border overflow-hidden bg-card shadow-sm">
              {/* Integrated Search/Filter Toolbar */}
              <div className="px-6 py-4 border-b border-border/50 bg-card/40 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search questions by text or company..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
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
              </div>

              {/* Table with Sticky Header */}
              <div className="relative overflow-x-auto max-h-[calc(100vh-12rem)] scroll-smooth">
                {/* Bottom fade gradient */}
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent z-10" />

                <Table className="border-separate border-spacing-0">
                  <TableHeader className="sticky top-0 z-20 bg-gradient-to-b from-card via-card/98 to-card/95 backdrop-blur-md border-b border-border/60 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
                    <TableRow className="hover:bg-transparent">
                      {/* Checkbox column */}
                      <TableHead className="w-12 h-11 px-4">
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
                      <TableHead className="h-11 px-4">Question</TableHead>
                      <TableHead className="h-11 px-4">Type</TableHead>
                      <TableHead className="h-11 px-4">Company</TableHead>
                      <TableHead className="h-11 px-4">Asked Date</TableHead>
                      <TableHead className="h-11 px-4 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuestions.map((question, index) => {
                      const isSelected = selectedQuestions.has(question.id);
                      return (
                        <TableRow
                          key={question.id}
                          className={cn(
                            "transition-all duration-200 hover:bg-primary/[0.02]",
                            "border-b border-border/40 last:border-0",
                            isSelected && "bg-primary/[0.04] border-l-2 border-l-primary shadow-[inset_0_0_0_1px_rgb(var(--primary)/0.08)]"
                          )}
                          style={{
                            opacity: index < 20 ? 0 : 1,
                            animation: index < 20 ? `fadeInUp 0.3s ease-out ${index * 0.015}s forwards` : 'none',
                          }}
                        >
                          {/* Checkbox */}
                          <TableCell className="px-4 py-3.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleQuestionSelection(question.id)}
                              className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
                              aria-label={`Select question: ${question.questionText}`}
                              aria-checked={isSelected}
                            />
                          </TableCell>

                          {/* Question */}
                          <TableCell className="px-4 py-3.5">
                            <p className="text-sm font-medium text-foreground line-clamp-2">
                              {question.questionText}
                            </p>
                          </TableCell>

                          {/* Type */}
                          <TableCell className="px-4 py-3.5">
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
                          <TableCell className="px-4 py-3.5">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Building2 className="w-4 h-4 opacity-60" />
                              <span>{question.company || "N/A"}</span>
                            </div>
                          </TableCell>

                          {/* Date */}
                          <TableCell className="px-4 py-3.5">
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
                          <TableCell className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => toggleBookmark(question.id)}
                                className={cn(
                                  "p-2 rounded-lg transition-colors",
                                  bookmarkedQuestionIds.has(question.id)
                                    ? "text-primary bg-primary/10 hover:bg-primary/20"
                                    : "text-muted-foreground hover:text-primary hover:bg-primary/5"
                                )}
                                aria-label={bookmarkedQuestionIds.has(question.id) ? "Remove bookmark" : "Bookmark question"}
                              >
                                <Bookmark
                                  className={cn(
                                    "w-4 h-4",
                                    bookmarkedQuestionIds.has(question.id) && "fill-current"
                                  )}
                                />
                              </button>
                              <Button
                                size="sm"
                                onClick={() => handleTryQuestion(question.id, question.questionType)}
                                className="gap-2"
                              >
                                <Play className="w-4 h-4" />
                                Try Question
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Mobile Card Grid (<768px) */}
            <div className="md:hidden space-y-4">
              {/* Mobile Search/Filter Toolbar */}
              <div className="rounded-lg border border-border overflow-hidden bg-card shadow-sm">
                <div className="px-4 py-4 border-b border-border/50 bg-card/40">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search questions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150 min-h-[44px]"
                        aria-label="Search questions"
                      />
                    </div>
                    <button
                      onClick={() => setIsFilterDrawerOpen(true)}
                      className="px-4 py-2.5 bg-card border border-border rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-muted/50 transition-colors min-h-[44px]"
                      aria-label="Open filters"
                    >
                      <Filter className="w-4 h-4" />
                      {selectedType !== "All Types" && (
                        <Badge
                          variant="default"
                          className="h-5 min-w-5 px-1.5 text-xs rounded-full"
                        >
                          1
                        </Badge>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile Question Cards */}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
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
                    isBookmarked={bookmarkedQuestionIds.has(question.id)}
                    onToggleBookmark={() => toggleBookmark(question.id)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
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
        selectedType={selectedType}
        onSelectType={setSelectedType}
        onClearAll={clearAllFilters}
      />

      {/* Live region for accessibility */}
      <div role="status" aria-live="polite" className="sr-only">
        {filteredQuestions.length} questions found
        {selectedQuestions.size > 0 && `, ${selectedQuestions.size} selected`}
      </div>
    </div>
  );
});
