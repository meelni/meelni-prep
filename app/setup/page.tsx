"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Compatibility redirect for existing setup links.
 */
export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-muted-foreground">Opening New Rep...</div>
        </div>
      }
    >
      <SetupRedirect />
    </Suspense>
  );
}

function SetupRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(`/dashboard/new-rep${query ? `?${query}` : ""}`);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground">Opening New Rep...</div>
    </div>
  );
}
