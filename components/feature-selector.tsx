"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

export const FeatureSelector: React.FC<FeatureSelectorProps> = ({
  features,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState<number>(0);
  const [currentCharIndex, setCurrentCharIndex] = useState<number>(0);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    // Guard: Skip if features aren't loaded yet
    if (!features || features.length === 0 || !features[selectedIndex]) {
      return;
    }

    const plainText = getPlainText(features[selectedIndex].code);
    const messages = parseMessages(plainText);

    setDisplayedMessages([]);
    setCurrentMessageIndex(0);
    setCurrentCharIndex(0);
    setIsTyping(true);

    let msgIndex = 0;
    let charIndex = 0;
    const typingSpeed = 10; // milliseconds per character

    const typeInterval = setInterval(() => {
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
  }, [selectedIndex, features]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Tab Selector with Sliding Animation */}
      <div className="relative mb-8">
        <div className="flex flex-wrap gap-3 justify-center">
          {features.map((option, index) => (
            <button
              key={option.id}
              onClick={() => setSelectedIndex(index)}
              className={`relative px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                selectedIndex === index
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {selectedIndex === index && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-primary/10 border-2 border-primary rounded-lg"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{option.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Terminal/Script Area - Only This Has Border */}
      <div className="relative rounded-xl border-2 border-border bg-background shadow-lg overflow-hidden">
        <div
          ref={scrollRef}
          className="p-6 overflow-y-auto scroll-smooth h-[440px] font-mono"
        >
          <AnimatePresence mode="wait">
            <div key={selectedIndex} className="space-y-3">
              {displayedMessages.map((message, index) => {
                const isLastMessage = index === displayedMessages.length - 1;

                if (message.type === "checkpoint") {
                  return (
                    <motion.div
                      key={`${selectedIndex}-${index}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="my-3 flex justify-center"
                    >
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/30 dark:border-amber-400/30 text-xs font-medium text-amber-600 dark:text-amber-400">
                        {message.content}
                      </span>
                    </motion.div>
                  );
                }

                if (message.type === "interviewer") {
                  return (
                    <motion.div
                      key={`${selectedIndex}-${index}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="leading-relaxed"
                    >
                      <span className="text-cyan-500 dark:text-cyan-400">Interviewer:</span>{" "}
                      <span className="text-foreground">
                        {message.content}
                        {isLastMessage && isTyping && (
                          <motion.span
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                            className="inline-block w-1.5 h-4 bg-cyan-500 dark:bg-cyan-400 ml-1 align-middle"
                          />
                        )}
                      </span>
                    </motion.div>
                  );
                }

                if (message.type === "you") {
                  return (
                    <motion.div
                      key={`${selectedIndex}-${index}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="leading-relaxed"
                    >
                      <span className="text-green-500 dark:text-green-400">You:</span>{" "}
                      <span className="text-foreground">
                        {message.content}
                        {isLastMessage && isTyping && (
                          <motion.span
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                            className="inline-block w-1.5 h-4 bg-green-500 dark:bg-green-400 ml-1 align-middle"
                          />
                        )}
                      </span>
                    </motion.div>
                  );
                }
              })}
            </div>
          </AnimatePresence>
        </div>
        {/* Fade gradient overlays */}
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-background to-transparent" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent" />
      </div>
    </div>
  );
};
