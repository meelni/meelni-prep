import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { EventProperties } from "./types";
import { createWebVitalsReporter, normalizeWebVital } from "./use-web-vitals";

type PagePerformanceProperties = EventProperties["page_performance"];

function createReporterHarness() {
  const events: PagePerformanceProperties[] = [];
  const scheduled = new Map<object, () => void>();
  const canceled: object[] = [];
  const reporter = createWebVitalsReporter({
    pageName: "interview",
    emit: (properties) => events.push(properties),
    schedule(callback, delayMs) {
      assert.equal(delayMs, 10_000);
      const handle = {};
      scheduled.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      assert.equal(typeof handle, "object");
      canceled.push(handle as object);
      scheduled.delete(handle as object);
    },
  });

  return { canceled, events, reporter, scheduled };
}

test("normalizes layout shift precision independently from duration metrics", () => {
  assert.deepEqual(normalizeWebVital("CLS", 0.12349), { cls: 0.123 });
  assert.deepEqual(normalizeWebVital("LCP", 2450.6), { lcp: 2451 });
  assert.deepEqual(normalizeWebVital("INP", 151.8), { inp: 152 });
});

test("emits one aggregate page-performance event after the complete metric set", () => {
  const { canceled, events, reporter, scheduled } = createReporterHarness();

  reporter.record({ name: "TTFB", value: 100.4 });
  reporter.record({ name: "FCP", value: 500.6 });
  reporter.record({ name: "LCP", value: 2200.5 });
  reporter.record({ name: "CLS", value: 0.12349 });
  reporter.record({ name: "INP", value: 151.8 });

  const expected = {
    page: "interview",
    ttfb: 100,
    fcp: 501,
    lcp: 2201,
    cls: 0.123,
    inp: 152,
  } satisfies PagePerformanceProperties;
  assert.deepEqual(events, [expected]);
  assert.equal(Object.hasOwn(events[0]!, "metric"), false);
  assert.equal(scheduled.size, 0);
  assert.equal(canceled.length, 1);

  reporter.record({ name: "FID", value: 42 });
  assert.equal(events.length, 1);
});

test("accepts FID as the legacy interaction metric without changing the schema", () => {
  const { events, reporter } = createReporterHarness();

  reporter.record({ name: "CLS", value: 0.01 });
  reporter.record({ name: "FCP", value: 800 });
  reporter.record({ name: "LCP", value: 1800 });
  reporter.record({ name: "TTFB", value: 300 });
  reporter.record({ name: "FID", value: 49.6 });

  assert.deepEqual(events, [
    {
      page: "interview",
      cls: 0.01,
      fcp: 800,
      lcp: 1800,
      ttfb: 300,
      fid: 50,
    } satisfies PagePerformanceProperties,
  ]);
});

test("reports a partial aggregate once on timeout and ignores later metrics", () => {
  const { events, reporter, scheduled } = createReporterHarness();

  reporter.record({ name: "LCP", value: 2300.2 });
  reporter.record({ name: "LCP", value: 2400.8 });
  assert.equal(scheduled.size, 1);
  const timeout = [...scheduled.values()][0];
  assert.ok(timeout);
  timeout();

  assert.deepEqual(events, [
    { page: "interview", lcp: 2401 } satisfies PagePerformanceProperties,
  ]);
  reporter.record({ name: "CLS", value: 0.2 });
  timeout();
  assert.equal(events.length, 1);
});

test("ignores unsupported and non-finite metrics without scheduling a report", () => {
  const { events, reporter, scheduled } = createReporterHarness();

  reporter.record({ name: "UNKNOWN", value: 1 });
  reporter.record({ name: "LCP", value: Number.NaN });
  reporter.record({ name: "FCP", value: Number.POSITIVE_INFINITY });

  assert.deepEqual(events, []);
  assert.equal(scheduled.size, 0);
});

test("disposing cancels the pending aggregate without emitting", () => {
  const { canceled, events, reporter, scheduled } = createReporterHarness();

  reporter.record({ name: "TTFB", value: 120 });
  const timeout = [...scheduled.values()][0];
  assert.ok(timeout);
  reporter.dispose();
  timeout();

  assert.deepEqual(events, []);
  assert.equal(canceled.length, 1);
  reporter.record({ name: "FCP", value: 600 });
  assert.deepEqual(events, []);
});

test("web-vitals reporting stays bundled and never injects the legacy CDN script", () => {
  const source = readFileSync(new URL("./use-web-vitals.ts", import.meta.url), {
    encoding: "utf8",
  });

  assert.equal(source.includes("unpkg.com/web-vitals"), false);
  assert.equal(source.includes("web-vitals.iife"), false);
  assert.equal(/createElement\((["'])script\1\)/.test(source), false);
  assert.match(source, /from "next\/web-vitals"/);
});
