"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { PracticeSetDialog } from "@/components/question-bank/practice-set-dialog";
import { PracticeSetsList } from "@/components/question-bank/practice-sets-list";
import {
  DashboardSectionCard,
  DashboardSkeletonCard,
} from "@/components/dashboard/dashboard-surface";
import {
  Play,
  Calendar,
  Building2,
  Filter,
  Search,
  Bookmark,
  FolderPlus,
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
  Behavioral: "border-info/20 bg-info/10 text-info",
  "Product Sense": "border-primary/20 bg-primary/10 text-primary",
  Execution: "border-success/20 bg-success/10 text-success",
  "Product Strategy": "border-warning/20 bg-warning/10 text-warning",
};

export const QuestionsSection = memo(function QuestionsSection() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedType, setSelectedType] = useState("All Types");
  const [sortBy, setSortBy] = useState<"recent" | "company" | "type">("recent");
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(
    new Set()
  );
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [bookmarkedQuestionIds, setBookmarkedQuestionIds] = useState<
    Set<string>
  >(new Set());
  const [showOnlyBookmarked, setShowOnlyBookmarked] = useState(false);
  const [showPracticeSets, setShowPracticeSets] = useState(false);
  const [isPracticeSetDialogOpen, setIsPracticeSetDialogOpen] = useState(false);
  const [practiceSetRefreshTrigger, setPracticeSetRefreshTrigger] = useState(0);

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
  }, [
    questions,
    debouncedSearchQuery,
    selectedType,
    sortBy,
    showOnlyBookmarked,
    bookmarkedQuestionIds,
  ]);

  const handleTryQuestion = (questionId: string, questionType: string) => {
    // Map display question type to roundType
    const typeMap: Record<string, string> = {
      Behavioral: "behavioral",
      "Product Sense": "product_sense",
      Execution: "execution",
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
      setBookmarkedQuestionIds((prev) => {
        const updated = new Set(prev);
        questionsToBookmark.forEach((id) => updated.add(id));
        return updated;
      });

      // Bookmark all selected questions
      await Promise.all(
        questionsToBookmark.map((questionId) =>
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
    setBookmarkedQuestionIds((prev) => {
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
      setBookmarkedQuestionIds((prev) => {
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
    setIsPracticeSetDialogOpen(true);
  };

  const handlePracticeSetSuccess = () => {
    setPracticeSetRefreshTrigger((prev) => prev + 1);
    setSelectedQuestions(new Set());
  };

  const handleSelectPracticeSet = (setId: string) => {
    // TODO: Navigate to practice set detail view or start practice with set questions
    console.log("Selected practice set:", setId);
  };

  const handleDeselectAll = () => {
    setSelectedQuestions(new Set());
  };

  // Determine empty state type
  const getEmptyStateType = ():
    | "no-search"
    | "no-filter"
    | "first-time"
    | "no-bookmarks"
    | null => {
    if (filteredQuestions.length > 0) return null;
    if (showOnlyBookmarked && bookmarkedQuestionIds.size === 0)
      return "no-bookmarks";
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
    const bookmarkedQuestions = questions.filter((q) =>
      bookmarkedQuestionIds.has(q.id)
    );
    if (bookmarkedQuestions.length > 0) {
      const randomQuestion =
        bookmarkedQuestions[
          Math.floor(Math.random() * bookmarkedQuestions.length)
        ];
      handleTryQuestion(randomQuestion.id, randomQuestion.questionType);
    }
  };

  if (loading) {
    return (
      <DashboardSkeletonCard
        variant="chart"
        className="m-6 flex min-h-[400px] items-center justify-center"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-muted-foreground text-sm">
            Loading question bank...
          </p>
        </div>
      </DashboardSkeletonCard>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="font-display text-foreground text-2xl font-light">
          Question Bank
        </h2>
        <p className="text-muted-foreground font-sans">
          Browse and practice with real interview questions from top companies.
        </p>
      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-4">
        <div className="bg-muted/30 flex items-center gap-2 rounded-lg p-1">
          <Button
            type="button"
            variant={
              !showOnlyBookmarked && !showPracticeSets ? "secondary" : "ghost"
            }
            onClick={() => {
              setShowOnlyBookmarked(false);
              setShowPracticeSets(false);
            }}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-all duration-200",
              showOnlyBookmarked || showPracticeSets
                ? "text-muted-foreground hover:text-foreground"
                : "shadow-sm"
            )}
          >
            All Questions
          </Button>
          <Button
            type="button"
            variant={
              showOnlyBookmarked && !showPracticeSets ? "secondary" : "ghost"
            }
            onClick={() => {
              setShowOnlyBookmarked(true);
              setShowPracticeSets(false);
            }}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200",
              showOnlyBookmarked && !showPracticeSets
                ? "shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Bookmark
              className={cn(
                "h-4 w-4",
                showOnlyBookmarked && !showPracticeSets && "fill-current"
              )}
            />
            Saved
            {bookmarkedQuestionIds.size > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs"
              >
                {bookmarkedQuestionIds.size}
              </Badge>
            )}
          </Button>
          <Button
            type="button"
            variant={showPracticeSets ? "secondary" : "ghost"}
            onClick={() => {
              setShowPracticeSets(true);
              setShowOnlyBookmarked(false);
            }}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200",
              showPracticeSets
                ? "shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FolderPlus className="h-4 w-4" />
            Practice Sets
          </Button>
        </div>

        {showOnlyBookmarked && bookmarkedQuestionIds.size > 0 && (
          <Button onClick={handlePracticeWithBookmarked} className="gap-2">
            <Play className="h-4 w-4" />
            Practice with these
          </Button>
        )}
      </div>

      {/* Questions Content */}
      <div>
        {showPracticeSets ? (
          <DashboardSectionCard
            title="Practice Sets"
            description="Organize selected questions into focused prep sets."
          >
            <PracticeSetsList
              onSelectSet={handleSelectPracticeSet}
              refreshTrigger={practiceSetRefreshTrigger}
            />
          </DashboardSectionCard>
        ) : emptyStateType ? (
          <DashboardSectionCard
            title="Question Results"
            description="Adjust filters or explore another practice path."
            contentClassName="p-0"
          >
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
          </DashboardSectionCard>
        ) : (
          <>
            {/* Desktop Table View (≥768px) */}
            <DashboardSectionCard
              title="Questions"
              description={`${filteredQuestions.length} questions found`}
              className="hidden shadow-sm md:flex"
              contentClassName="p-0"
            >
              {/* Integrated Search/Filter Toolbar */}
              <div className="border-border/50 bg-card/40 border-b px-6 py-4 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      type="text"
                      placeholder="Search questions by text or company..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-card pl-10"
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
              <div className="relative max-h-[calc(100vh-12rem)] overflow-x-auto scroll-smooth">
                {/* Bottom fade gradient */}
                <div className="from-card pointer-events-none absolute right-0 bottom-0 left-0 z-10 h-12 bg-gradient-to-t to-transparent" />

                <Table className="border-separate border-spacing-0">
                  <TableHeader className="from-card via-card/98 to-card/95 border-border/60 sticky top-0 z-20 border-b bg-gradient-to-b shadow-sm shadow-border/40 backdrop-blur-md">
                    <TableRow className="hover:bg-transparent">
                      {/* Checkbox column */}
                      <TableHead className="h-11 w-12 px-4">
                        <Checkbox
                          checked={
                            selectedQuestions.size ===
                              filteredQuestions.length &&
                            filteredQuestions.length > 0
                          }
                          onChange={toggleSelectAll}
                          className="h-4 w-4"
                          aria-label="Select all questions"
                        />
                      </TableHead>
                      <TableHead className="h-11 px-4">Question</TableHead>
                      <TableHead className="h-11 px-4">Type</TableHead>
                      <TableHead className="h-11 px-4">Company</TableHead>
                      <TableHead className="h-11 px-4">Asked Date</TableHead>
                      <TableHead className="h-11 px-4 text-right">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuestions.map((question, index) => {
                      const isSelected = selectedQuestions.has(question.id);
                      return (
                        <TableRow
                          key={question.id}
                          className={cn(
                            "hover:bg-primary/[0.02] transition-all duration-200",
                            "border-border/40 border-b last:border-0",
                            isSelected &&
                              "bg-primary/[0.04] border-l-primary border-l-2 ring-1 ring-inset ring-primary/10"
                          )}
                          style={{
                            opacity: index < 20 ? 0 : 1,
                            animation:
                              index < 20
                                ? `fadeInUp 0.3s ease-out ${index * 0.015}s forwards`
                                : "none",
                          }}
                        >
                          {/* Checkbox */}
                          <TableCell className="px-4 py-3.5">
                            <Checkbox
                              checked={isSelected}
                              onChange={() =>
                                toggleQuestionSelection(question.id)
                              }
                              className="h-4 w-4"
                              aria-label={`Select question: ${question.questionText}`}
                              aria-checked={isSelected}
                            />
                          </TableCell>

                          {/* Question */}
                          <TableCell className="px-4 py-3.5">
                            <p className="text-foreground line-clamp-2 text-sm font-medium">
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
                            <div className="text-muted-foreground flex items-center gap-2 text-sm">
                              <Building2 className="h-4 w-4 opacity-60" />
                              <span>{question.company || "N/A"}</span>
                            </div>
                          </TableCell>

                          {/* Date */}
                          <TableCell className="px-4 py-3.5">
                            <div className="text-muted-foreground flex items-center gap-2 text-sm">
                              <Calendar className="h-4 w-4 opacity-60" />
                              <span>
                                {question.askedAt
                                  ? new Date(
                                      question.askedAt
                                    ).toLocaleDateString()
                                  : "N/A"}
                              </span>
                            </div>
                          </TableCell>

                          {/* Action */}
                          <TableCell className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleBookmark(question.id)}
                                className={cn(
                                  "h-9 w-9 rounded-lg transition-colors",
                                  bookmarkedQuestionIds.has(question.id)
                                    ? "text-primary bg-primary/10 hover:bg-primary/20"
                                    : "text-muted-foreground hover:text-primary hover:bg-primary/5"
                                )}
                                aria-label={
                                  bookmarkedQuestionIds.has(question.id)
                                    ? "Remove bookmark"
                                    : "Bookmark question"
                                }
                              >
                                <Bookmark
                                  className={cn(
                                    "h-4 w-4",
                                    bookmarkedQuestionIds.has(question.id) &&
                                      "fill-current"
                                  )}
                                />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleTryQuestion(
                                    question.id,
                                    question.questionType
                                  )
                                }
                                className="gap-2"
                              >
                                <Play className="h-4 w-4" />
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
            </DashboardSectionCard>

            {/* Mobile Card Grid (<768px) */}
            <div className="space-y-4 md:hidden">
              {/* Mobile Search/Filter Toolbar */}
              <DashboardSectionCard
                title="Search And Filters"
                description={`${filteredQuestions.length} questions found`}
                className="shadow-sm"
                contentClassName="p-0"
              >
                <div className="bg-card/40 px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                      <Input
                        type="text"
                        placeholder="Search questions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="min-h-11 bg-card pl-10"
                        aria-label="Search questions"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsFilterDrawerOpen(true)}
                      className="flex min-h-11 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
                      aria-label="Open filters"
                    >
                      <Filter className="h-4 w-4" />
                      {selectedType !== "All Types" && (
                        <Badge
                          variant="default"
                          className="h-5 min-w-5 rounded-full px-1.5 text-xs"
                        >
                          1
                        </Badge>
                      )}
                    </Button>
                  </div>
                </div>
              </DashboardSectionCard>

              {/* Mobile Question Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {filteredQuestions.map((question, index) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    selected={selectedQuestions.has(question.id)}
                    onToggleSelect={() => toggleQuestionSelection(question.id)}
                    onTryQuestion={() =>
                      handleTryQuestion(question.id, question.questionType)
                    }
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

      {/* Practice Set Dialog */}
      <PracticeSetDialog
        isOpen={isPracticeSetDialogOpen}
        onClose={() => setIsPracticeSetDialogOpen(false)}
        selectedQuestionIds={Array.from(selectedQuestions)}
        onSuccess={handlePracticeSetSuccess}
      />

      {/* Live region for accessibility */}
      <div role="status" aria-live="polite" className="sr-only">
        {filteredQuestions.length} questions found
        {selectedQuestions.size > 0 && `, ${selectedQuestions.size} selected`}
      </div>
    </div>
  );
});
