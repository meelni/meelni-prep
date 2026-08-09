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
          style={{
            left: "var(--question-bank-toolbar-offset, 280px)",
            maxWidth: "calc(100vw - 2rem)",
          }}
          className="border-border bg-card/95 shadow-primary/10 fixed right-0 bottom-6 z-10 mx-auto flex w-fit flex-col items-center gap-3 rounded-xl border px-4 py-4 shadow-xl backdrop-blur-xl sm:flex-row md:gap-4 md:px-6"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <div className="flex items-center gap-2">
            <span className="text-foreground text-sm font-medium">
              {selectedCount} question{selectedCount !== 1 ? "s" : ""} selected
            </span>
          </div>

          <div className="bg-border hidden h-6 w-px sm:block" />

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              size="sm"
              variant="default"
              onClick={onBookmark}
              className="min-h-11 w-full gap-2 sm:w-auto"
            >
              <Bookmark className="h-4 w-4" />
              Bookmark
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={onCreatePracticeSet}
              className="min-h-11 w-full gap-2 sm:w-auto"
            >
              <FolderPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Create Practice Set</span>
              <span className="sm:hidden">Practice Set</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={onDeselectAll}
              className="min-h-11 w-full gap-2 sm:w-auto"
            >
              <X className="h-4 w-4" />
              Deselect All
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
