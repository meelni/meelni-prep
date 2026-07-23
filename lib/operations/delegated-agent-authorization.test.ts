import assert from "node:assert/strict";
import test from "node:test";

import { verifyCalibrationOwnerAuthorization } from "@/lib/evaluation/calibration-owner-authorization";

import {
  DELEGATED_AGENT_AUTHORIZATION_CONTRACT,
  verifyDelegatedAgentAuthorization,
} from "./delegated-agent-authorization";

const NOW = new Date("2026-07-23T06:50:00.000Z");

test("delegated agent authorization accepts only bounded non-launch scope", () => {
  const verified = verifyDelegatedAgentAuthorization({
    artifact: delegatedArtifact(),
    now: NOW,
  });

  assert.equal(verified.authorizationId, "sav302_delegated_agent_1234567890abcdef1234567890abcdef");
  assert.equal(verified.delegatedTo, "codex");
  assert.equal(verified.actionClass, "synthetic_calibration_retry");
  assert.equal(verified.maximumProviderCalls, 64);
  assert.equal(verified.maximumSpendNanoUsd, 2_273_985_000);
});

test("delegated agent authorization is not a human owner signature", () => {
  assert.throws(
    () =>
      verifyCalibrationOwnerAuthorization({
        artifact: delegatedArtifact(),
        now: NOW,
      }),
    /calibration_owner_authorization_artifact_invalid|calibration_owner_authorization_contract_invalid/
  );
});

test("delegated agent authorization rejects launch, production data, broad spend, and stale windows", () => {
  for (const patch of [
    { launchDecision: "GO" },
    { productionDataAllowed: true },
    { customerTranscriptsAllowed: true },
    { maximumSpendNanoUsd: 3_000_000_001 },
    { maximumProviderCalls: 97 },
    { expiresAt: "2026-07-23T12:50:01.000Z" },
  ]) {
    assert.throws(
      () =>
        verifyDelegatedAgentAuthorization({
          artifact: delegatedArtifact(patch),
          now: NOW,
        }),
      /delegated_agent_authorization_/
    );
  }

  assert.throws(
    () =>
      verifyDelegatedAgentAuthorization({
        artifact: delegatedArtifact(),
        now: new Date("2026-07-23T10:50:01.000Z"),
      }),
    /delegated_agent_authorization_expired/
  );
});

function delegatedArtifact(payloadPatch: Record<string, unknown> = {}) {
  return {
    contract: DELEGATED_AGENT_AUTHORIZATION_CONTRACT,
    payload: {
      authorizationId:
        "sav302_delegated_agent_1234567890abcdef1234567890abcdef",
      authorizedBy: "human_product_owner_chat_delegation",
      authorizedVia: "codex_thread",
      delegatedTo: "codex",
      actionClass: "synthetic_calibration_retry",
      scope:
        "SAV-198 bounded synthetic calibration retry after provider-auth repair; no launch authority",
      reviewedSourcePolicy: "merged_repo_only_guardrail_repairs_allowed",
      maximumProviderCalls: 64,
      maximumPhysicalHttpAttempts: 64,
      maximumSpendNanoUsd: 2_273_985_000,
      customerTranscriptsAllowed: false,
      productionDataAllowed: false,
      launchDecision: null,
      issuedAt: "2026-07-23T06:50:00.000Z",
      expiresAt: "2026-07-23T10:50:00.000Z",
      ...payloadPatch,
    },
  };
}
