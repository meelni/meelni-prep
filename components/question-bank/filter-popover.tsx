"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  selectedType: string;
  onSelectType: (type: string) => void;
  sortBy: "recent" | "company" | "type";
  onSortChange: (sort: "recent" | "company" | "type") => void;
  onClearAll: () => void;
}

export function FilterPopover({
  selectedType,
  onSelectType,
  sortBy,
  onSortChange,
  onClearAll,
}: FilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Calculate active filter count
  const activeFilterCount = selectedType !== "All Types" ? 1 : 0;

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
          <Filter className="h-4 w-4" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <Badge
              variant="default"
              className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs"
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
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-foreground text-sm font-semibold">
            Filter & Sort
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="h-6 w-6"
            aria-label="Close filters"
          >
            <X className="text-muted-foreground h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] space-y-6 overflow-y-auto px-4 py-4">
          {/* Question Type */}
          <div>
            <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
              Question Type
            </h4>
            <div className="space-y-1.5">
              {QUESTION_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={selectedType === type ? "default" : "ghost"}
                  onClick={() => onSelectType(type)}
                  className={cn(
                    "w-full justify-start px-3 py-2 text-left text-sm font-medium",
                    selectedType === type
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted/50"
                  )}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {/* Sort By */}
          <div>
            <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
              Sort By
            </h4>
            <div className="space-y-1.5">
              {SORT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={sortBy === option.value ? "default" : "ghost"}
                  onClick={() => onSortChange(option.value)}
                  className={cn(
                    "w-full justify-start px-3 py-2 text-left text-sm font-medium",
                    sortBy === option.value
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted/50"
                  )}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-border flex gap-2 border-t px-4 py-3">
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
