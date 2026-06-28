import { useQuery } from "@tanstack/react-query";

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
    overallScore: string | null;
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
  list: (limit?: number) => [...sessionKeys.lists(), { limit }] as const,
  details: () => [...sessionKeys.all, "detail"] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
};

// ============================================================================
// API Fetchers
// ============================================================================

async function fetchSessions(limit?: number): Promise<SessionsResponse> {
  const url = limit ? `/api/sessions?limit=${limit}` : "/api/sessions";
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: ${response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// React Query Hooks
// ============================================================================

export function useSessions(limit?: number) {
  return useQuery({
    queryKey: sessionKeys.list(limit),
    queryFn: () => fetchSessions(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
