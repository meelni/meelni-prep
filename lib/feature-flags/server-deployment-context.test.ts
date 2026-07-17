import { describe, expect, it } from "vitest";
import { buildServerGateDeploymentContext } from "./server-deployment-context";

describe("server gate deployment context", () => {
  it("wires Vercel commit, ref, target, tier, anchor, and phase without substitution", () => {
    const context = buildServerGateDeploymentContext(
      {
        MEELNI_REHEARSAL_COMMIT_SHA: "b".repeat(40),
        MEELNI_RELAUNCH_PHASE: "rehearsal",
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "codex/sav-184-deploy-preflight",
        VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
      },
      "preview"
    );

    expect(context).toEqual({
      deploymentBranch: "codex/sav-184-deploy-preflight",
      deploymentCommitSha: "a".repeat(40),
      deploymentTarget: "preview",
      environmentTier: "preview",
      rehearsalCommitSha: "b".repeat(40),
      relaunchPhase: "rehearsal",
    });
  });
});
