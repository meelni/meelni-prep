"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  FolderOpen,
  Play,
  Trash2,
  Loader2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PracticeSet {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
}

interface PracticeSetsListProps {
  onSelectSet: (setId: string) => void;
  refreshTrigger?: number;
}

export function PracticeSetsList({ onSelectSet, refreshTrigger }: PracticeSetsListProps) {
  const [sets, setSets] = useState<PracticeSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);

  useEffect(() => {
    fetchSets();
  }, [refreshTrigger]);

  const fetchSets = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/practice-sets");
      const data = await res.json();
      setSets(data.sets || []);
    } catch (error) {
      console.error("Error fetching practice sets:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (setId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this practice set? This action cannot be undone.")) {
      return;
    }

    try {
      setDeletingSetId(setId);
      const res = await fetch(`/api/practice-sets/${setId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete practice set");
      }

      // Remove from local state
      setSets((prev) => prev.filter((s) => s.id !== setId));
    } catch (error) {
      console.error("Error deleting practice set:", error);
      alert("Failed to delete practice set. Please try again.");
    } finally {
      setDeletingSetId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading practice sets...</p>
        </div>
      </div>
    );
  }

  if (sets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
          <FolderOpen className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          No practice sets yet
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          Create practice sets to organize questions for specific interview targets or topics.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {sets.map((set) => (
        <button
          key={set.id}
          onClick={() => onSelectSet(set.id)}
          className={cn(
            "group relative p-5 rounded-lg border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200 text-left",
            "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          )}
        >
          {/* Content */}
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FolderOpen className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {set.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {set.questionCount} {set.questionCount === 1 ? "question" : "questions"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Delete Button */}
              <button
                onClick={(e) => handleDelete(set.id, e)}
                disabled={deletingSetId === set.id}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                aria-label="Delete practice set"
              >
                {deletingSetId === set.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Description */}
            {set.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {set.description}
              </p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>Updated {new Date(set.updatedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                <span>View</span>
                <Play className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
