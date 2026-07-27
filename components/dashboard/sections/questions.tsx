"use client";

import {
  memo,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Bookmark, CircleAlert, Loader2, Search } from "lucide-react";

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

const ROUND_FILTER_OPTIONS = ROUND_FILTERS.map((round) => ({
  value: round,
  label: round,
}));

export const QuestionsSection = memo(function QuestionsSection() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMoreQuestions, setLoadingMoreQuestions] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hasMoreQuestions, setHasMoreQuestions] = useState(false);
  const [nextQuestionOffset, setNextQuestionOffset] = useState(0);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRound, setSelectedRound] =
    useState<(typeof ROUND_FILTERS)[number]>("All rounds");
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"recent" | "company">("recent");
  const [bookmarkedQuestionIds, setBookmarkedQuestionIds] = useState<
    Set<string>
  >(new Set());
  const [bookmarksLoading, setBookmarksLoading] = useState(true);
  const [pendingBookmarkIds, setPendingBookmarkIds] = useState<Set<string>>(
    new Set()
  );
  const pendingBookmarkIdsRef = useRef(new Set<string>());
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const debouncedSearchQuery = useDebounce(searchQuery, 250);

  useEffect(() => {
    const controller = new AbortController();
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setLoadingMoreQuestions(false);
    setLoadMoreError(null);
    setHasMoreQuestions(false);
    setNextQuestionOffset(0);

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
        const nextQuestions = Array.isArray(data.questions)
          ? data.questions
          : [];
        setQuestions(nextQuestions);
        setTotalQuestions(data.pagination?.total || nextQuestions.length || 0);
        setHasMoreQuestions(data.pagination?.hasMore === true);
        setNextQuestionOffset(
          getNextQuestionOffset(data.pagination, nextQuestions.length)
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Error fetching questions:", error);
        setQuestions([]);
        setTotalQuestions(0);
        setHasMoreQuestions(false);
        setNextQuestionOffset(0);
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
    return () => {
      controller.abort();
      loadMoreControllerRef.current?.abort();
      loadMoreControllerRef.current = null;
    };
  }, [selectedRound, retryCount]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchBookmarks() {
      try {
        const res = await fetch("/api/questions/bookmark", {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error("Failed to fetch bookmarks");
        }
        const data = await res.json();
        setBookmarkedQuestionIds(new Set(data.questionIds || []));
        setBookmarkError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Error fetching bookmarks:", error);
        setBookmarkError(
          "Saved questions could not be loaded. You can still browse the question bank."
        );
      } finally {
        if (!controller.signal.aborted) setBookmarksLoading(false);
      }
    }

    fetchBookmarks();
    return () => controller.abort();
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
  const companyFilterOptions = useMemo(
    () => [
      { value: "", label: "All companies" },
      ...companyFilters.map(([company]) => ({
        value: company,
        label: company,
      })),
    ],
    [companyFilters]
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

  const loadMoreQuestions = async () => {
    if (
      loadingMoreQuestions ||
      loadMoreControllerRef.current ||
      !hasMoreQuestions
    ) {
      return;
    }

    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMoreQuestions(true);
    setLoadMoreError(null);

    try {
      const params = new URLSearchParams({
        limit: "100",
        offset: String(nextQuestionOffset),
        activeOnly: "true",
      });
      if (selectedRound !== "All rounds") {
        params.set("type", TYPE_TO_API[selectedRound]);
      }

      const res = await fetch(`/api/questions?${params.toString()}`, {
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.questions)) {
        throw new Error("question_bank_page_read_failed");
      }
      if (controller.signal.aborted) return;

      setQuestions((current) => {
        const seen = new Set(current.map((question) => question.id));
        const additions = data.questions.filter((question: Question) => {
          if (seen.has(question.id)) return false;
          seen.add(question.id);
          return true;
        });
        return [...current, ...additions];
      });
      setTotalQuestions((current) =>
        Number.isSafeInteger(data.pagination?.total) &&
        Number(data.pagination.total) >= 0
          ? Number(data.pagination.total)
          : current
      );
      setHasMoreQuestions(data.pagination?.hasMore === true);
      setNextQuestionOffset(
        getNextQuestionOffset(data.pagination, data.questions.length)
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Error loading more questions:", error);
      setLoadMoreError(
        "More questions couldn’t be loaded. Check your connection and try again."
      );
    } finally {
      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = null;
        setLoadingMoreQuestions(false);
      }
    }
  };

  const toggleBookmark = async (questionId: string) => {
    if (bookmarksLoading || pendingBookmarkIdsRef.current.has(questionId)) {
      return;
    }

    const isBookmarked = bookmarkedQuestionIds.has(questionId);
    pendingBookmarkIdsRef.current.add(questionId);
    setPendingBookmarkIds(new Set(pendingBookmarkIdsRef.current));
    setBookmarkError(null);
    setBookmarkedQuestionIds((prev) => {
      const updated = new Set(prev);
      if (isBookmarked) updated.delete(questionId);
      else updated.add(questionId);
      return updated;
    });

    try {
      let response: Response;
      if (isBookmarked) {
        response = await fetch(
          `/api/questions/bookmark?questionId=${questionId}`,
          {
            method: "DELETE",
          }
        );
      } else {
        response = await fetch("/api/questions/bookmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId }),
        });
      }
      if (!response.ok) {
        throw new Error("Failed to update bookmark");
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      setBookmarkError(
        "That saved-question change didn’t stick. Please try again."
      );
      setBookmarkedQuestionIds((prev) => {
        const updated = new Set(prev);
        if (isBookmarked) updated.add(questionId);
        else updated.delete(questionId);
        return updated;
      });
    } finally {
      pendingBookmarkIdsRef.current.delete(questionId);
      setPendingBookmarkIds(new Set(pendingBookmarkIdsRef.current));
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
    <DashboardPage label="Question Bank" bodyClassName="overflow-hidden">
      <div className="mx-auto grid h-full min-h-0 w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)] gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-1 lg:gap-7">
        <div
          className="border-dashboard-panel-border space-y-4 border-b pb-5 lg:hidden"
          data-question-bank-controls
        >
          <SearchField value={searchQuery} onChange={setSearchQuery} />
          <div className="grid grid-cols-2 gap-3">
            <CompactFilter
              label="Round"
              value={selectedRound}
              onChange={(value) =>
                setSelectedRound(value as (typeof ROUND_FILTERS)[number])
              }
              options={ROUND_FILTER_OPTIONS}
            />
            <CompactFilter
              label="Company"
              value={selectedCompany || ""}
              onChange={(value) => setSelectedCompany(value || null)}
              options={companyFilterOptions}
            />
          </div>
        </div>

        <aside
          className="border-dashboard-panel-border hidden min-h-0 flex-col gap-7 border-r pr-7 lg:col-start-1 lg:row-start-1 lg:flex"
          data-question-bank-controls
        >
          <SearchField value={searchQuery} onChange={setSearchQuery} />

          <div className="space-y-3">
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
          </div>

          <FilterGroup title="Company">
            {companyFilters.map(([company, count]) => (
              <Button
                key={company}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={selectedCompany === company}
                onClick={() =>
                  setSelectedCompany((current) =>
                    current === company ? null : company
                  )
                }
                className={cn(
                  "h-auto min-h-9 w-full justify-between rounded-md px-2 py-2 text-left text-sm whitespace-normal",
                  selectedCompany === company
                    ? "bg-dashboard-muted/15 text-dashboard-foreground font-semibold"
                    : "text-dashboard-muted hover:text-dashboard-foreground"
                )}
              >
                <span className="min-w-0 break-words">{company}</span>
                <span className="shrink-0 pl-3">{count}</span>
              </Button>
            ))}
          </FilterGroup>
        </aside>

        <section
          className="flex min-h-0 min-w-0 flex-col lg:col-start-2 lg:row-start-1"
          data-question-bank-results
        >
          <div className="flex shrink-0 items-center justify-between gap-4 pb-4">
            <div className="min-w-0">
              <h2 className="text-dashboard-foreground text-lg font-semibold">
                All questions
              </h2>
              <p className="text-dashboard-muted mt-1 text-sm">
                Showing {filteredQuestions.length} of{" "}
                {totalQuestions || summary.totalActive}
                {bookmarkedQuestionIds.size > 0
                  ? ` · ${bookmarkedQuestionIds.size} saved`
                  : ""}
              </p>
              {bookmarkError && (
                <p role="alert" className="text-destructive mt-2 text-sm">
                  {bookmarkError}
                </p>
              )}
            </div>
            <label className="text-dashboard-muted flex shrink-0 items-center gap-2 text-sm">
              <span className="hidden sm:inline">Sort</span>
              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value as "recent" | "company")
                }
                className="border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground min-h-10 rounded-md border px-3 py-2"
                aria-label="Sort questions"
              >
                <option value="recent">Recent</option>
                <option value="company">Company</option>
              </select>
            </label>
          </div>

          <div className="border-dashboard-panel-border text-dashboard-muted hidden shrink-0 grid-cols-[100px_110px_minmax(0,1fr)_92px] gap-4 border-b py-3 text-xs font-bold tracking-[0.2em] uppercase lg:grid">
            <span>Company</span>
            <span>Round</span>
            <span>Question</span>
            <span className="text-right">Actions</span>
          </div>

          <div
            className="divide-dashboard-panel-border min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain pr-1"
            data-question-bank-list
            tabIndex={0}
            aria-label="Question results"
            aria-busy={loadingMoreQuestions}
          >
            {filteredQuestions.map((question) => (
              <QuestionRow
                key={question.id}
                question={question}
                bookmarked={bookmarkedQuestionIds.has(question.id)}
                bookmarkPending={
                  bookmarksLoading || pendingBookmarkIds.has(question.id)
                }
                onToggleBookmark={() => toggleBookmark(question.id)}
              />
            ))}

            {filteredQuestions.length === 0 && (
              <div className="text-dashboard-muted flex min-h-40 items-center justify-center px-4 text-center text-sm">
                No questions match the current filters.
              </div>
            )}

            {hasMoreQuestions && (
              <div className="space-y-3 px-4 py-5 text-center">
                {loadMoreError && (
                  <p role="alert" className="text-destructive text-sm">
                    {loadMoreError}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMoreQuestions}
                  onClick={loadMoreQuestions}
                >
                  {loadingMoreQuestions && (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {loadingMoreQuestions
                    ? "Loading more questions..."
                    : "Load more questions"}
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardPage>
  );
});

function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();

  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        className="text-dashboard-muted block text-xs font-bold tracking-[0.3em] uppercase"
      >
        Search
      </label>
      <div className="relative">
        <Search
          className="text-dashboard-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground pl-9"
          placeholder="Company or keyword"
        />
      </div>
    </div>
  );
}

function CompactFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-dashboard-muted min-w-0 text-xs font-bold tracking-[0.2em] uppercase">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground mt-2 block min-h-10 w-full min-w-0 rounded-md border px-3 py-2 text-sm font-normal tracking-normal normal-case"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuestionRow({
  question,
  bookmarked,
  bookmarkPending,
  onToggleBookmark,
}: {
  question: Question;
  bookmarked: boolean;
  bookmarkPending: boolean;
  onToggleBookmark: () => void;
}) {
  const bookmarkLabel = bookmarked ? "Remove saved question" : "Save question";

  return (
    <article className="py-4 text-sm" data-question-bank-row>
      <div className="hidden min-w-0 grid-cols-[100px_110px_minmax(0,1fr)_92px] gap-4 lg:grid">
        <span className="text-dashboard-foreground min-w-0 font-semibold break-words">
          {question.company || "Meelni"}
        </span>
        <span className="text-dashboard-muted min-w-0 break-words">
          {formatRoundType(question.questionType)}
        </span>
        <span className="text-dashboard-foreground min-w-0 leading-6 break-words">
          {question.questionText}
        </span>
        <span className="flex items-start justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={bookmarkLabel}
            aria-pressed={bookmarked}
            title={bookmarkLabel}
            disabled={bookmarkPending}
            onClick={onToggleBookmark}
            className="text-dashboard-muted hover:text-dashboard-foreground h-9 w-9"
          >
            <Bookmark
              className={cn("h-4 w-4", bookmarked && "fill-current")}
              aria-hidden="true"
            />
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary h-9 px-2"
          >
            <Link href={getQuestionStartHref(question)}>Start</Link>
          </Button>
        </span>
      </div>

      <div className="min-w-0 lg:hidden">
        <div className="text-dashboard-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-dashboard-foreground font-semibold">
            {question.company || "Meelni"}
          </span>
          <span aria-hidden="true">·</span>
          <span>{formatRoundType(question.questionType)}</span>
        </div>
        <p className="text-dashboard-foreground mt-2 leading-6 break-words">
          {question.questionText}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-dashboard-panel-border bg-transparent"
          >
            <Link href={getQuestionStartHref(question)}>Start interview</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={bookmarked}
            disabled={bookmarkPending}
            onClick={onToggleBookmark}
            className="text-dashboard-muted hover:text-dashboard-foreground"
          >
            <Bookmark
              className={cn("mr-2 h-4 w-4", bookmarked && "fill-current")}
              aria-hidden="true"
            />
            {bookmarked ? "Saved" : "Save"}
          </Button>
        </div>
      </div>
    </article>
  );
}

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
      aria-pressed={active}
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

function getNextQuestionOffset(
  pagination: { offset?: unknown; limit?: unknown } | null | undefined,
  pageLength: number
) {
  const offset =
    Number.isSafeInteger(pagination?.offset) && Number(pagination?.offset) >= 0
      ? Number(pagination?.offset)
      : 0;
  const limit =
    Number.isSafeInteger(pagination?.limit) && Number(pagination?.limit) > 0
      ? Number(pagination?.limit)
      : pageLength;
  return offset + limit;
}
