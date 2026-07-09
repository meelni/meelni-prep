"use client";

import { Suspense } from "react";
import { InterviewLaunchRedirect } from "@/app/setup/interview-launch-redirect";

export default function NewRepPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-dashboard-muted">
            Opening New Mock Interview...
          </div>
        </div>
      }
    >
      <InterviewLaunchRedirect />
    </Suspense>
  );
}
