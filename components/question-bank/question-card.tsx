"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Calendar, Building2 } from "lucide-react";
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
}

export function QuestionCard({
  question,
  selected,
  onToggleSelect,
  onTryQuestion,
  badgeClassName,
  index = 0,
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
        "relative p-4 border rounded-lg bg-card transition-all duration-150 min-h-[140px] flex flex-col",
        selected
          ? "border-primary shadow-sm shadow-primary/20"
          : "border-border hover:border-primary/50 hover:shadow-sm"
      )}
    >
      {/* Checkbox - Top left corner with touch-friendly size */}
      <div className="absolute top-3 left-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
          aria-label={`Select question: ${question.questionText}`}
          aria-checked={selected}
        />
      </div>

      {/* Header: Company and Date badges */}
      <div className="flex items-center justify-between mb-3 pl-8">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="w-3.5 h-3.5 opacity-60" />
          <span>{question.company || "N/A"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 opacity-60" />
          <span>{formatDate(question.askedAt)}</span>
        </div>
      </div>

      {/* Question Text - 2 line clamp */}
      <p className="text-sm text-foreground line-clamp-2 mb-3 flex-1 leading-relaxed">
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
        className="w-full h-11 gap-2"
        aria-label={`Start interview with question: ${question.questionText}`}
      >
        <Play className="w-4 h-4" />
        Try Question
      </Button>
    </motion.div>
  );
}
