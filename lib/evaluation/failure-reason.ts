const MISSING_OPENAI_KEY_REASON =
  "OpenAI API key is missing or not loaded. Set OPENAI_API_KEY and retry feedback generation.";
const MISSING_OPENAI_KEY_CODE = "feedback_configuration_missing_openai_key";
const INVALID_OPENAI_KEY_CODE = "feedback_configuration_invalid_openai_key";

export function getEvaluationFailureReason(error: unknown): string {
  const messages = collectErrorMessages(error);

  if (
    messages.some(
      (message) =>
        message === MISSING_OPENAI_KEY_CODE ||
        message.includes("OPENAI_API_KEY")
    )
  ) {
    return MISSING_OPENAI_KEY_REASON;
  }

  if (messages.some((message) => message === INVALID_OPENAI_KEY_CODE)) {
    return "OpenAI API key was rejected. Rotate OPENAI_API_KEY and retry feedback generation.";
  }

  if (
    messages.some(
      (message) =>
        message.includes("401") ||
        message.toLowerCase().includes("invalid api key")
    )
  ) {
    return "OpenAI API key was rejected. Rotate OPENAI_API_KEY and retry feedback generation.";
  }

  return "Feedback evaluation failed. Check worker logs and retry.";
}

function collectErrorMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && !seen.has(current)) {
    seen.add(current);

    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
      continue;
    }

    if (typeof current === "string") {
      messages.push(current);
    }

    break;
  }

  return messages;
}
