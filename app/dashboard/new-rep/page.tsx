"use client";

import { Suspense } from "react";
import { SetupContent } from "@/app/setup/setup-content";

export default function NewRepPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-dashboard-muted">Loading New Rep...</div>
        </div>
      }
    >
      <SetupContent />
    </Suspense>
  );
}
