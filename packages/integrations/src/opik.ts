import { Opik, OpikSpanType } from "opik";

const DEFAULT_OPIK_API_URL = "https://www.comet.com/opik/api";

export interface OpikLlmUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface OpikLlmTraceResult {
  status: "success" | "error";
  usage?: OpikLlmUsage;
  response?: string;
}

export interface OpikLlmTrace {
  readonly enabled: boolean;
  readonly capturesContent: boolean;
  end(result: OpikLlmTraceResult): Promise<void>;
}

interface OpikSpanLike {
  update(data: Record<string, unknown>): unknown;
  end(): unknown;
}

interface OpikTraceLike {
  span(data: Record<string, unknown>): OpikSpanLike;
  update(data: Record<string, unknown>): unknown;
  end(): unknown;
}

interface OpikClientLike {
  trace(data: Record<string, unknown>): OpikTraceLike;
  flush(options?: { silent?: boolean }): Promise<void>;
}

interface OpikTraceDependencies {
  client?: OpikClientLike;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

const NOOP_TRACE: OpikLlmTrace = {
  enabled: false,
  capturesContent: false,
  async end() {},
};

let sharedClient: OpikClientLike | undefined;
let sharedClientKey: string | undefined;

/**
 * Start one feedback-evaluation trace without accepting arbitrary metadata.
 * The narrow interface keeps user, session, room, and provider identifiers out
 * of Opik. Prompt and response content cross the boundary only when the
 * explicit content-capture switch is enabled.
 */
export function startOpikFeedbackEvaluationTrace(
  input: { model: string; prompt: string },
  dependencies: OpikTraceDependencies = {}
): OpikLlmTrace {
  const env = dependencies.env ?? process.env;
  const config = readOpikConfig(env);
  if (!config) return NOOP_TRACE;

  const client = dependencies.client ?? getSharedClient(config);
  if (!client) return NOOP_TRACE;

  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();
  const environment = normalizeEnvironment(env);
  const release = normalizeRelease(env.VERCEL_GIT_COMMIT_SHA);
  const capturesContent = config.captureContent;
  const metadata = {
    schemaVersion: 1,
    surface: "feedback_evaluation",
    capture: capturesContent ? "content" : "metadata_only",
    ...(release ? { release } : {}),
  };

  try {
    const trace = client.trace({
      name: "feedback-generation",
      startTime: startedAt,
      environment,
      tags: ["feedback", "evaluation", metadata.capture],
      metadata,
      ...(capturesContent ? { input: { prompt: input.prompt } } : {}),
    });
    const span = trace.span({
      name: "openai.chat.completions",
      type: OpikSpanType.Llm,
      startTime: startedAt,
      environment,
      provider: "openai",
      model: normalizeModel(input.model),
      metadata,
      ...(capturesContent ? { input: { prompt: input.prompt } } : {}),
    });
    let ended = false;

    return {
      enabled: true,
      capturesContent,
      async end(result) {
        if (ended) return;
        ended = true;
        const endTime = now();
        const usage = normalizeUsage(result.usage);
        const resultMetadata = { ...metadata, outcome: result.status };
        const output =
          capturesContent && typeof result.response === "string"
            ? { response: result.response }
            : undefined;
        const errorInfo =
          result.status === "error"
            ? {
                exceptionType: "FeedbackEvaluationError",
                message: "feedback_evaluation_failed",
                traceback: "",
              }
            : undefined;

        try {
          span.update({
            endTime,
            metadata: resultMetadata,
            ...(usage ? { usage } : {}),
            ...(output ? { output } : {}),
            ...(errorInfo ? { errorInfo } : {}),
          });
          span.end();
          trace.update({
            endTime,
            metadata: resultMetadata,
            ...(usage ? { usage } : {}),
            ...(output ? { output } : {}),
            ...(errorInfo ? { errorInfo } : {}),
          });
          trace.end();
          await client.flush({ silent: true });
        } catch {
          // Observability must never change feedback generation outcomes.
        }
      },
    };
  } catch {
    return NOOP_TRACE;
  }
}

function readOpikConfig(env: Record<string, string | undefined>): {
  apiKey: string;
  workspaceName: string;
  projectName: string;
  apiUrl: string;
  captureContent: boolean;
} | null {
  if (!isTrue(env.OPIK_TRACING_ENABLED)) return null;

  const apiKey = normalizeSecret(env.OPIK_API_KEY);
  const workspaceName = normalizeLabel(env.OPIK_WORKSPACE);
  const projectName = normalizeLabel(env.OPIK_PROJECT_NAME);
  if (!apiKey || !workspaceName || !projectName) return null;

  const rawApiUrl = env.OPIK_URL_OVERRIDE?.trim();
  const configuredApiUrl = normalizeApiUrl(rawApiUrl);
  if (rawApiUrl && !configuredApiUrl) return null;
  const apiUrl = configuredApiUrl ?? DEFAULT_OPIK_API_URL;
  return {
    apiKey,
    workspaceName,
    projectName,
    apiUrl,
    captureContent: isTrue(env.OPIK_CAPTURE_CONTENT),
  };
}

function getSharedClient(config: {
  apiKey: string;
  workspaceName: string;
  projectName: string;
  apiUrl: string;
}): OpikClientLike | null {
  const key = JSON.stringify([
    config.apiUrl,
    config.workspaceName,
    config.projectName,
    config.apiKey,
  ]);
  if (sharedClient && sharedClientKey === key) return sharedClient;

  try {
    sharedClient = new Opik({
      apiKey: config.apiKey,
      workspaceName: config.workspaceName,
      projectName: config.projectName,
      apiUrl: config.apiUrl,
      holdUntilFlush: true,
    }) as unknown as OpikClientLike;
    sharedClientKey = key;
    return sharedClient;
  } catch {
    return null;
  }
}

function normalizeUsage(
  usage: OpikLlmUsage | undefined
): Record<string, number> | undefined {
  if (!usage) return undefined;
  const normalized = {
    prompt_tokens: nonNegativeInteger(usage.inputTokens),
    cached_input_tokens: nonNegativeInteger(usage.cachedInputTokens),
    completion_tokens: nonNegativeInteger(usage.outputTokens),
    total_tokens: nonNegativeInteger(usage.totalTokens),
  };
  return Object.values(normalized).every((value) => value !== undefined)
    ? (normalized as Record<string, number>)
    : undefined;
}

function nonNegativeInteger(value: number): number | undefined {
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function normalizeEnvironment(
  env: Record<string, string | undefined>
): "production" | "preview" | "development" | "test" | "unknown" {
  const value = (env.VERCEL_ENV ?? env.NODE_ENV ?? "").trim().toLowerCase();
  if (value === "production") return "production";
  if (value === "preview") return "preview";
  if (value === "development") return "development";
  if (value === "test") return "test";
  return "unknown";
}

function normalizeRelease(value: string | undefined): string | undefined {
  const release = value?.trim();
  return release && /^[0-9a-f]{7,64}$/iu.test(release) ? release : undefined;
}

function normalizeModel(value: string): string {
  const model = value.trim();
  return /^[a-z0-9._:/-]{1,120}$/iu.test(model) ? model : "unknown";
}

function normalizeLabel(value: string | undefined): string | undefined {
  const label = value?.trim();
  return label && /^[a-z0-9._:/-]{1,120}$/iu.test(label) ? label : undefined;
}

function normalizeSecret(value: string | undefined): string | undefined {
  const secret = value?.trim();
  return secret && secret.length <= 4096 && !/[\r\n]/u.test(secret)
    ? secret
    : undefined;
}

function normalizeApiUrl(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.username || url.password || url.search || url.hash)
      return undefined;
    return url.protocol === "https:" ||
      (url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
      ? url.toString().replace(/\/$/u, "")
      : undefined;
  } catch {
    return undefined;
  }
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}
