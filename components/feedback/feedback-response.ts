import {
  decodeFeedbackLifecycleResponse,
  type FeedbackLifecycleResponse,
} from "@meelni/core";

const INVALID_FEEDBACK_RESPONSE = "Feedback returned an unsupported response.";
const FEEDBACK_TRANSPORT_RETRY_MESSAGE =
  "We’re reconnecting to your saved interview. This page will update automatically.";
const FEEDBACK_TRANSPORT_FAILURE_MESSAGE = "Feedback could not be loaded.";

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429]);

export class FeedbackTransportError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "FeedbackTransportError";
  }
}

export interface FeedbackTransportFailure {
  message: string;
  retryable: boolean;
}

export function decodeFeedbackResponseOrThrow(
  value: unknown
): FeedbackLifecycleResponse {
  const decoded = decodeFeedbackLifecycleResponse(value);
  if (!decoded) throw new Error(INVALID_FEEDBACK_RESPONSE);
  return decoded;
}

export function decodeFeedbackHttpResponseOrThrow(
  response: { ok: boolean; status: number },
  payload: unknown
): FeedbackLifecycleResponse {
  if (!response.ok) {
    const decoded = decodeFeedbackLifecycleResponse(payload);
    if (response.status === 409 && decoded?.status === "session_not_ended") {
      return decoded;
    }
    const retryable =
      response.status >= 500 || RETRYABLE_HTTP_STATUSES.has(response.status);
    throw new FeedbackTransportError(
      retryable
        ? FEEDBACK_TRANSPORT_RETRY_MESSAGE
        : FEEDBACK_TRANSPORT_FAILURE_MESSAGE,
      retryable
    );
  }

  return decodeFeedbackResponseOrThrow(payload);
}

export function toFeedbackTransportFailure(
  error: unknown
): FeedbackTransportFailure | null {
  if (error instanceof FeedbackTransportError) {
    return { message: error.message, retryable: error.retryable };
  }
  if (error instanceof TypeError) {
    return { message: FEEDBACK_TRANSPORT_RETRY_MESSAGE, retryable: true };
  }
  return null;
}
