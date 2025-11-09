"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const QUESTION_TYPES = [
  "All Types",
  "Behavioral",
  "Product Sense",
  "Execution",
  "Product Strategy",
];

interface MobileFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedType: string;
  onSelectType: (type: string) => void;
  onClearAll: () => void;
}

export function MobileFilterDrawer({
  isOpen,
  onClose,
  selectedType,
  onSelectType,
  onClearAll,
}: MobileFilterDrawerProps) {
  const handleApply = () => {
    onClose();
  };

  const handleClearAndClose = () => {
    onClearAll();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop overlay with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
            className="fixed inset-x-0 bottom-0 h-[60vh] bg-card border-t border-border rounded-t-2xl z-50 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-drawer-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
              <h2
                id="filter-drawer-title"
                className="text-lg font-semibold text-foreground"
              >
                Filters
              </h2>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted/50 transition-colors"
                aria-label="Close filters"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
              {/* Question Type Filter */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Question Type
                </h3>
                <div className="space-y-2">
                  {QUESTION_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => onSelectType(type)}
                      className={cn(
                        "w-full px-4 py-3 rounded-lg text-sm font-medium text-left transition-all duration-150 min-h-[48px] flex items-center",
                        selectedType === type
                          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                          : "bg-muted/30 text-foreground hover:bg-muted/50"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer with action buttons */}
            <div className="px-4 py-4 border-t border-border shrink-0 flex gap-3">
              <Button
                variant="outline"
                onClick={handleClearAndClose}
                className="flex-1 h-12"
              >
                Clear All
              </Button>
              <Button onClick={handleApply} className="flex-1 h-12">
                Apply Filters
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
