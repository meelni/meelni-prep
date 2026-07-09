import { describe, expect, it, vi } from "vitest";
import { resolveServerGate } from "./server-resolver";

function createClient(source: string, value: boolean) {
  return {
    checkGate: vi.fn(() => value),
    initializeAsync: vi.fn(async () => ({ source })),
    shutdown: vi.fn(async () => undefined),
  };
}

describe("server feature gate resolution", () => {
  it("fails closed when the client key is missing", async () => {
    const clientFactory = vi.fn();

    await expect(
      resolveServerGate({
        clientFactory,
        clientKey: "",
        gateName: "relaunch",
        user: { userID: "anon-1" },
      })
    ).resolves.toEqual({ source: "configured-default", value: false });
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it.each([true, false])("uses a network evaluation of %s", async (value) => {
    const client = createClient("Network", value);

    await expect(
      resolveServerGate({
        clientFactory: () => client,
        clientKey: "client-test",
        gateName: "relaunch",
        user: { userID: "anon-1" },
      })
    ).resolves.toEqual({ source: "statsig", value });
    expect(client.checkGate).toHaveBeenCalledWith("relaunch");
    expect(client.shutdown).toHaveBeenCalledOnce();
  });

  it.each(["Uninitialized", "Loading", "NoValues", "Cache", "Bootstrap"])(
    "fails closed for a non-authoritative %s result",
    async (source) => {
      const client = createClient(source, true);

      await expect(
        resolveServerGate({
          clientFactory: () => client,
          clientKey: "client-test",
          gateName: "relaunch",
          user: { userID: "anon-1" },
        })
      ).resolves.toEqual({ source: "configured-default", value: false });
    }
  );

  it("fails closed and shuts down after a provider error", async () => {
    const client = createClient("Network", true);
    client.initializeAsync.mockRejectedValueOnce(new Error("unavailable"));

    await expect(
      resolveServerGate({
        clientFactory: () => client,
        clientKey: "client-test",
        gateName: "relaunch",
        user: { userID: "anon-1" },
      })
    ).resolves.toEqual({ source: "configured-default", value: false });
    expect(client.shutdown).toHaveBeenCalledOnce();
  });

  it("uses the explicit post-launch default during provider failure", async () => {
    const client = createClient("Network", true);
    client.initializeAsync.mockRejectedValueOnce(new Error("unavailable"));

    await expect(
      resolveServerGate({
        clientFactory: () => client,
        clientKey: "client-test",
        fallbackValue: true,
        gateName: "relaunch",
        user: { userID: "public-launch-state" },
      })
    ).resolves.toEqual({ source: "configured-default", value: true });
  });
});
