"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { User, Bot } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface TranscriptTurn {
  eventId?: string;
  rowId?: string;
  speaker: "user" | "interviewer";
  text: string;
  timestamp: Date;
}

interface TranscriptPanelProps {
  turns: TranscriptTurn[];
}

export function TranscriptPanel({ turns }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    // Auto-scroll to bottom on new turn
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center">
        <div className="text-center">
          <Bot className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p className="text-sm">Conversation transcript will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      data-ph-no-capture
      className="scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent h-full space-y-4 overflow-y-auto p-6"
    >
      <AnimatePresence mode="popLayout">
        {turns.map((turn, index) => (
          <motion.div
            key={
              turn.rowId ??
              turn.eventId ??
              `legacy:${turn.speaker}:${turn.timestamp.toISOString()}:${index}`
            }
            initial={prefersReducedMotion ? false : { y: 20 }}
            animate={{ y: 0 }}
            exit={prefersReducedMotion ? undefined : { scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`flex gap-3 ${
              turn.speaker === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {/* Avatar */}
            <div
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                turn.speaker === "user"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {turn.speaker === "user" ? (
                <User className="h-4 w-4" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
            </div>

            {/* Message bubble */}
            <div
              className={`max-w-message-bubble flex-1 ${
                turn.speaker === "user" ? "items-end" : "items-start"
              } flex flex-col gap-1`}
            >
              <div
                className={`rounded-2xl px-4 py-2.5 ${
                  turn.speaker === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {turn.text}
                </p>
              </div>
              <span className="text-muted-foreground px-2 text-xs">
                {formatDistanceToNow(new Date(turn.timestamp), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
