"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

import { FeedbackSectionCard } from "./feedback-surface";
import { Button } from "@/components/ui/button";
import type { FeedbackEvidence } from "@meelni/core";

export interface FeedbackTranscriptTurn {
  id: string;
  speaker: "user" | "interviewer";
  startedAt: string | null;
  text: string | null;
  eventId?: string | null;
}

interface TranscriptResponse {
  turns: FeedbackTranscriptTurn[];
}

export function useEvidenceTranscript(sessionId: string) {
  const [expanded, setExpanded] = useState(false);
  const [turns, setTurns] = useState<FeedbackTranscriptTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [pendingTurnRef, setPendingTurnRef] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    if (!expanded || turns.length > 0) return;
    let active = true;
    setLoading(true);
    setLoaded(false);
    setError(null);
    fetch(`/api/transcript/${sessionId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Transcript could not be loaded.");
        return (await response.json()) as TranscriptResponse;
      })
      .then((response) => {
        if (active) {
          setTurns(Array.isArray(response.turns) ? response.turns : []);
        }
      })
      .catch((fetchError) => {
        if (active) setError(getErrorMessage(fetchError));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [expanded, requestVersion, sessionId, turns.length]);

  useEffect(() => {
    if (!pendingTurnRef || !loaded || loading || error) return;
    const matchingTurn = findTranscriptTurnReference(turns, pendingTurnRef);
    if (!matchingTurn) {
      setNavigationError(
        "The cited answer is not available in this transcript view."
      );
      setPendingTurnRef(null);
      return;
    }
    const target = document.getElementById(
      transcriptTurnId(matchingTurn.eventId || matchingTurn.id)
    );
    if (!target) {
      setNavigationError("The cited answer could not be focused in this view.");
      setPendingTurnRef(null);
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
    setNavigationError(null);
    setPendingTurnRef(null);
  }, [error, loaded, loading, pendingTurnRef, turns]);

  return {
    expanded,
    setExpanded,
    turns,
    loading,
    error,
    navigationError,
    selectEvidence(evidence: FeedbackEvidence) {
      setNavigationError(null);
      setExpanded(true);
      setPendingTurnRef(evidence.turnRef);
    },
    retry() {
      setError(null);
      setNavigationError(null);
      setLoaded(false);
      setRequestVersion((version) => version + 1);
    },
  };
}

export function FeedbackTranscriptSection({
  expanded,
  onExpandedChange,
  loading,
  error,
  navigationError,
  turns,
  onRetry,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  loading: boolean;
  error: string | null;
  navigationError: string | null;
  turns: FeedbackTranscriptTurn[];
  onRetry: () => void;
}) {
  const contentId = "feedback-transcript-content";
  return (
    <FeedbackSectionCard
      title="Interview transcript"
      icon={<MessageSquare className="h-5 w-5" aria-hidden="true" />}
      action={
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? (
            <ChevronUp className="mr-2 h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {expanded ? "Collapse" : "Expand"}
        </Button>
      }
    >
      <div id={contentId}>
        {expanded && loading && (
          <p
            role="status"
            className="text-muted-foreground flex items-center gap-2 py-6"
          >
            <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            Loading transcript
          </p>
        )}
        {expanded && error && (
          <div role="alert" className="space-y-3 py-6">
            <p className="text-destructive">{error}</p>
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Retry transcript
            </Button>
          </div>
        )}
        {expanded && navigationError && !error && (
          <p role="alert" className="text-warning py-4">
            {navigationError}
          </p>
        )}
        {expanded && !loading && !error && turns.length === 0 && (
          <p className="text-muted-foreground py-6">
            No transcript is available for this interview.
          </p>
        )}
        {expanded && turns.length > 0 && (
          <ol className="space-y-4">
            {turns.map((turn) => (
              <li
                id={transcriptTurnId(turn.eventId || turn.id)}
                key={turn.id}
                tabIndex={-1}
                className="focus-visible:ring-ring min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <div
                  className={`max-w-message-bubble rounded-lg px-4 py-3 wrap-anywhere ${
                    turn.speaker === "user"
                      ? "bg-primary/10 ml-auto"
                      : "bg-muted"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold tracking-wide uppercase">
                      {turn.speaker === "user" ? "You" : "Interviewer"}
                    </span>
                    {formatTranscriptTimestamp(turn.startedAt) && (
                      <span className="text-muted-foreground text-xs">
                        {formatTranscriptTimestamp(turn.startedAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-6 whitespace-pre-wrap">
                    {turn.text || "No text recorded"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </FeedbackSectionCard>
  );
}

export function findTranscriptTurnReference(
  turns: FeedbackTranscriptTurn[],
  reference: string
): FeedbackTranscriptTurn | null {
  return (
    turns.find((turn) => turn.eventId === reference || turn.id === reference) ??
    null
  );
}

export function formatTranscriptTimestamp(timestamp: string | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function transcriptTurnId(reference: string): string {
  return `feedback-transcript-${encodeURIComponent(reference)}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Transcript could not be loaded.";
}
