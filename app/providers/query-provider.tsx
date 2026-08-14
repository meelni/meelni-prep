"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/providers/auth-provider";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: true,
            staleTime: 5 * 60 * 1000, // 5 minutes
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <PrivateQueryAccountBoundary queryClient={queryClient} />
      {children}
    </QueryClientProvider>
  );
}

function PrivateQueryAccountBoundary({
  queryClient,
}: {
  queryClient: QueryClient;
}) {
  const { user, isLoading } = useAuth();
  const previousSubject = useRef<string | null | undefined>(undefined);
  const subject = isLoading ? undefined : (user?.id ?? null);

  useEffect(() => {
    if (subject === undefined) return;

    const previous = previousSubject.current;
    previousSubject.current = subject;
    if (previous !== undefined && previous !== subject) {
      queryClient.clear();
    }
  }, [queryClient, subject]);

  return null;
}
