"use client";

import {
  FeedbackSectionCard,
  FeedbackStateCard,
} from "@/components/feedback/feedback-surface";
import { Badge } from "@/components/ui/badge";
import { ScrollText, User, Bot, Sparkles } from "lucide-react";
import type { TranscriptTurn } from "@/lib/types/feedback";

interface TranscriptViewerProps {
  transcript: TranscriptTurn[];
}

export function TranscriptViewer({ transcript }: TranscriptViewerProps) {
  if (transcript.length === 0) {
    return (
      <FeedbackStateCard
        icon={<ScrollText className="h-10 w-10" />}
        title="No Transcript Available"
        description="No transcript is available for this session."
      />
    );
  }

  return (
    <FeedbackSectionCard
      title="Full Transcript"
      description="Complete conversation with timestamps and highlighted key moments"
      icon={<ScrollText className="h-5 w-5" />}
    >
      <div className="max-h-[600px] space-y-4 overflow-y-auto pr-2">
        {transcript.map((turn) => {
          const isUser = turn.speaker === "user";
          const timestamp = new Date(turn.timestamp).toLocaleTimeString(
            "en-US",
            {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }
          );

          return (
            <div
              key={turn.id}
              className={`group relative rounded-lg border p-4 transition-all duration-300 ${
                turn.highlighted
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/50 hover:border-border"
              }`}
            >
              {/* Highlight indicator */}
              {turn.highlighted && (
                <div className="absolute top-1/2 -left-1 -translate-y-1/2">
                  <Sparkles className="text-primary h-4 w-4" />
                </div>
              )}

              {/* Speaker header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isUser ? (
                    <User className="text-primary h-4 w-4" />
                  ) : (
                    <Bot className="text-chart-2 h-4 w-4" />
                  )}
                  <Badge
                    variant={isUser ? "default" : "secondary"}
                    className={
                      isUser
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-chart-2/20 bg-chart-2/10 text-chart-2"
                    }
                  >
                    {isUser ? "You" : "Interviewer"}
                  </Badge>
                </div>
                <span className="text-muted-foreground font-mono text-xs">
                  {timestamp}
                </span>
              </div>

              {/* Transcript text */}
              <p className="text-foreground pl-6 text-sm leading-relaxed">
                {turn.text}
              </p>

              {/* Highlight label */}
              {turn.highlighted && (
                <div className="mt-3 pl-6">
                  <span className="text-primary/70 text-xs italic">
                    Referenced in feedback
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </FeedbackSectionCard>
  );
}
