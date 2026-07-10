"use client";

import { useParams } from "next/navigation";

import { FeedbackReview } from "@/components/feedback/feedback-review";

export default function FeedbackPage() {
  const params = useParams();
  return <FeedbackReview sessionId={params.sessionId as string} />;
}
