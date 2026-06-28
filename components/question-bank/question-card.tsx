"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Calendar, Building2, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestionCardProps {
  question: {
    id: string;
    company: string | null;
    questionText: string;
    questionType: string;
    askedAt: Date | null;
  };
  selected: boolean;
  onToggleSelect: () => void;
  onTryQuestion: () => void;
  badgeClassName?: string;
  index?: number;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
}

export function QuestionCard({
  question,
  selected,
  onToggleSelect,
  onTryQuestion,
  badgeClassName,
  index = 0,
  isBookmarked = false,
  onToggleBookmark,
}: QuestionCardProps) {
  // Format date as relative time
  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - new Date(date).getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "bg-card relative flex min-h-[140px] flex-col rounded-lg border p-4 transition-all duration-150",
        selected
          ? "border-primary shadow-primary/20 shadow-sm"
          : "border-border hover:border-primary/50 hover:shadow-sm"
      )}
    >
      {/* Checkbox - Top left corner with touch-friendly size */}
      <div className="absolute top-3 left-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="border-border text-primary focus:ring-primary/20 h-5 w-5 rounded focus:ring-2"
          aria-label={`Select question: ${question.questionText}`}
          aria-checked={selected}
        />
      </div>

      {/* Header: Company, Date badges, and Bookmark button */}
      <div className="mb-3 flex items-center justify-between pl-8">
        <div className="flex items-center gap-3">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Building2 className="h-3.5 w-3.5 opacity-60" />
            <span>{question.company || "N/A"}</span>
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5 opacity-60" />
            <span>{formatDate(question.askedAt)}</span>
          </div>
        </div>
        {onToggleBookmark && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onToggleBookmark();
            }}
            className={cn(
              "h-8 w-8 touch-manipulation rounded-lg transition-colors",
              isBookmarked
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-primary hover:bg-primary/5"
            )}
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark question"}
          >
            <Bookmark
              className={cn("h-4 w-4", isBookmarked && "fill-current")}
            />
          </Button>
        )}
      </div>

      {/* Question Text - 2 line clamp */}
      <p className="text-foreground mb-3 line-clamp-2 flex-1 text-sm leading-relaxed">
        {question.questionText}
      </p>

      {/* Type Badge */}
      <div className="mb-3">
        <Badge variant="subtle" className={cn("text-xs", badgeClassName)}>
          {question.questionType}
        </Badge>
      </div>

      {/* Try Question Button - Full width, touch-friendly */}
      <Button
        size="sm"
        onClick={onTryQuestion}
        className="h-11 w-full gap-2"
        aria-label={`Start interview with question: ${question.questionText}`}
      >
        <Play className="h-4 w-4" />
        Try Question
      </Button>
    </motion.div>
  );
}
