"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { buildNewInterviewHref } from "@/lib/navigation/interview-launch";

export function InterviewLaunchRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    router.replace(buildNewInterviewHref(searchParams.toString()));
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground">Opening New Mock Interview...</div>
    </div>
  );
}
