"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Bookmark, FolderPlus, X } from "lucide-react";

interface BulkActionToolbarProps {
  selectedCount: number;
  onBookmark: () => void;
  onCreatePracticeSet: () => void;
  onDeselectAll: () => void;
}

export function BulkActionToolbar({
  selectedCount,
  onBookmark,
  onCreatePracticeSet,
  onDeselectAll,
}: BulkActionToolbarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-6 left-[280px] right-0 mx-auto w-fit px-4 md:px-6 py-4 rounded-xl bg-card/95 backdrop-blur-xl border border-border shadow-xl shadow-primary/10 flex flex-col sm:flex-row items-center gap-3 md:gap-4 z-10 max-w-[calc(100vw-2rem)] md:max-w-none"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {selectedCount} question{selectedCount !== 1 ? "s" : ""} selected
            </span>
          </div>

          <div className="hidden sm:block h-6 w-px bg-border" />

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              size="sm"
              variant="default"
              onClick={onBookmark}
              className="gap-2 min-h-11 w-full sm:w-auto"
            >
              <Bookmark className="w-4 h-4" />
              Bookmark
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={onCreatePracticeSet}
              className="gap-2 min-h-11 w-full sm:w-auto"
            >
              <FolderPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Create Practice Set</span>
              <span className="sm:hidden">Practice Set</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={onDeselectAll}
              className="gap-2 min-h-11 w-full sm:w-auto"
            >
              <X className="w-4 h-4" />
              Deselect All
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
