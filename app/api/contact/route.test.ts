import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("POST /api/contact", () => {
  it("fails truthfully without reading or logging message data", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await POST();

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("86400");
    expect(await response.json()).toMatchObject({
      error: "contact_unavailable",
    });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();

    log.mockRestore();
    error.mockRestore();
  });
});
