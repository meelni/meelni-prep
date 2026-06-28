"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardActionCard } from "@/components/dashboard/dashboard-surface";
import { FolderOpen, Play, Trash2, Loader2, Clock } from "lucide-react";

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

export function PracticeSetsList({
  onSelectSet,
  refreshTrigger,
}: PracticeSetsListProps) {
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

    if (
      !confirm(
        "Are you sure you want to delete this practice set? This action cannot be undone."
      )
    ) {
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
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm">
            Loading practice sets...
          </p>
        </div>
      </div>
    );
  }

  if (sets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="bg-muted/30 mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <FolderOpen className="text-muted-foreground h-8 w-8" />
        </div>
        <h3 className="text-foreground mb-2 text-lg font-medium">
          No practice sets yet
        </h3>
        <p className="text-muted-foreground mb-6 max-w-sm text-sm">
          Create practice sets to organize questions for specific interview
          targets or topics.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sets.map((set) => (
        <DashboardActionCard
          key={set.id}
          icon={<FolderOpen className="h-5 w-5" />}
          title={set.name}
          description={
            set.description ||
            "A focused set of questions for targeted interview practice."
          }
          className="group p-5"
          action={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => onSelectSet(set.id)}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                View
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={(e) => handleDelete(set.id, e)}
                disabled={deletingSetId === set.id}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-9 w-9 disabled:opacity-50"
                aria-label="Delete practice set"
              >
                {deletingSetId === set.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <Badge variant="secondary" className="text-xs">
              {set.questionCount}{" "}
              {set.questionCount === 1 ? "question" : "questions"}
            </Badge>

            <div className="border-border/50 flex items-center justify-between border-t pt-2">
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  Updated {new Date(set.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="text-primary flex items-center gap-1 text-xs opacity-0 transition-opacity group-hover:opacity-100">
                <span>View</span>
                <Play className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </DashboardActionCard>
      ))}
    </div>
  );
}
