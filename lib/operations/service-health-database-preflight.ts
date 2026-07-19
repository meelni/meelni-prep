import type { ServiceHealthEvidenceReader } from "./service-health-store";

export type ServiceHealthDatabasePreflightCode =
  | "database_evidence_query_ready"
  | "database_evidence_query_failed"
  | "database_evidence_query_timeout";

export interface ServiceHealthDatabasePreflightResult {
  preflight: "meelni_service_health_database";
  version: 1;
  checkedAt: string;
  status: "passed" | "failed";
  code: ServiceHealthDatabasePreflightCode;
}

export async function runServiceHealthDatabasePreflight(input: {
  reader: ServiceHealthEvidenceReader;
  now?: () => Date;
  timeoutMs?: number;
}): Promise<ServiceHealthDatabasePreflightResult> {
  const checkedAt = (input.now ?? (() => new Date()))();
  const timeoutMs = normalizeTimeout(input.timeoutMs ?? 2_000);
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      input.reader.read({
        staleBefore: new Date(checkedAt.getTime() - 10 * 60 * 1000),
        queryTimeoutMs: Math.max(1, timeoutMs - 100),
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new DatabasePreflightTimeoutError()),
          timeoutMs
        );
      }),
    ]);
    return result(checkedAt, "passed", "database_evidence_query_ready");
  } catch (error) {
    return result(
      checkedAt,
      "failed",
      error instanceof DatabasePreflightTimeoutError
        ? "database_evidence_query_timeout"
        : "database_evidence_query_failed"
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function result(
  checkedAt: Date,
  status: ServiceHealthDatabasePreflightResult["status"],
  code: ServiceHealthDatabasePreflightCode
): ServiceHealthDatabasePreflightResult {
  return {
    preflight: "meelni_service_health_database",
    version: 1,
    checkedAt: checkedAt.toISOString(),
    status,
    code,
  };
}

function normalizeTimeout(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2_000;
}

class DatabasePreflightTimeoutError extends Error {}
