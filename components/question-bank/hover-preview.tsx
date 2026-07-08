"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  company: string | null;
  questionText: string;
  questionType: string;
  askedAt: Date | null;
}

interface HoverPreviewProps {
  question: Question;
  children: React.ReactNode;
  badgeClassName?: string;
}

export function HoverPreview({
  question,
  children,
  badgeClassName,
}: HoverPreviewProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const hideTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    // Clear any existing hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }

    // Calculate position relative to viewport
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({
        x: rect.left,
        y: rect.bottom + 8, // 8px below the element
      });
    }

    // Show after 300ms delay
    timeoutRef.current = setTimeout(() => {
      setShowPreview(true);
    }, 300);
  };

  const handleMouseLeave = () => {
    // Clear show timeout if mouse leaves before delay
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Hide after 200ms delay
    hideTimeoutRef.current = setTimeout(() => {
      setShowPreview(false);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>

      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{
              position: "fixed",
              left: position.x,
              top: position.y,
              maxWidth: "400px",
              zIndex: 100,
            }}
            className="bg-popover border-border shadow-primary/5 pointer-events-none rounded-lg border p-4 shadow-xl"
            onMouseEnter={handleMouseLeave} // Hide if mouse enters tooltip
          >
            {/* Full question text */}
            <p className="text-foreground mb-3 text-sm leading-relaxed">
              {question.questionText}
            </p>

            {/* Metadata */}
            <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
              {/* Company */}
              {question.company && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 opacity-60" />
                  <span>{question.company}</span>
                </div>
              )}

              {/* Date */}
              {question.askedAt && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 opacity-60" />
                  <span>
                    {new Date(question.askedAt).toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}

              {/* Type badge */}
              <Badge variant="subtle" className={cn("text-xs", badgeClassName)}>
                {question.questionType}
              </Badge>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
