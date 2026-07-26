"use client";

import { memo, type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, CircleAlert, Play, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardPage } from "@/components/dashboard/layout/dashboard-page";
import {
  DashboardLoadingState,
  DashboardStateCard,
  DashboardSkeletonCard,
} from "@/components/dashboard/dashboard-surface";
import {
  buildQuestionBankSummary,
  formatRoundType,
  type DashboardQuestionInput,
} from "@/lib/dashboard/contracts";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { buildNewInterviewHref } from "@/lib/navigation/interview-launch";

interface Question extends DashboardQuestionInput {
  createdAt?: Date | string | null;
}

const ROUND_FILTERS = [
  "All rounds",
  "Product Sense",
  "Execution",
  "Strategy",
  "Behavioral",
] as const;

const TYPE_TO_API: Record<string, string> = {
  "Product Sense": "product_sense",
  Execution: "execution",
  Strategy: "strategy",
  Behavioral: "behavioral",
};

export const QuestionsSection = memo(function QuestionsSection() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRound, setSelectedRound] =
    useState<(typeof ROUND_FILTERS)[number]>("All rounds");
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"recent" | "company">("recent");
  const [bookmarkedQuestionIds, setBookmarkedQuestionIds] = useState<
    Set<string>
  >(new Set());
  const debouncedSearchQuery = useDebounce(searchQuery, 250);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchQuestions() {
      try {
        setLoading(true);
        setLoadError(null);
        const params = new URLSearchParams({
          limit: "100",
          activeOnly: "true",
        });

        if (selectedRound !== "All rounds") {
          params.set("type", TYPE_TO_API[selectedRound]);
        }

        const res = await fetch(`/api/questions?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data?.code === "question_bank_unavailable"
              ? "question_bank_unavailable"
              : "question_bank_read_failed"
          );
        }
        setQuestions(data.questions || []);
        setTotalQuestions(
          data.pagination?.total || data.questions?.length || 0
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Error fetching questions:", error);
        setQuestions([]);
        setTotalQuestions(0);
        setLoadError(
          error instanceof Error &&
            error.message === "question_bank_unavailable"
            ? "The published question bank is temporarily unavailable. Please try again shortly."
            : "We couldn’t load the question bank. Check your connection and try again."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    fetchQuestions();
    return () => controller.abort();
  }, [selectedRound, retryCount]);

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

  const summary = useMemo(
    () => buildQuestionBankSummary(questions),
    [questions]
  );
  const companyFilters = useMemo(
    () =>
      Object.entries(summary.companyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    [summary.companyCounts]
  );

  const filteredQuestions = useMemo(() => {
    return questions
      .filter((question) => {
        const query = debouncedSearchQuery.trim().toLowerCase();
        const matchesSearch =
          query.length === 0 ||
          question.questionText.toLowerCase().includes(query) ||
          question.company?.toLowerCase().includes(query);
        const matchesCompany =
          !selectedCompany || question.company === selectedCompany;
        return matchesSearch && matchesCompany;
      })
      .sort((a, b) => {
        if (sortBy === "company") {
          return (a.company || "").localeCompare(b.company || "");
        }
        if (sortBy === "recent") {
          return getTime(b.askedAt) - getTime(a.askedAt);
        }
        return getTime(b.askedAt) - getTime(a.askedAt);
      });
  }, [questions, debouncedSearchQuery, selectedCompany, sortBy]);

  const recommendedQuestion =
    summary.recommendedQuestion && questions.length > 0
      ? summary.recommendedQuestion
      : null;

  const toggleBookmark = async (questionId: string) => {
    const isBookmarked = bookmarkedQuestionIds.has(questionId);
    setBookmarkedQuestionIds((prev) => {
      const updated = new Set(prev);
      if (isBookmarked) updated.delete(questionId);
      else updated.add(questionId);
      return updated;
    });

    try {
      if (isBookmarked) {
        await fetch(`/api/questions/bookmark?questionId=${questionId}`, {
          method: "DELETE",
        });
      } else {
        await fetch("/api/questions/bookmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId }),
        });
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      setBookmarkedQuestionIds((prev) => {
        const updated = new Set(prev);
        if (isBookmarked) updated.add(questionId);
        else updated.delete(questionId);
        return updated;
      });
    }
  };

  if (loading) {
    return (
      <DashboardPage label="Question Bank">
        <DashboardSkeletonCard className="min-h-[520px]">
          <DashboardLoadingState label="Loading question bank..." />
        </DashboardSkeletonCard>
      </DashboardPage>
    );
  }

  if (loadError) {
    return (
      <DashboardPage label="Question Bank">
        <DashboardStateCard
          tone="danger"
          icon={<CircleAlert className="h-8 w-8" aria-hidden="true" />}
          title="Question bank unavailable"
          description={loadError}
          action={
            <Button type="button" onClick={() => setRetryCount((n) => n + 1)}>
              Try again
            </Button>
          }
        />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage label="Question Bank">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        {recommendedQuestion && (
          <section className="border-dashboard-panel-border flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center">
            <Pill tone="primary">Start here</Pill>
            <div className="min-w-0 flex-1">
              <h2 className="text-dashboard-foreground text-lg font-semibold">
                {recommendedQuestion.questionText}
              </h2>
              <p className="text-dashboard-muted mt-1 text-sm">
                {formatRoundType(recommendedQuestion.questionType)} · Real PM
                interview question
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <Link href={getQuestionStartHref(recommendedQuestion)}>
                  <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                  Start
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => toggleBookmark(recommendedQuestion.id)}
                className="border-dashboard-panel-border text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground bg-transparent"
              >
                <Bookmark
                  className={cn(
                    "mr-2 h-4 w-4",
                    bookmarkedQuestionIds.has(recommendedQuestion.id) &&
                      "fill-current"
                  )}
                  aria-hidden="true"
                />
                Save
              </Button>
            </div>
          </section>
        )}

        <div className="grid flex-1 gap-7 py-5 lg:grid-cols-[240px_1fr]">
          <aside className="lg:border-dashboard-panel-border space-y-7 lg:border-r lg:pr-7">
            <div className="space-y-3">
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                Search
              </p>
              <div className="relative">
                <Search
                  className="text-dashboard-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground pl-9"
                  placeholder="Company or keyword"
                  aria-label="Search questions"
                />
              </div>
            </div>

            <FilterGroup title="Round">
              {ROUND_FILTERS.map((round) => (
                <FilterButton
                  key={round}
                  active={selectedRound === round}
                  label={round}
                  count={
                    round === "All rounds"
                      ? totalQuestions || summary.totalActive
                      : summary.roundCounts[round] || 0
                  }
                  onClick={() => setSelectedRound(round)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Company">
              {companyFilters.map(([company, count]) => (
                <Button
                  key={company}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelectedCompany((current) =>
                      current === company ? null : company
                    )
                  }
                  className={cn(
                    "h-8 rounded-full border px-3 text-sm",
                    selectedCompany === company
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-dashboard-panel-border text-dashboard-muted hover:text-dashboard-foreground"
                  )}
                >
                  {company} {count > 1 ? count : ""}
                </Button>
              ))}
            </FilterGroup>

            <div className="border-dashboard-panel-border border-t pt-7">
              <p className="font-display text-dashboard-foreground text-2xl font-semibold">
                Queue: {bookmarkedQuestionIds.size}
              </p>
              <p className="text-dashboard-muted mt-2 text-sm leading-6">
                Saved prompts become a short practice set.
              </p>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="border-dashboard-panel-border flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                  All questions
                </p>
                <p className="text-dashboard-muted mt-1 text-sm">
                  Showing {Math.min(filteredQuestions.length, 8)} of{" "}
                  {totalQuestions || summary.totalActive}
                </p>
              </div>
              <label className="text-dashboard-muted flex items-center gap-2 text-sm">
                Sort
                <select
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(event.target.value as "recent" | "company")
                  }
                  className="border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground rounded-md border px-3 py-2"
                >
                  <option value="recent">Recent</option>
                  <option value="company">Company</option>
                </select>
              </label>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="border-dashboard-panel-border text-dashboard-muted grid grid-cols-[140px_140px_1fr_92px] gap-4 border-b py-3 text-xs font-bold tracking-[0.2em] uppercase">
                  <span>Company</span>
                  <span>Round</span>
                  <span>Question</span>
                  <span className="text-right">Action</span>
                </div>
                <div className="divide-dashboard-panel-border divide-y">
                  {filteredQuestions.slice(0, 12).map((question) => (
                    <div
                      key={question.id}
                      className="grid grid-cols-[140px_140px_1fr_92px] gap-4 py-4 text-sm"
                    >
                      <span className="text-dashboard-foreground font-semibold">
                        {question.company || "Meelni"}
                      </span>
                      <span className="text-dashboard-muted">
                        {formatRoundType(question.questionType)}
                      </span>
                      <span className="text-dashboard-foreground">
                        {question.questionText}
                      </span>
                      <Link
                        href={getQuestionStartHref(question)}
                        className="text-primary text-right font-semibold hover:underline"
                      >
                        Start
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {filteredQuestions.length === 0 && (
              <div className="text-dashboard-muted py-16 text-center text-sm">
                No questions match the current filters.
              </div>
            )}
          </section>
        </div>
      </div>
    </DashboardPage>
  );
});

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
        {title}
      </p>
      <div className="flex flex-wrap gap-2 lg:block lg:space-y-1">
        {children}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md px-0 py-2 text-sm",
        active
          ? "text-dashboard-foreground font-semibold"
          : "text-dashboard-muted hover:text-dashboard-foreground"
      )}
    >
      <span>{label}</span>
      <span>{count}</span>
    </Button>
  );
}

function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "primary" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-3 py-1.5 text-xs font-bold",
        tone === "primary"
          ? "bg-primary text-primary-foreground"
          : "bg-dashboard-muted/15 text-dashboard-foreground"
      )}
    >
      {children}
    </span>
  );
}

function getQuestionStartHref(question: DashboardQuestionInput) {
  const params = new URLSearchParams({
    questionId: question.id,
    roundType: normalizeRoundType(question.questionType),
  });
  if (question.company) params.set("company", question.company);
  return buildNewInterviewHref(params);
}

function normalizeRoundType(roundType: string) {
  if (roundType === "Product Sense") return "product_sense";
  if (roundType === "Execution") return "execution";
  if (roundType === "Strategy") return "strategy";
  if (roundType === "Behavioral") return "behavioral";
  return roundType;
}

function getTime(date: Date | string | null | undefined) {
  if (!date) return 0;
  return new Date(date).getTime();
}
