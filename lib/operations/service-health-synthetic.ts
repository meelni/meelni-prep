import {
  SERVICE_HEALTH_CHECKS,
  type ServiceHealthCheck,
  type ServiceHealthCode,
  type ServiceHealthReport,
  type ServiceHealthStatus,
} from "@/lib/operations/service-health";

export type ServiceHealthSyntheticCode =
  | "health_endpoint_healthy"
  | "health_endpoint_degraded"
  | "health_endpoint_unavailable"
  | "health_endpoint_unreachable"
  | "health_endpoint_invalid";

export interface ServiceHealthSyntheticResult {
  synthetic: "meelni_service_health";
  version: 1;
  status: "passed" | "failed";
  code: ServiceHealthSyntheticCode;
}

const HEALTH_STATUSES = new Set<ServiceHealthStatus>([
  "healthy",
  "degraded",
  "unavailable",
]);
const HEALTH_CODE_CONTRACT: Record<
  ServiceHealthCode,
  { name: ServiceHealthCheck["name"]; status: ServiceHealthStatus }
> = {
  web_ready: { name: "web", status: "healthy" },
  database_ready: { name: "database", status: "healthy" },
  database_unavailable: { name: "database", status: "unavailable" },
  livekit_ready: { name: "livekit", status: "healthy" },
  livekit_unavailable: { name: "livekit", status: "unavailable" },
  feedback_dispatch_ready: {
    name: "feedback_dispatch",
    status: "healthy",
  },
  feedback_dispatch_config_missing: {
    name: "feedback_dispatch",
    status: "degraded",
  },
  feedback_dispatch_stale: {
    name: "feedback_dispatch",
    status: "degraded",
  },
  feedback_dispatch_failed: {
    name: "feedback_dispatch",
    status: "degraded",
  },
  feedback_dispatch_dependency_unavailable: {
    name: "feedback_dispatch",
    status: "unavailable",
  },
  stripe_webhook_ready: { name: "stripe_webhook", status: "healthy" },
  stripe_webhook_config_missing: {
    name: "stripe_webhook",
    status: "degraded",
  },
  stripe_webhook_stale: { name: "stripe_webhook", status: "degraded" },
  stripe_webhook_failed: {
    name: "stripe_webhook",
    status: "degraded",
  },
  stripe_webhook_dependency_unavailable: {
    name: "stripe_webhook",
    status: "unavailable",
  },
};
const MAX_RESPONSE_BYTES = 16 * 1024;
const DEFAULT_MAX_REPORT_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 60 * 1000;
const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export async function runServiceHealthSynthetic(input: {
  url: URL;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxReportAgeMs?: number;
  now?: () => Date;
}): Promise<ServiceHealthSyntheticResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? 5_000
  );

  try {
    const response = await (input.fetcher ?? fetch)(input.url, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const mediaType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (mediaType !== "application/json") {
      return failed("health_endpoint_invalid");
    }
    const text = await readBoundedResponse(response, MAX_RESPONSE_BYTES);
    if (text === null) {
      return failed("health_endpoint_invalid");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return failed("health_endpoint_invalid");
    }
    if (
      !isServiceHealthReport(
        payload,
        (input.now ?? (() => new Date()))(),
        input.maxReportAgeMs ?? DEFAULT_MAX_REPORT_AGE_MS
      )
    ) {
      return failed("health_endpoint_invalid");
    }
    if (!hasMatchingHttpStatus(payload.status, response.status)) {
      return failed("health_endpoint_invalid");
    }
    if (payload.status === "healthy") {
      return {
        synthetic: "meelni_service_health",
        version: 1,
        status: "passed",
        code: "health_endpoint_healthy",
      };
    }
    return failed(
      payload.status === "degraded"
        ? "health_endpoint_degraded"
        : "health_endpoint_unavailable"
    );
  } catch {
    return failed("health_endpoint_unreachable");
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number
): Promise<string | null> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength &&
    (!/^\d{1,10}$/.test(contentLength) || Number(contentLength) > maxBytes)
  ) {
    return null;
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

export function parseServiceHealthUrl(value: string | undefined): URL | null {
  if (!value || value.length > 2_048) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  return url;
}

function isServiceHealthReport(
  value: unknown,
  now: Date,
  maxReportAgeMs: number
): value is ServiceHealthReport {
  if (!isRecord(value)) return false;
  const checks = value.checks;
  if (
    value.contract !== "meelni_service_health" ||
    value.version !== 1 ||
    !HEALTH_STATUSES.has(value.status as ServiceHealthStatus) ||
    typeof value.checkedAt !== "string" ||
    value.checkedAt.length > 32 ||
    !isFreshTimestamp(value.checkedAt, now, maxReportAgeMs) ||
    !Array.isArray(checks) ||
    checks.length !== SERVICE_HEALTH_CHECKS.length ||
    !hasOnlyKeys(value, [
      "contract",
      "version",
      "checkedAt",
      "status",
      "checks",
    ])
  ) {
    return false;
  }

  const validChecks = SERVICE_HEALTH_CHECKS.every((name, index) => {
    const check = checks[index];
    const codeContract = isRecord(check)
      ? HEALTH_CODE_CONTRACT[check.code as ServiceHealthCode]
      : undefined;
    return (
      isRecord(check) &&
      hasOnlyKeys(check, ["name", "status", "code"]) &&
      check.name === name &&
      HEALTH_STATUSES.has(check.status as ServiceHealthStatus) &&
      codeContract !== undefined &&
      codeContract.name === check.name &&
      codeContract.status === check.status
    );
  });
  if (!validChecks) return false;

  return aggregateCheckStatus(checks as ServiceHealthCheck[]) === value.status;
}

function isFreshTimestamp(
  value: string,
  now: Date,
  maxReportAgeMs: number
): boolean {
  const timestamp = Date.parse(value);
  if (
    !CANONICAL_UTC_TIMESTAMP.test(value) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== value ||
    maxReportAgeMs < 0
  ) {
    return false;
  }
  const age = now.getTime() - timestamp;
  return age <= maxReportAgeMs && age >= -MAX_FUTURE_SKEW_MS;
}

function hasMatchingHttpStatus(
  status: ServiceHealthStatus,
  httpStatus: number
): boolean {
  return status === "unavailable" ? httpStatus === 503 : httpStatus === 200;
}

function aggregateCheckStatus(
  checks: ServiceHealthCheck[]
): ServiceHealthStatus {
  if (checks.some((check) => check.status === "unavailable")) {
    return "unavailable";
  }
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  return "healthy";
}

function failed(
  code: Exclude<ServiceHealthSyntheticCode, "health_endpoint_healthy">
) {
  return {
    synthetic: "meelni_service_health",
    version: 1,
    status: "failed",
    code,
  } as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}
