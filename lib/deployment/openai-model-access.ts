export type OpenAiModelAccessFailureClass =
  | "authentication"
  | "authorization"
  | "model_not_found"
  | "provider_unavailable"
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
