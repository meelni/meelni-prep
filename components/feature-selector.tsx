"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Target, TrendingUp, Users, Pause, Play, RotateCcw } from "lucide-react";

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
  type: "interviewer" | "you" | "checkpoint";
  content: string;
}

// Icon mapping for interview types
const interviewIcons = {
  "Product Sense": Lightbulb,
  "Product Execution": Target,
  "Product Strategy": TrendingUp,
  "Behavioral": Users,
};

export const FeatureSelector: React.FC<FeatureSelectorProps> = ({
  features,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState<number>(0);
  const [currentCharIndex, setCurrentCharIndex] = useState<number>(0);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isInView, setIsInView] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      } else if (line.startsWith("[Framework checkpoint:") || line.startsWith("[STAR:") || line.startsWith("[Strategic")) {
        messages.push({
          type: "checkpoint",
          content: line.replace(/[\[\]]/g, "").trim(),
        });
      }
    }

    return messages;
  };

  // Intersection Observer - only animate when in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.3 } // Trigger when 30% visible
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, []);

  // Reset animation when tab changes
  const resetAnimation = () => {
    setDisplayedMessages([]);
    setCurrentMessageIndex(0);
    setCurrentCharIndex(0);
    setIsTyping(true);
    setIsPaused(false);
  };

  useEffect(() => {
    // Guard: Skip if features aren't loaded yet or not in view
    if (!features || features.length === 0 || !features[selectedIndex] || !isInView) {
      return;
    }

    const plainText = getPlainText(features[selectedIndex].code);
    const messages = parseMessages(plainText);

    resetAnimation();

    let msgIndex = 0;
    let charIndex = 0;
    const typingSpeed = 8; // milliseconds per character (slightly faster)

    const typeInterval = setInterval(() => {
      if (isPaused) return; // Pause functionality

      if (msgIndex < messages.length) {
        const currentMessage = messages[msgIndex];

        if (charIndex < currentMessage.content.length) {
          // Still typing current message
          charIndex++;
          setCurrentCharIndex(charIndex);
          setDisplayedMessages([
            ...messages.slice(0, msgIndex),
            { ...currentMessage, content: currentMessage.content.substring(0, charIndex) }
          ]);

          // Auto-scroll to bottom
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        } else {
          // Move to next message
          msgIndex++;
          charIndex = 0;
          setCurrentMessageIndex(msgIndex);
          setCurrentCharIndex(0);
        }
      } else {
        setIsTyping(false);
        clearInterval(typeInterval);
      }
    }, typingSpeed);

    return () => clearInterval(typeInterval);
  }, [selectedIndex, features, isInView, isPaused]);

  return (
    <div ref={containerRef} className="max-w-6xl mx-auto">
      {/* Enhanced Tab Selector with Icons */}
      <div className="relative mb-8">
        <div className="flex flex-wrap gap-3 justify-center">
          {features.map((option, index) => {
            const Icon = interviewIcons[option.title as keyof typeof interviewIcons];
            return (
              <button
                key={option.id}
                onClick={() => setSelectedIndex(index)}
                className={`group relative px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                  selectedIndex === index
                    ? "text-primary scale-105"
                    : "text-muted-foreground hover:text-foreground hover:scale-102"
                }`}
              >
                {selectedIndex === index && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-2 border-primary/50 rounded-xl shadow-lg shadow-primary/20"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {Icon && <Icon className="w-4 h-4" />}
                  {option.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Progress indicator */}
        {isTyping && (
          <motion.div
            className="absolute -bottom-2 left-0 right-0 h-0.5 bg-primary/30 rounded-full overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 15, ease: "linear" }}
            />
          </motion.div>
        )}
      </div>

      {/* Modern Chat Interface */}
      <div className="relative rounded-2xl border border-border/60 bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-md shadow-2xl overflow-hidden">
        {/* Playback Controls */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border/60 bg-background/40 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="p-2 rounded-lg hover:bg-primary/10 transition-colors"
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <Play className="w-4 h-4 text-primary" />
              ) : (
                <Pause className="w-4 h-4 text-primary" />
              )}
            </button>
            <button
              onClick={resetAnimation}
              className="p-2 rounded-lg hover:bg-primary/10 transition-colors"
              title="Restart"
            >
              <RotateCcw className="w-4 h-4 text-primary" />
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div
          ref={scrollRef}
          className="p-6 overflow-y-auto scroll-smooth h-[500px] bg-gradient-to-b from-background/5 to-transparent"
        >
          <AnimatePresence mode="wait">
            <div key={selectedIndex} className="space-y-4">
              {displayedMessages.map((message, index) => {
                const isLastMessage = index === displayedMessages.length - 1;

                if (message.type === "checkpoint") {
                  return (
                    <motion.div
                      key={`${selectedIndex}-${index}`}
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.3, type: "spring" }}
                      className="flex justify-center my-4"
                    >
                      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/40 text-sm font-medium text-amber-400 shadow-lg shadow-amber-500/10">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        {message.content}
                      </span>
                    </motion.div>
                  );
                }

                if (message.type === "interviewer") {
                  return (
                    <motion.div
                      key={`${selectedIndex}-${index}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-start gap-3"
                    >
                      {/* Interviewer Avatar */}
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-semibold shadow-lg shadow-cyan-500/30">
                        M
                      </div>
                      {/* Message Bubble */}
                      <div className="flex-1 max-w-[80%]">
                        <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 shadow-lg">
                          <p className="text-sm leading-relaxed text-foreground">
                            {message.content}
                            {isLastMessage && isTyping && (
                              <motion.span
                                animate={{ opacity: [1, 0.3, 1] }}
                                transition={{ duration: 1, repeat: Infinity }}
                                className="inline-block w-1.5 h-4 bg-cyan-400 ml-1.5 rounded-sm align-middle"
                              />
                            )}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                if (message.type === "you") {
                  return (
                    <motion.div
                      key={`${selectedIndex}-${index}`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-start gap-3 justify-end"
                    >
                      {/* Message Bubble */}
                      <div className="flex-1 max-w-[80%] flex justify-end">
                        <div className="px-4 py-3 rounded-2xl rounded-tr-sm bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/40 shadow-lg shadow-primary/10">
                          <p className="text-sm leading-relaxed text-foreground">
                            {message.content}
                            {isLastMessage && isTyping && (
                              <motion.span
                                animate={{ opacity: [1, 0.3, 1] }}
                                transition={{ duration: 1, repeat: Infinity }}
                                className="inline-block w-1.5 h-4 bg-primary ml-1.5 rounded-sm align-middle"
                              />
                            )}
                          </p>
                        </div>
                      </div>
                      {/* Your Avatar */}
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-semibold shadow-lg shadow-primary/30">
                        U
                      </div>
                    </motion.div>
                  );
                }
              })}
            </div>
          </AnimatePresence>
        </div>

        {/* Gradient Overlays for depth */}
        <div className="pointer-events-none absolute top-[60px] left-0 right-0 h-20 bg-gradient-to-b from-background/20 to-transparent" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background/40 to-transparent" />
      </div>

      {/* Helper Text */}
      {!isInView && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm text-muted-foreground mt-4"
        >
          Scroll to view the conversation
        </motion.p>
      )}
    </div>
  );
};
