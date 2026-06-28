"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FolderPlus, Loader2 } from "lucide-react";

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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader className="pr-8">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
              <FolderPlus className="text-primary h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-display text-foreground text-lg font-medium">
                Create Practice Set
              </DialogTitle>
              <DialogDescription>
                {selectedQuestionIds.length > 0
                  ? `Add ${selectedQuestionIds.length} selected question${selectedQuestionIds.length === 1 ? "" : "s"}`
                  : "Create an empty set"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="set-name">
              Name<span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="set-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Meta Product Strategy Questions"
              maxLength={100}
              disabled={isSubmitting}
            />
          </div>

          {/* Description Input */}
          <div className="space-y-2">
            <Label htmlFor="set-description">Description (optional)</Label>
            <Textarea
              id="set-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes about this practice set..."
              rows={3}
              className="resize-none"
              maxLength={500}
              disabled={isSubmitting}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border-destructive/20 text-destructive rounded-lg border p-3 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <DialogFooter className="gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="h-4 w-4" />
                  Create Set
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
