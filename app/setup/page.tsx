"use client";

import { Suspense } from "react";

import { InterviewLaunchRedirect } from "./interview-launch-redirect";

/**
 * Compatibility redirect for existing setup links.
 */
export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-muted-foreground">
            Opening New Mock Interview...
          </div>
        </div>
      }
    >
      <InterviewLaunchRedirect />
    </Suspense>
  );
}
