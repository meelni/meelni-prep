"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { User, Bot } from "lucide-react";
import { groupTranscriptTurns } from "./transcript-display";

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
  const isPinnedToBottomRef = useRef(true);
  const prefersReducedMotion = useReducedMotion();
  const displayTurns = groupTranscriptTurns(turns);

  useEffect(() => {
    if (scrollRef.current && isPinnedToBottomRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    }
  }, [displayTurns, prefersReducedMotion]);

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
      onScroll={(event) => {
        const target = event.currentTarget;
        isPinnedToBottomRef.current =
          target.scrollHeight - target.scrollTop - target.clientHeight < 48;
      }}
    >
      <AnimatePresence mode="popLayout">
        {displayTurns.map((turn) => (
          <motion.div
            key={turn.id}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
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
                <User className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Bot className="h-4 w-4" aria-hidden="true" />
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
                <span className="sr-only">
                  {turn.speaker === "user" ? "You: " : "Interviewer: "}
                </span>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {turn.text}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
