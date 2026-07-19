"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface FeatureOption {
  id: number;
  title: string;
  description: string;
  code: string;
}

interface FeatureSelectorProps {
  features: FeatureOption[];
}

interface Message {
  type: "interviewer" | "you";
  content: string;
}

// Icon mapping for interview types
const interviewIcons = {
  "Product Sense": Lightbulb,
  "Product Execution": Target,
  "Product Strategy": TrendingUp,
  Behavioral: Users,
};

// Extract plain text from HTML
const getPlainText = (html: string): string => {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
};

// Parse the conversation into structured messages
const parseMessages = (text: string): Message[] => {
  const lines = text.split("\n").filter((line) => line.trim());
  const messages: Message[] = [];

  for (const line of lines) {
    if (line.startsWith("🎯 Interviewer:")) {
      messages.push({
        type: "interviewer",
        content: line.replace("🎯 Interviewer:", "").replace(/"/g, "").trim(),
      });
    } else if (line.startsWith("👤 You:")) {
      messages.push({
        type: "you",
        content: line.replace("👤 You:", "").replace(/"/g, "").trim(),
      });
    }
  }

  return messages;
};

export const FeatureSelector: React.FC<FeatureSelectorProps> = ({
  features,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPausedRef = useRef<boolean>(false);
  const messageIndexRef = useRef<number>(0);
  const charIndexRef = useRef<number>(0);

  // Start or restart the typing animation
  const startTyping = useCallback(() => {
    if (!features || features.length === 0 || !features[selectedIndex]) {
      return;
    }

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const plainText = getPlainText(features[selectedIndex].code);
    const messages = parseMessages(plainText);

    // Reset state
    messageIndexRef.current = 0;
    charIndexRef.current = 0;
    setDisplayedMessages([]);
    setIsTyping(true);
    isPausedRef.current = false;
    setIsPaused(false);

    const typingSpeed = 24;
    const charsPerTick = 2;

    intervalRef.current = setInterval(() => {
      if (isPausedRef.current) return;

      const msgIndex = messageIndexRef.current;
      const charIndex = charIndexRef.current;

      if (msgIndex < messages.length) {
        const currentMessage = messages[msgIndex];

        if (charIndex < currentMessage.content.length) {
          const nextCharIndex = Math.min(
            charIndex + charsPerTick,
            currentMessage.content.length
          );

          charIndexRef.current = nextCharIndex;
          setDisplayedMessages([
            ...messages.slice(0, msgIndex),
            {
              ...currentMessage,
              content: currentMessage.content.substring(0, nextCharIndex),
            },
          ]);

          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        } else {
          // Move to next message
          messageIndexRef.current++;
          charIndexRef.current = 0;
        }
      } else {
        setIsTyping(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      }
    }, typingSpeed);
  }, [features, selectedIndex]);

  // Handle pause/resume
  const togglePause = () => {
    isPausedRef.current = !isPausedRef.current;
    setIsPaused(isPausedRef.current);
  };

  // Handle reset
  const handleReset = () => {
    startTyping();
  };

  // Start the example once on load and when the selected interview type changes.
  useEffect(() => {
    startTyping();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startTyping]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Enhanced Tab Selector with Icons */}
      <div className="relative mb-8">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-4">
          {features.map((option, index) => {
            const Icon =
              interviewIcons[option.title as keyof typeof interviewIcons];
            return (
              <Button
                key={option.id}
                variant="ghost"
                onClick={() => setSelectedIndex(index)}
                className={`group relative h-auto rounded-xl px-4 py-3 font-medium transition-all duration-300 hover:bg-transparent ${
                  selectedIndex === index
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {selectedIndex === index && (
                  <motion.div
                    layoutId="activeTab"
                    className="from-primary/15 via-primary/10 to-primary/5 border-primary/50 shadow-primary/20 absolute inset-0 rounded-xl border-2 bg-gradient-to-br shadow-lg"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center gap-2 text-sm md:text-base">
                  {Icon && <Icon className="h-4 w-4" />}
                  <span className="whitespace-nowrap">{option.title}</span>
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Modern Chat Interface */}
      <div className="border-border/60 from-card/50 to-card/30 relative overflow-hidden rounded-2xl border bg-gradient-to-br shadow-2xl backdrop-blur-md">
        {/* Playback Controls */}
        <div className="border-border/60 bg-background/40 flex items-center justify-between border-b px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="bg-destructive/80 h-3 w-3 rounded-full" />
            <div className="bg-warning/80 h-3 w-3 rounded-full" />
            <div className="bg-success/80 h-3 w-3 rounded-full" />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePause}
              className="text-primary hover:bg-primary/10 hover:text-primary h-8 w-8 rounded-lg"
              title={isPaused ? "Resume" : "Pause"}
              aria-label={
                isPaused ? "Resume example playback" : "Pause example playback"
              }
            >
              {isPaused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleReset}
              className="text-primary hover:bg-primary/10 hover:text-primary h-8 w-8 rounded-lg"
              title="Restart"
              aria-label="Restart example playback"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Terminal-style conversation */}
        <div
          ref={scrollRef}
          className="h-[500px] overflow-y-auto p-6 font-mono text-sm"
        >
          <div key={selectedIndex} className="space-y-3">
            {displayedMessages.map((message, index) => {
              const isLastMessage = index === displayedMessages.length - 1;

              if (message.type === "interviewer") {
                return (
                  <div key={index} className="leading-relaxed">
                    <span className="text-info font-semibold">
                      Interviewer:
                    </span>{" "}
                    <span className="text-foreground">
                      {message.content}
                      {isLastMessage && isTyping && (
                        <motion.span
                          animate={{ opacity: [1, 0, 1] }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                          className="bg-info ml-1 inline-block h-4 w-1.5 align-middle"
                        />
                      )}
                    </span>
                  </div>
                );
              }

              if (message.type === "you") {
                return (
                  <div key={index} className="leading-relaxed">
                    <span className="text-primary font-semibold">You:</span>{" "}
                    <span className="text-foreground">
                      {message.content}
                      {isLastMessage && isTyping && (
                        <motion.span
                          animate={{ opacity: [1, 0, 1] }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                          className="bg-primary ml-1 inline-block h-4 w-1.5 align-middle"
                        />
                      )}
                    </span>
                  </div>
                );
              }
            })}
          </div>
        </div>

        {/* Gradient Overlays for depth */}
        <div className="from-background/20 pointer-events-none absolute top-[60px] right-0 left-0 h-20 bg-gradient-to-b to-transparent" />
        <div className="from-background/40 pointer-events-none absolute right-0 bottom-0 left-0 h-20 bg-gradient-to-t to-transparent" />
      </div>
    </div>
  );
};
