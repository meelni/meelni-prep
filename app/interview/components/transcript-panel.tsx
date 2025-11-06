"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Bot } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface TranscriptTurn {
  speaker: "user" | "interviewer";
  text: string;
  timestamp: Date;
}

interface TranscriptPanelProps {
  turns: TranscriptTurn[];
}

export function TranscriptPanel({ turns }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">Conversation transcript will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent p-6 space-y-4"
    >
      <AnimatePresence mode="popLayout">
        {turns.map((turn, index) => (
          <motion.div
            key={`${turn.speaker}-${index}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`flex gap-3 ${
              turn.speaker === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {/* Avatar */}
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                turn.speaker === "user"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {turn.speaker === "user" ? (
                <User className="w-4 h-4" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </div>

            {/* Message bubble */}
            <div
              className={`flex-1 max-w-[80%] ${
                turn.speaker === "user" ? "items-end" : "items-start"
              } flex flex-col gap-1`}
            >
              <div
                className={`px-4 py-2.5 rounded-2xl ${
                  turn.speaker === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {turn.text}
                </p>
              </div>
              <span className="text-xs text-muted-foreground px-2">
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
