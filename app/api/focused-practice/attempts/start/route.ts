import { handleStartFocusedPracticeAttempt } from "@/lib/http/focused-practice-attempts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleStartFocusedPracticeAttempt(request);
}
