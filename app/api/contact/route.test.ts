import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { resolveReactivationAccess } = vi.hoisted(() => ({
  resolveReactivationAccess: vi.fn().mockResolvedValue({
    source: "configured-default",
    value: false,
  }),
}));

vi.mock("@/lib/feature-flags/reactivation-access", () => ({
  resolveReactivationAccess,
}));

import { POST } from "./route";

describe("POST /api/contact while relaunch access is off", () => {
  it("fails before reading, accepting, or logging message data", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const unreadBody = new ReadableStream({
      pull() {
        throw new Error("body_must_not_be_read");
      },
    });

    const response = await POST(
      new NextRequest("https://meelni.example/api/contact", {
        method: "POST",
        body: unreadBody,
        duplex: "half",
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "contact_unavailable",
      retryable: false,
    });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
