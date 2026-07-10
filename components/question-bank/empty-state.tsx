"use client";

import { Button } from "@/components/ui/button";
import { Search, Filter, Sparkles, Bookmark } from "lucide-react";
import { LucideIcon } from "lucide-react";

type EmptyStateType = "no-search" | "no-filter" | "first-time" | "no-bookmarks";

interface EmptyStateProps {
  type: EmptyStateType;
  onClearFilters?: () => void;
  onExploreProductSense?: () => void;
  onBackToDashboard?: () => void;
  selectedType?: string;
}

const EMPTY_STATE_CONFIG: Record<
  EmptyStateType,
  {
    icon: LucideIcon;
    iconBg: string;
    title: string;
    description: string | ((selectedType?: string) => string);
  }
> = {
  "no-search": {
    icon: Search,
    iconBg: "bg-muted/30",
    title: "No questions found",
    description:
      "Try adjusting your search or filters to find what you're looking for.",
  },
  "no-filter": {
    icon: Filter,
    iconBg: "bg-muted/30",
    title: "No questions match these filters",
    description: (selectedType) =>
      selectedType && selectedType !== "All Types"
        ? `Try selecting "All Types" or adjust your company filters.`
        : "Try adjusting your filter criteria to see more questions.",
  },
  "first-time": {
    icon: Sparkles,
    iconBg: "bg-primary/10",
    title: "Welcome to the Question Bank",
    description:
      "Browse curated PM practice questions by company and round type. Choose a question to start practicing.",
  },
  "no-bookmarks": {
    icon: Bookmark,
    iconBg: "bg-muted/30",
    title: "No saved questions yet",
    description:
      "Start building your personalized practice list by bookmarking questions. Click the bookmark icon on any question to save it.",
  },
};

export function EmptyState({
  type,
  onClearFilters,
  onExploreProductSense,
  onBackToDashboard,
  selectedType,
}: EmptyStateProps) {
  const config = EMPTY_STATE_CONFIG[type];
  const Icon = config.icon;
  const description =
    typeof config.description === "function"
      ? config.description(selectedType)
      : config.description;

  return (
    <div className="py-16 text-center">
      {/* Icon */}
      <div
        className={`mx-auto mb-4 h-16 w-16 rounded-full ${config.iconBg} flex items-center justify-center`}
      >
        <Icon
          className={`h-8 w-8 ${
            type === "first-time" ? "text-primary" : "text-muted-foreground/50"
          }`}
        />
      </div>

      {/* Title */}
      <h3 className="text-foreground mb-2 text-lg font-medium">
        {config.title}
      </h3>

      {/* Description */}
      <p className="text-muted-foreground mx-auto mb-6 max-w-md text-sm">
        {description}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap justify-center gap-3">
        {type === "no-search" && onClearFilters && (
          <Button variant="outline" onClick={onClearFilters}>
            Clear Filters
          </Button>
        )}

        {type === "no-filter" && (
          <>
            {onClearFilters && (
              <Button variant="outline" onClick={onClearFilters}>
                Clear All Filters
              </Button>
            )}
            {onBackToDashboard && (
              <Button onClick={onBackToDashboard}>Back to Dashboard</Button>
            )}
          </>
        )}

        {type === "first-time" && onExploreProductSense && (
          <Button onClick={onExploreProductSense}>
            Explore Product Sense Questions
          </Button>
        )}

        {type === "no-bookmarks" && onExploreProductSense && (
          <Button onClick={onExploreProductSense}>Browse Question Bank</Button>
        )}
      </div>
    </div>
  );
}
