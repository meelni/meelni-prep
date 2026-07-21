import { handleCompleteFocusedPracticeAttempt } from "@/lib/http/focused-practice-attempts";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params;
  return handleCompleteFocusedPracticeAttempt(request, attemptId);
}
