import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/livekit/demo-token", () => {
  it.each([
    { name: "a valid legacy request", body: '{"participantName":"Guest"}' },
    { name: "malformed JSON", body: "{" },
    { name: "an empty body", body: "" },
  ])(
    "keeps $name provider-free while the demo is de-scoped",
    async ({ body }) => {
      const response = await POST(
        new NextRequest("http://localhost/api/livekit/demo-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        })
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
      await expect(response.json()).resolves.toEqual({
        error: "voice_demo_unavailable",
        message: "The public voice demo is not part of the current experience.",
        retryable: false,
      });
    }
  );
});
