import { useQuery } from "@tanstack/react-query";
import type { DashboardFeedbackPresentationKind } from "@/lib/dashboard/feedback-presentation";

// ============================================================================
// TypeScript Types
// ============================================================================

export interface Session {
  id: string;
  userId: string;
  role: string;
  roundType: string;
  mode: string;
  persona?: string;
  livekitRoomName?: string;
  config?: Record<string, unknown>;
  startedAt: Date | string;
  endedAt: Date | string | null;
  createdAt?: Date | string;
  feedback?: {
    status: string | null;
    presentationKind: DashboardFeedbackPresentationKind;
    overallScore: string | null;
    structureScore?: number | string | null;
    clarityScore?: number | string | null;
    insightScore?: number | string | null;
    communicationScore?: number | string | null;
    leadershipScore?: number | string | null;
  };
}

export interface SessionsResponse {
  sessions: Session[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  stats: {
    totalSessions: number;
    totalMinutes: number;
    avgScore: number;
    completionRate: number;
  };
}

// ============================================================================
// Query Key Factory
// ============================================================================

export const sessionKeys = {
  all: ["sessions"] as const,
  lists: () => [...sessionKeys.all, "list"] as const,
  list: (limit?: number, offset = 0) =>
    [...sessionKeys.lists(), { limit, offset }] as const,
  details: () => [...sessionKeys.all, "detail"] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
};

// ============================================================================
// API Fetchers
// ============================================================================

export function buildSessionsRequestPath(limit?: number, offset = 0) {
  const searchParams = new URLSearchParams();
  if (limit !== undefined) searchParams.set("limit", String(limit));
  if (offset > 0) searchParams.set("offset", String(offset));
  const query = searchParams.toString();
  return query ? `/api/sessions?${query}` : "/api/sessions";
}

async function fetchSessions(
  limit?: number,
  offset = 0
): Promise<SessionsResponse> {
  const url = buildSessionsRequestPath(limit, offset);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: ${response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// React Query Hooks
// ============================================================================

export function useSessions(limit?: number, offset = 0) {
  return useQuery({
    queryKey: sessionKeys.list(limit, offset),
    queryFn: () => fetchSessions(limit, offset),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
