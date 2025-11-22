"use client";

import { Suspense } from "react";
import { SetupContent } from "./setup-content";

/**
 * Setup page wrapper with Suspense boundary
 * Required for useSearchParams() hook to work during build
 */
export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <SetupContent />
    </Suspense>
  );
}
