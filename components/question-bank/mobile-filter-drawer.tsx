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
            className="bg-background/80 fixed inset-0 z-40 backdrop-blur-sm"
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
            className="bg-card border-border fixed inset-x-0 bottom-0 z-50 flex h-[60vh] flex-col rounded-t-2xl border-t"
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-drawer-title"
          >
            {/* Header */}
            <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-4">
              <h2
                id="filter-drawer-title"
                className="text-foreground text-lg font-semibold"
              >
                Filters
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-10 w-10 rounded-lg"
                aria-label="Close filters"
              >
                <X className="text-muted-foreground h-5 w-5" />
              </Button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
              {/* Question Type Filter */}
              <div>
                <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                  Question Type
                </h3>
                <div className="space-y-2">
                  {QUESTION_TYPES.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={selectedType === type ? "default" : "quiet"}
                      onClick={() => onSelectType(type)}
                      className={cn(
                        "flex min-h-[48px] w-full items-center justify-start rounded-lg px-4 py-3 text-left text-sm font-medium transition-all duration-150",
                        selectedType === type
                          ? "bg-primary text-primary-foreground shadow-primary/20 shadow-sm"
                          : "bg-muted/30 text-foreground hover:bg-muted/50"
                      )}
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer with action buttons */}
            <div className="border-border flex shrink-0 gap-3 border-t px-4 py-4">
              <Button
                variant="outline"
                onClick={handleClearAndClose}
                className="h-12 flex-1"
              >
                Clear All
              </Button>
              <Button onClick={handleApply} className="h-12 flex-1">
                Apply Filters
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
