"use client";

import { useParams } from "next/navigation";
import { FeedbackReview } from "@/components/feedback/feedback-review";

export default function FeedbackLoadingPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  return <FeedbackReview sessionId={sessionId} />;
}
