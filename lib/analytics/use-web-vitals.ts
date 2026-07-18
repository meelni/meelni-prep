"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";

import { analytics } from "./analytics-service";
import type { EventProperties } from "./types";

type PagePerformanceProperties = EventProperties["page_performance"];
type WebVitalValues = Omit<PagePerformanceProperties, "page">;
type SupportedWebVital = "CLS" | "FCP" | "FID" | "INP" | "LCP" | "TTFB";
type WebVitalMetric = { name: string; value: number };
type TimerHandle = unknown;

const SUPPORTED_WEB_VITALS: readonly SupportedWebVital[] = [
  "CLS",
  "FCP",
  "FID",
  "INP",
  "LCP",
  "TTFB",
];
const REQUIRED_PAGE_METRICS: readonly SupportedWebVital[] = [
  "CLS",
  "FCP",
  "LCP",
  "TTFB",
];
const REPORT_TIMEOUT_MS = 10_000;

function isSupportedWebVital(name: string): name is SupportedWebVital {
  return SUPPORTED_WEB_VITALS.includes(name as SupportedWebVital);
}

export function normalizeWebVital(
  name: SupportedWebVital,
  value: number
): WebVitalValues {
  return {
    [name.toLowerCase()]:
      name === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value),
  };
}

export function createWebVitalsReporter({
  pageName,
  emit,
  schedule = (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel = (handle) => window.clearTimeout(handle as number),
  timeoutMs = REPORT_TIMEOUT_MS,
}: {
  pageName: string;
  emit: (properties: PagePerformanceProperties) => void;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
  timeoutMs?: number;
}) {
  const values: WebVitalValues = {};
  const observedMetrics = new Set<SupportedWebVital>();
  let timer: TimerHandle | null = null;
  let closed = false;
  let reported = false;

  const clearReportTimer = () => {
    if (timer === null) return;
    cancel(timer);
    timer = null;
  };

  const report = () => {
    if (closed || reported || observedMetrics.size === 0) return;
    reported = true;
    clearReportTimer();
    emit({ page: pageName, ...values });
  };

  const hasCompletePageMetrics = () =>
    REQUIRED_PAGE_METRICS.every((name) => observedMetrics.has(name)) &&
    (observedMetrics.has("INP") || observedMetrics.has("FID"));

  return {
    record(metric: WebVitalMetric) {
      if (
        closed ||
        reported ||
        !isSupportedWebVital(metric.name) ||
        !Number.isFinite(metric.value)
      ) {
        return;
      }

      observedMetrics.add(metric.name);
      Object.assign(values, normalizeWebVital(metric.name, metric.value));

      if (hasCompletePageMetrics()) {
        report();
        return;
      }

      if (timer === null) timer = schedule(report, timeoutMs);
    },
    dispose() {
      if (closed) return;
      closed = true;
      clearReportTimer();
    },
  };
}

export function useWebVitals(pageName: string) {
  const reporterRef = useRef<ReturnType<typeof createWebVitalsReporter> | null>(
    null
  );
  const createReporter = useCallback(
    () =>
      createWebVitalsReporter({
        pageName,
        emit: (properties) => analytics.track("page_performance", properties),
      }),
    [pageName]
  );
  const reportMetric = useCallback(
    (metric: WebVitalMetric) => {
      reporterRef.current ??= createReporter();
      reporterRef.current.record(metric);
    },
    [createReporter]
  );

  useEffect(() => {
    reporterRef.current = createReporter();
    return () => {
      reporterRef.current?.dispose();
      reporterRef.current = null;
    };
  }, [createReporter]);
  useReportWebVitals(reportMetric);
}
