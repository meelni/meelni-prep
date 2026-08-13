import { NextRequest } from "next/server";

import {
  handleReadFeedbackQualitySignal,
  handleWriteFeedbackQualitySignal,
} from "@/lib/http/feedback-quality-signal";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  return handleReadFeedbackQualitySignal(sessionId);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  return handleWriteFeedbackQualitySignal(request, sessionId);
}
