import assert from "node:assert/strict";
import test from "node:test";

import {
  PREVIEW_DEMO_AGENT_DEPLOYMENT_ID,
  PREVIEW_INTERVIEW_AGENT_DEPLOYMENT_ID,
  PREVIEW_LIVEKIT_IDENTITY,
  PREVIEW_LIVEKIT_PROJECT_ID,
} from "./provider-identities";

test("pins Preview to the Meelni-owned single-deployment topology", () => {
  assert.equal(PREVIEW_LIVEKIT_PROJECT_ID, "p_175dshlwom7");
  assert.equal(
    PREVIEW_LIVEKIT_IDENTITY.projectHost,
    "meelni-preview-gui1i7s9.livekit.cloud"
  );
  assert.equal(
    PREVIEW_INTERVIEW_AGENT_DEPLOYMENT_ID,
    "CA_ovn67QQ7ywmJ"
  );
  assert.equal(
    PREVIEW_DEMO_AGENT_DEPLOYMENT_ID,
    PREVIEW_INTERVIEW_AGENT_DEPLOYMENT_ID
  );
  assert.notEqual(
    PREVIEW_LIVEKIT_IDENTITY.demoAgentName,
    PREVIEW_LIVEKIT_IDENTITY.interviewAgentName
  );
});
