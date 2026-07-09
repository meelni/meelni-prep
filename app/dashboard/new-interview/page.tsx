"use client";

import { Suspense } from "react";

import { SetupContent } from "@/app/setup/setup-content";

export default function NewInterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-dashboard-muted">
            Loading New Mock Interview...
          </div>
        </div>
      }
    >
      <SetupContent />
    </Suspense>
  );
}
