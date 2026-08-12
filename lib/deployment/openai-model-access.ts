export const OPENAI_MODEL_READ_BUDGET = {
  attemptTimeoutMs: 10_000,
  maxAttempts: 2,
  overallTimeoutMs: 21_000,
  retryDelayMs: 250,
} as const;

export type OpenAiModelAccessFailureClass =
  | "authentication"
  | "authorization"
  | "model_not_found"
  | "provider_unavailable"
  | "quota_exhausted"
  | "rate_limited"
  | "transport"
  | "unknown";

export class OpenAiModelAccessError extends Error {
  constructor(readonly failureClass: OpenAiModelAccessFailureClass) {
    super(`openai_model_access_${failureClass}`);
    this.name = "OpenAiModelAccessError";
  }
}

export interface OpenAiModelReader {
  verifyModelAccess(model: string): Promise<void>;
}
