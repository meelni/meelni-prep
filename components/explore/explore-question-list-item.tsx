import type { MouseEventHandler } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ExploreQuestionListItemProps {
  question: {
    id: string;
    company: string | null;
    questionText: string;
    questionType: string;
    askedAt: Date | string | null;
  };
  index: number;
  isLast: boolean;
  disabled?: boolean;
  onPractice: MouseEventHandler<HTMLButtonElement>;
}

function formatCompanyName(company: string | null): string {
  if (!company) return "Unknown";
  return company.charAt(0).toUpperCase() + company.slice(1);
}

function formatQuestionText(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ExploreQuestionListItem({
  question,
  index,
  isLast,
  disabled = false,
  onPractice,
}: ExploreQuestionListItemProps) {
  return (
    <article
      className={cn(
        "group hover:bg-muted/20 -mx-4 rounded-lg px-4 py-6 transition-colors duration-200",
        !isLast && "border-border/40 border-b"
      )}
      role="listitem"
      data-question-index={index}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onPractice}
        disabled={disabled}
        aria-busy={disabled}
        className="h-auto min-h-24 w-full min-w-0 touch-manipulation flex-col items-stretch justify-start gap-3 rounded-lg p-0 text-left whitespace-normal hover:bg-transparent"
        aria-label={`Practice question: ${question.questionText}`}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-foreground max-w-full min-w-0 text-xs font-medium [overflow-wrap:anywhere] break-words">
            {formatCompanyName(question.company)}
          </span>
          <span className="text-muted-foreground text-xs" aria-hidden="true">
            •
          </span>
          <span className="text-muted-foreground min-w-0 text-xs font-normal break-words">
            {question.questionType}
          </span>
        </div>

        <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-6">
          <h2 className="text-foreground group-hover:text-primary min-w-0 text-lg leading-snug font-semibold [overflow-wrap:anywhere] break-words whitespace-normal transition-colors">
            {formatQuestionText(question.questionText)}
          </h2>
          <span className="text-primary flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold">
            Practice question
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </span>
        </div>
      </Button>
    </article>
  );
}
