"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, FolderPlus, Loader2 } from "lucide-react";

interface PracticeSetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedQuestionIds: string[];
  onSuccess: () => void;
}

export function PracticeSetDialog({
  isOpen,
  onClose,
  selectedQuestionIds,
  onSuccess,
}: PracticeSetDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Practice set name is required");
      return;
    }

    try {
      setIsSubmitting(true);

      // Create the practice set
      const createRes = await fetch("/api/practice-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!createRes.ok) {
        throw new Error("Failed to create practice set");
      }

      const { set } = await createRes.json();

      // Add selected questions to the set
      if (selectedQuestionIds.length > 0) {
        await Promise.all(
          selectedQuestionIds.map((questionId) =>
            fetch(`/api/practice-sets/${set.id}/questions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ questionId }),
            })
          )
        );
      }

      // Reset form and close dialog
      setName("");
      setDescription("");
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error creating practice set:", err);
      setError("Failed to create practice set. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FolderPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-display font-medium text-foreground">
                Create Practice Set
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedQuestionIds.length > 0
                  ? `Add ${selectedQuestionIds.length} selected question${selectedQuestionIds.length === 1 ? "" : "s"}`
                  : "Create an empty set"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name Input */}
          <div>
            <label htmlFor="set-name" className="block text-sm font-medium text-foreground mb-2">
              Name<span className="text-destructive ml-1">*</span>
            </label>
            <input
              id="set-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Meta Product Strategy Questions"
              className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
              maxLength={100}
              disabled={isSubmitting}
            />
          </div>

          {/* Description Input */}
          <div>
            <label htmlFor="set-description" className="block text-sm font-medium text-foreground mb-2">
              Description (optional)
            </label>
            <textarea
              id="set-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes about this practice set..."
              rows={3}
              className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150 resize-none"
              maxLength={500}
              disabled={isSubmitting}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()} className="gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="w-4 h-4" />
                  Create Set
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
