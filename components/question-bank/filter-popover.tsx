"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterPill } from "@/components/ui/filter-pill";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

type QuickFilter = "recent" | "faang" | "weak-areas";

const QUESTION_TYPES = [
  "All Types",
  "Behavioral",
  "Product Sense",
  "Execution",
  "Product Strategy",
];

const SORT_OPTIONS = [
  { value: "recent" as const, label: "Most Recent" },
  { value: "company" as const, label: "Company" },
  { value: "type" as const, label: "Type" },
];

interface FilterPopoverProps {
  quickFilters: Set<QuickFilter>;
  onToggleQuickFilter: (filter: QuickFilter) => void;
  selectedType: string;
  onSelectType: (type: string) => void;
  sortBy: "recent" | "company" | "type";
  onSortChange: (sort: "recent" | "company" | "type") => void;
  onClearAll: () => void;
}

export function FilterPopover({
  quickFilters,
  onToggleQuickFilter,
  selectedType,
  onSelectType,
  sortBy,
  onSortChange,
  onClearAll,
}: FilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Calculate active filter count
  const activeFilterCount =
    quickFilters.size + (selectedType !== "All Types" ? 1 : 0);

  const handleApply = () => {
    setIsOpen(false);
  };

  const handleClearAll = () => {
    onClearAll();
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
        >
          <Filter className="w-4 h-4" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <Badge
              variant="default"
              className="ml-1 h-5 min-w-5 px-1.5 text-xs rounded-full"
            >
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="end"
        side="bottom"
        sideOffset={8}
        alignOffset={-8}
        collisionPadding={16}
        onEscapeKeyDown={() => setIsOpen(false)}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Filter & Sort
          </h3>
          <button
            onClick={() => setIsOpen(false)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted/50 transition-colors"
            aria-label="Close filters"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Quick Filters */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Quick Filters
            </h4>
            <div className="flex flex-wrap gap-2">
              <FilterPill
                active={quickFilters.has("recent")}
                onClick={() => onToggleQuickFilter("recent")}
                aria-label="Filter by recent questions"
              >
                Recent Questions
              </FilterPill>
              <FilterPill
                active={quickFilters.has("faang")}
                onClick={() => onToggleQuickFilter("faang")}
                aria-label="Filter by FAANG companies"
              >
                FAANG Companies
              </FilterPill>
              <FilterPill
                active={quickFilters.has("weak-areas")}
                onClick={() => onToggleQuickFilter("weak-areas")}
                aria-label="Filter by weak areas"
                title="Coming soon - based on your performance data"
              >
                My Weak Areas
              </FilterPill>
            </div>
          </div>

          {/* Question Type */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Question Type
            </h4>
            <div className="space-y-1.5">
              {QUESTION_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => onSelectType(type)}
                  className={cn(
                    "w-full px-3 py-2 rounded-md text-sm font-medium text-left transition-colors",
                    selectedType === type
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted/50"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Sort By */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Sort By
            </h4>
            <div className="space-y-1.5">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onSortChange(option.value)}
                  className={cn(
                    "w-full px-3 py-2 rounded-md text-sm font-medium text-left transition-colors",
                    sortBy === option.value
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted/50"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <Button
            variant="outline"
            onClick={handleClearAll}
            className="flex-1"
            size="sm"
          >
            Clear All
          </Button>
          <Button onClick={handleApply} className="flex-1" size="sm">
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
