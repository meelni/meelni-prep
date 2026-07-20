import { handleReadFocusedPracticeAttempt } from "@/lib/http/focused-practice-attempts";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params;
  return handleReadFocusedPracticeAttempt(attemptId, request);
}
