import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Preview-shadow worker route", () => {
  it("is unavailable outside the exact trusted staging tuple", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_TARGET_ENV", "preview");
    vi.stubEnv("MEELNI_ENV_PULL_ENVIRONMENT", "preview");
    vi.stubEnv("MEELNI_PREVIEW_SHADOW_REHEARSAL_SERVER", "enabled");

    const response = await POST(
      new Request("https://example.invalid/api/internal/preview-shadow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      contract_version: "adaptive-interviewer-preview-shadow-worker-request.v1",
      error: "preview_shadow_worker_unavailable",
    });
  });

  it("rejects oversized and non-JSON requests before database access", async () => {
    trustedStaging();
    const oversized = await POST(
      new Request("https://example.invalid/api/internal/preview-shadow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(64 * 1_024 + 1),
        },
        body: "{}",
      })
    );
    expect(oversized.status).toBe(413);

    const wrongMediaType = await POST(
      new Request("https://example.invalid/api/internal/preview-shadow", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      })
    );
    expect(wrongMediaType.status).toBe(415);
  });
});

function trustedStaging() {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", "staging");
  vi.stubEnv("MEELNI_ENV_PULL_ENVIRONMENT", "preview");
  vi.stubEnv("MEELNI_PREVIEW_SHADOW_REHEARSAL_SERVER", "enabled");
}
