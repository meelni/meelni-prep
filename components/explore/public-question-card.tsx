"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Calendar, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PublicQuestionCardProps {
  question: {
    id: string;
    company: string | null;
    questionText: string;
    questionType: string;
    askedAt: Date | null;
  };
  badgeClassName?: string;
  index?: number;
}

export function PublicQuestionCard({
  question,
  badgeClassName,
  index = 0,
}: PublicQuestionCardProps) {
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
        "relative p-4 border rounded-lg bg-card transition-all duration-150 min-h-36 flex flex-col",
        "border-border hover:border-primary/50 hover:shadow-sm"
      )}
    >
      {/* Header: Company and Date badges */}
      <div className="flex items-center justify-between mb-3">
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
      <div>
        <Badge variant="subtle" className={cn("text-xs", badgeClassName)}>
          {question.questionType}
        </Badge>
      </div>
    </motion.div>
  );
}
