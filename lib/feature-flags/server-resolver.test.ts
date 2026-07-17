import { describe, expect, it, vi } from "vitest";
import { resolveServerGate } from "./server-resolver";

const rehearsalCommitSha = "a".repeat(40);
const rehearsalBranch = "codex/sav-184-deploy-preflight";
const rehearsalNowMs = Date.parse("2026-07-15T18:00:00.000Z");

function validRehearsalAuthority({
  approvedCommitSha = rehearsalCommitSha,
  approvedGitRef = rehearsalBranch,
  authorizedAt = "2026-07-15T18:00:00.000Z",
  expiresAt = "2026-07-15T19:00:00.000Z",
}: {
  approvedCommitSha?: string;
  approvedGitRef?: string;
  authorizedAt?: string;
  expiresAt?: string;
} = {}) {
  return {
    active: true,
    approvedCommitSha,
    approvedGitRef,
    authorizedAt,
    expiresAt,
  };
}

function createClient(
  source: string,
  value: boolean,
  authority: Record<string, unknown> = validRehearsalAuthority()
) {
  return {
    checkGate: vi.fn(() => value),
    getDynamicConfig: vi.fn(() => ({ value: authority })),
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
        deploymentTarget: "production",
        environmentTier: "production",
        gateName: "relaunch",
        relaunchPhase: "launched",
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
        deploymentTarget: "production",
        environmentTier: "production",
        gateName: "relaunch",
        relaunchPhase: "launched",
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
          deploymentTarget: "production",
          environmentTier: "production",
          gateName: "relaunch",
          relaunchPhase: "launched",
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
        deploymentTarget: "production",
        environmentTier: "production",
        gateName: "relaunch",
        relaunchPhase: "launched",
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
        deploymentTarget: "production",
        environmentTier: "production",
        fallbackValue: true,
        gateName: "relaunch",
        relaunchPhase: "launched",
        user: { userID: "public-launch-state" },
      })
    ).resolves.toEqual({ source: "configured-default", value: true });
  });

  it("ignores a remotely true gate while the release is prelaunch", async () => {
    const client = createClient("Network", true);

    await expect(
      resolveServerGate({
        clientFactory: () => client,
        clientKey: "client-test",
        deploymentTarget: "production",
        environmentTier: "production",
        fallbackValue: true,
        gateName: "relaunch",
        relaunchPhase: "prelaunch",
        user: { userID: "public-launch-state" },
      })
    ).resolves.toEqual({ source: "configured-default", value: false });
    expect(client.initializeAsync).not.toHaveBeenCalled();
    expect(client.checkGate).not.toHaveBeenCalled();
  });

  it("allows a remotely controlled gate only in the Preview rehearsal state", async () => {
    const client = createClient("Network", true);

    await expect(
      resolveServerGate({
        clientFactory: () => client,
        clientKey: "client-test",
        deploymentBranch: rehearsalBranch,
        deploymentCommitSha: rehearsalCommitSha,
        deploymentTarget: "preview",
        environmentTier: "preview",
        fallbackValue: false,
        gateName: "relaunch",
        nowMs: rehearsalNowMs,
        rehearsalCommitSha,
        relaunchPhase: "rehearsal",
        user: { userID: "public-launch-state" },
      })
    ).resolves.toEqual({ source: "statsig", value: true });
    expect(client.getDynamicConfig).toHaveBeenCalledWith(
      "meelni_preview_rehearsal_authority"
    );
  });

  it("passes exact Preview deployment attributes to the Statsig user", async () => {
    const client = createClient("Network", true);
    const clientFactory = vi.fn(() => client);

    await resolveServerGate({
      clientFactory,
      clientKey: "client-test",
      deploymentBranch: rehearsalBranch,
      deploymentCommitSha: rehearsalCommitSha,
      deploymentTarget: "preview",
      environmentTier: "preview",
      gateName: "relaunch",
      nowMs: rehearsalNowMs,
      rehearsalCommitSha,
      relaunchPhase: "rehearsal",
      user: {
        userID: "public-launch-state",
        custom: { existing: "preserved" },
      },
    });

    expect(clientFactory).toHaveBeenCalledWith(
      "client-test",
      {
        userID: "public-launch-state",
        custom: {
          existing: "preserved",
          meelni_deployment_commit_sha: rehearsalCommitSha,
          meelni_deployment_git_ref: rehearsalBranch,
        },
      },
      undefined,
      "preview"
    );
  });

  it("passes the exact deployment tier to the server Statsig client", async () => {
    const client = createClient("Network", false);
    const clientFactory = vi.fn(() => client);

    await resolveServerGate({
      apiUrl: "https://statsig.example.test/v1",
      clientFactory,
      clientKey: "client-test",
      deploymentTarget: "production",
      environmentTier: "production",
      gateName: "relaunch",
      relaunchPhase: "launched",
      user: { userID: "public-launch-state" },
    });

    expect(clientFactory).toHaveBeenCalledWith(
      "client-test",
      { userID: "public-launch-state" },
      "https://statsig.example.test/v1",
      "production"
    );
  });

  it.each([
    [undefined, rehearsalCommitSha],
    [rehearsalCommitSha, undefined],
    ["b".repeat(40), rehearsalCommitSha],
    ["not-a-sha", rehearsalCommitSha],
  ])(
    "fails closed when the Preview deployment SHA %s does not match rehearsal SHA %s",
    async (deploymentCommitSha, approvedCommitSha) => {
      const client = createClient("Network", true);

      await expect(
        resolveServerGate({
          clientFactory: () => client,
          clientKey: "client-test",
          deploymentBranch: rehearsalBranch,
          deploymentCommitSha,
          deploymentTarget: "preview",
          environmentTier: "preview",
          fallbackValue: true,
          gateName: "relaunch",
          nowMs: rehearsalNowMs,
          rehearsalCommitSha: approvedCommitSha,
          relaunchPhase: "rehearsal",
          user: { userID: "public-launch-state" },
        })
      ).resolves.toEqual({ source: "configured-default", value: false });
      expect(client.initializeAsync).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, "", "branch\u0000name"])(
    "fails closed for invalid Preview deployment branch %s",
    async (deploymentBranch) => {
      const client = createClient("Network", true);

      await expect(
        resolveServerGate({
          clientFactory: () => client,
          clientKey: "client-test",
          deploymentBranch,
          deploymentCommitSha: rehearsalCommitSha,
          deploymentTarget: "preview",
          environmentTier: "preview",
          fallbackValue: true,
          gateName: "relaunch",
          nowMs: rehearsalNowMs,
          rehearsalCommitSha,
          relaunchPhase: "rehearsal",
          user: { userID: "public-launch-state" },
        })
      ).resolves.toEqual({ source: "configured-default", value: false });
      expect(client.initializeAsync).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, "production"])(
    "fails closed for Preview rehearsal with tier %s",
    async (environmentTier) => {
      const client = createClient("Network", true);

      await expect(
        resolveServerGate({
          clientFactory: () => client,
          clientKey: "client-test",
          deploymentBranch: rehearsalBranch,
          deploymentCommitSha: rehearsalCommitSha,
          deploymentTarget: "preview",
          environmentTier,
          fallbackValue: true,
          gateName: "relaunch",
          nowMs: rehearsalNowMs,
          rehearsalCommitSha,
          relaunchPhase: "rehearsal",
          user: { userID: "public-launch-state" },
        })
      ).resolves.toEqual({ source: "configured-default", value: false });
      expect(client.initializeAsync).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, "preview"])(
    "fails closed for Production launch with tier %s",
    async (environmentTier) => {
      const client = createClient("Network", true);

      await expect(
        resolveServerGate({
          clientFactory: () => client,
          clientKey: "client-test",
          deploymentTarget: "production",
          environmentTier,
          fallbackValue: true,
          gateName: "relaunch",
          relaunchPhase: "launched",
          user: { userID: "public-launch-state" },
        })
      ).resolves.toEqual({ source: "configured-default", value: false });
      expect(client.initializeAsync).not.toHaveBeenCalled();
    }
  );

  it.each([
    [{ ...validRehearsalAuthority(), active: false }],
    [validRehearsalAuthority({ approvedCommitSha: "b".repeat(40) })],
    [validRehearsalAuthority({ approvedGitRef: "codex/another-branch" })],
    [validRehearsalAuthority({ expiresAt: "2026-07-15T18:00:00.000Z" })],
    [validRehearsalAuthority({ authorizedAt: "2026-07-15T18:00:00.001Z" })],
    [
      validRehearsalAuthority({
        authorizedAt: "2026-07-15T17:00:00.000Z",
        expiresAt: "2026-07-15T19:00:00.001Z",
      }),
    ],
    [
      validRehearsalAuthority({
        authorizedAt: "2026-07-15 18:00:00Z",
      }),
    ],
    [validRehearsalAuthority({ expiresAt: "2026-07-15 19:00:00Z" })],
    [{}],
  ])(
    "fails closed for invalid or stale rehearsal authority %#",
    async (authority) => {
      const client = createClient("Network", true, authority);

      await expect(
        resolveServerGate({
          clientFactory: () => client,
          clientKey: "client-test",
          deploymentBranch: rehearsalBranch,
          deploymentCommitSha: rehearsalCommitSha,
          deploymentTarget: "preview",
          environmentTier: "preview",
          fallbackValue: true,
          gateName: "relaunch",
          nowMs: rehearsalNowMs,
          rehearsalCommitSha,
          relaunchPhase: "rehearsal",
          user: { userID: "public-launch-state" },
        })
      ).resolves.toEqual({ source: "configured-default", value: false });
      expect(client.checkGate).not.toHaveBeenCalled();
    }
  );

  it("revokes an old immutable deployment when authority advances", async () => {
    const oldCommitSha = "a".repeat(40);
    const newCommitSha = "b".repeat(40);
    const authority = validRehearsalAuthority({
      approvedCommitSha: newCommitSha,
    });
    const oldClient = createClient("Network", true, authority);
    const newClient = createClient("Network", true, authority);

    await expect(
      resolveServerGate({
        clientFactory: () => oldClient,
        clientKey: "client-test",
        deploymentBranch: rehearsalBranch,
        deploymentCommitSha: oldCommitSha,
        deploymentTarget: "preview",
        environmentTier: "preview",
        gateName: "relaunch",
        nowMs: rehearsalNowMs,
        rehearsalCommitSha: oldCommitSha,
        relaunchPhase: "rehearsal",
        user: { userID: "public-launch-state" },
      })
    ).resolves.toEqual({ source: "configured-default", value: false });
    await expect(
      resolveServerGate({
        clientFactory: () => newClient,
        clientKey: "client-test",
        deploymentBranch: rehearsalBranch,
        deploymentCommitSha: newCommitSha,
        deploymentTarget: "preview",
        environmentTier: "preview",
        gateName: "relaunch",
        nowMs: rehearsalNowMs,
        rehearsalCommitSha: newCommitSha,
        relaunchPhase: "rehearsal",
        user: { userID: "public-launch-state" },
      })
    ).resolves.toEqual({ source: "statsig", value: true });
    expect(oldClient.checkGate).not.toHaveBeenCalled();
    expect(newClient.checkGate).toHaveBeenCalledOnce();
  });

  it("never activates an overlong authority as its remaining time shrinks", async () => {
    const overlongAuthority = validRehearsalAuthority({
      authorizedAt: "2026-07-15T18:00:00.000Z",
      expiresAt: "2026-07-15T21:00:00.000Z",
    });

    for (const nowMs of [
      Date.parse("2026-07-15T18:00:00.000Z"),
      Date.parse("2026-07-15T19:00:00.000Z"),
      Date.parse("2026-07-15T20:30:00.000Z"),
    ]) {
      const client = createClient("Network", true, overlongAuthority);
      await expect(
        resolveServerGate({
          clientFactory: () => client,
          clientKey: "client-test",
          deploymentBranch: rehearsalBranch,
          deploymentCommitSha: rehearsalCommitSha,
          deploymentTarget: "preview",
          environmentTier: "preview",
          gateName: "relaunch",
          nowMs,
          rehearsalCommitSha,
          relaunchPhase: "rehearsal",
          user: { userID: "public-launch-state" },
        })
      ).resolves.toEqual({ source: "configured-default", value: false });
      expect(client.checkGate).not.toHaveBeenCalled();
    }
  });

  it("keeps Preview fail-closed during provider failure even with a true fallback", async () => {
    const client = createClient("Network", true);
    client.initializeAsync.mockRejectedValueOnce(new Error("unavailable"));

    await expect(
      resolveServerGate({
        clientFactory: () => client,
        clientKey: "client-test",
        deploymentBranch: rehearsalBranch,
        deploymentCommitSha: rehearsalCommitSha,
        deploymentTarget: "preview",
        environmentTier: "preview",
        fallbackValue: true,
        gateName: "relaunch",
        nowMs: rehearsalNowMs,
        rehearsalCommitSha,
        relaunchPhase: "rehearsal",
        user: { userID: "public-launch-state" },
      })
    ).resolves.toEqual({ source: "configured-default", value: false });
  });

  it.each([
    ["rehearsal", "production"],
    ["launched", "preview"],
    ["launched", undefined],
  ])("fails closed for phase %s on target %s", async (phase, target) => {
    const client = createClient("Network", true);

    await expect(
      resolveServerGate({
        clientFactory: () => client,
        clientKey: "client-test",
        deploymentTarget: target,
        environmentTier: target === "production" ? "production" : "preview",
        fallbackValue: true,
        gateName: "relaunch",
        relaunchPhase: phase,
        user: { userID: "public-launch-state" },
      })
    ).resolves.toEqual({ source: "configured-default", value: false });
    expect(client.initializeAsync).not.toHaveBeenCalled();
  });
});
