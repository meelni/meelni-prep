import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  type ClientOptions,
} from "openai";

import {
  OPENAI_MODEL_READ_BUDGET,
  OpenAiModelAccessError,
  type OpenAiModelAccessFailureClass,
  type OpenAiModelReader,
} from "@/lib/deployment/openai-model-access";

const CANONICAL_OPENAI_BASE_URL = "https://api.openai.com/v1";
const RETRYABLE_SERVER_STATUSES = new Set([500, 502, 503, 504]);
const RETRYABLE_RATE_LIMIT_CODES = new Set(["rate_limit_exceeded"]);
const TERMINAL_QUOTA_CODES = new Set(["insufficient_quota"]);

interface OpenAiModelReaderDependencies {
  attemptTimeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  logger?: ClientOptions["logger"];
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
        baseURL: CANONICAL_OPENAI_BASE_URL,
        fetch: dependencies.fetch,
        logLevel: "off",
        logger: dependencies.logger,
        maxRetries: 0,
        organization: null,
        project: null,
        timeout: OPENAI_MODEL_READ_BUDGET.attemptTimeoutMs,
        webhookSecret: null,
      });
  const retrieveModel =
    dependencies.retrieveModel ??
    (async (model: string) => {
      await client!.models.retrieve(model);
    });
  const attemptTimeoutMs =
    dependencies.attemptTimeoutMs ?? OPENAI_MODEL_READ_BUDGET.attemptTimeoutMs;
  const overallTimeoutMs =
    dependencies.overallTimeoutMs ?? OPENAI_MODEL_READ_BUDGET.overallTimeoutMs;
  const retryDelayMs =
    dependencies.retryDelayMs ?? OPENAI_MODEL_READ_BUDGET.retryDelayMs;
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
  for (
    let attempt = 1;
    attempt <= OPENAI_MODEL_READ_BUDGET.maxAttempts;
    attempt += 1
  ) {
    try {
      await withinTimeout(retrieveModel(model), attemptTimeoutMs, "transport");
      return;
    } catch (error) {
      const failureClass = classifyOpenAiModelAccessFailure(error);
      if (
        !isRetryable(failureClass) ||
        attempt === OPENAI_MODEL_READ_BUDGET.maxAttempts
      ) {
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
  if (error.status === 429) return classifyRateLimit(error.code);
  if (RETRYABLE_SERVER_STATUSES.has(error.status)) {
    return "provider_unavailable";
  }
  return "unknown";
}

function classifyRateLimit(code: unknown): OpenAiModelAccessFailureClass {
  if (code === null || code === undefined) return "rate_limited";
  if (typeof code !== "string") return "unknown";
  if (TERMINAL_QUOTA_CODES.has(code)) return "quota_exhausted";
  if (RETRYABLE_RATE_LIMIT_CODES.has(code)) return "rate_limited";
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
