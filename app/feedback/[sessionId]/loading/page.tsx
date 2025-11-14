"use client";

import { useParams } from "next/navigation";
import { FeedbackLoading } from "../components/feedback-loading";

export default function FeedbackLoadingPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  return <FeedbackLoading sessionId={sessionId} />;
}
