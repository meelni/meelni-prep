import {
  decodeFeedbackLifecycleResponse,
  type FeedbackLifecycleResponse,
} from "@meelni/core";

const INVALID_FEEDBACK_RESPONSE = "Feedback returned an unsupported response.";

export function decodeFeedbackResponseOrThrow(
  value: unknown
): FeedbackLifecycleResponse {
  const decoded = decodeFeedbackLifecycleResponse(value);
  if (!decoded) throw new Error(INVALID_FEEDBACK_RESPONSE);
  return decoded;
}
