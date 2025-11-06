"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText, User, Bot, Sparkles } from "lucide-react";
import type { TranscriptTurn } from "@/lib/types/feedback";

interface TranscriptViewerProps {
  transcript: TranscriptTurn[];
}

export function TranscriptViewer({ transcript }: TranscriptViewerProps) {
  if (transcript.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8 text-center">
          <ScrollText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            No transcript available for this session
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-primary" />
          <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
            Full Transcript
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Complete conversation with timestamps and highlighted key moments
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {transcript.map((turn) => {
            const isUser = turn.speaker === "user";
            const timestamp = new Date(turn.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });

            return (
              <div
                key={turn.id}
                className={`group relative border rounded-lg p-4 transition-all duration-300 ${
                  turn.highlighted
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/50 hover:border-border"
                }`}
              >
                {/* Highlight indicator */}
                {turn.highlighted && (
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                )}

                {/* Speaker header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {isUser ? (
                      <User className="w-4 h-4 text-primary" />
                    ) : (
                      <Bot className="w-4 h-4 text-chart-2" />
                    )}
                    <Badge
                      variant={isUser ? "default" : "secondary"}
                      className={
                        isUser
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-chart-2/10 text-chart-2 border-chart-2/20"
                      }
                    >
                      {isUser ? "You" : "Interviewer"}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {timestamp}
                  </span>
                </div>

                {/* Transcript text */}
                <p className="text-sm text-foreground leading-relaxed pl-6">
                  {turn.text}
                </p>

                {/* Highlight label */}
                {turn.highlighted && (
                  <div className="mt-3 pl-6">
                    <span className="text-xs text-primary/70 italic">
                      Referenced in feedback
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
