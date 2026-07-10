import { NextResponse } from "next/server";

import type { ServiceHealthReport } from "@/lib/operations/service-health";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
} as const;

export function createServiceHealthHandler(dependencies: {
  assess(): Promise<ServiceHealthReport>;
}) {
  return async function serviceHealthHandler() {
    const report = await dependencies.assess();
    return NextResponse.json(report, {
      status: report.status === "unavailable" ? 503 : 200,
      headers: NO_STORE_HEADERS,
    });
  };
}
