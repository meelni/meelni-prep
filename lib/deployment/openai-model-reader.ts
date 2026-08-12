import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "openai";

import {
  OpenAiModelAccessError,
  type OpenAiModelAccessFailureClass,
  type OpenAiModelReader,
} from "@/lib/deployment/openai-model-access";

const DEFAULT_ATTEMPT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_OVERALL_TIMEOUT_MS = 21_000;
const MAX_ATTEMPTS = 2;
const RETRYABLE_SERVER_STATUSES = new Set([500, 502, 503, 504]);

interface OpenAiModelReaderDependencies {
  attemptTimeoutMs?: number;
  overallTimeoutMs?: number;
  retrieveModel?: (model: string) => Promise<void>;
  retryDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

export function createOpenAiModelReader(
  apiKey: string | undefined,
  dependencies: OpenAiModelReaderDependencies = {}
): OpenAiModelReader | undefined {
  const normalizedApiKey = apiKey?.trim();
  if (!normalizedApiKey) return undefined;

  const client = dependencies.retrieveModel
    ? undefined
    : new OpenAI({
        apiKey: normalizedApiKey,
        maxRetries: 0,
        timeout: DEFAULT_ATTEMPT_TIMEOUT_MS,
      });
  const retrieveModel =
    dependencies.retrieveModel ??
    (async (model: string) => {
      await client!.models.retrieve(model);
    });
  const attemptTimeoutMs =
    dependencies.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const overallTimeoutMs =
    dependencies.overallTimeoutMs ?? DEFAULT_OVERALL_TIMEOUT_MS;
  const retryDelayMs = dependencies.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const sleep = dependencies.sleep ?? defaultSleep;

  return {
    async verifyModelAccess(model: string) {
      try {
        await withinTimeout(
          runAttempts({
            attemptTimeoutMs,
            model,
            retrieveModel,
            retryDelayMs,
            sleep,
          }),
          overallTimeoutMs,
          "transport"
        );
      } catch (error) {
        if (error instanceof OpenAiModelAccessError) throw error;
        throw new OpenAiModelAccessError("unknown");
      }
    },
  };
}

async function runAttempts({
  attemptTimeoutMs,
  model,
  retrieveModel,
  retryDelayMs,
  sleep,
}: {
  attemptTimeoutMs: number;
  model: string;
  retrieveModel: (model: string) => Promise<void>;
  retryDelayMs: number;
  sleep: (delayMs: number) => Promise<void>;
}) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await withinTimeout(retrieveModel(model), attemptTimeoutMs, "transport");
      return;
    } catch (error) {
      const failureClass = classifyOpenAiModelAccessFailure(error);
      if (!isRetryable(failureClass) || attempt === MAX_ATTEMPTS) {
        throw new OpenAiModelAccessError(failureClass);
      }
      await sleep(retryDelayMs);
    }
  }
}

function classifyOpenAiModelAccessFailure(
  error: unknown
): OpenAiModelAccessFailureClass {
  if (error instanceof OpenAiModelAccessError) return error.failureClass;
  if (
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIConnectionError
  ) {
    return "transport";
  }
  if (!(error instanceof APIError) || typeof error.status !== "number") {
    return "unknown";
  }
  if (error.status === 401) return "authentication";
  if (error.status === 403) return "authorization";
  if (error.status === 404) return "model_not_found";
  if (error.status === 429) return "rate_limited";
  if (RETRYABLE_SERVER_STATUSES.has(error.status)) {
    return "provider_unavailable";
  }
  return "unknown";
}

function isRetryable(failureClass: OpenAiModelAccessFailureClass) {
  return (
    failureClass === "provider_unavailable" ||
    failureClass === "rate_limited" ||
    failureClass === "transport"
  );
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function withinTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  failureClass: OpenAiModelAccessFailureClass
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new OpenAiModelAccessError(failureClass)),
      timeoutMs
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
