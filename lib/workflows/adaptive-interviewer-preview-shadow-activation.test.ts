import assert from "node:assert/strict";
import test from "node:test";

import type { DurablePreviewShadowControlPlaneWorkflow } from "./adaptive-interviewer-preview-shadow-control-plane";
import {
  createPreviewShadowActivationContext,
  createPreviewShadowActivationRequestWorkflow,
  isPreviewShadowActivationRequest,
  PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION,
  PREVIEW_SHADOW_ACTIVATION_REQUEST_VERSION,
} from "./adaptive-interviewer-preview-shadow-activation";

test("staging activation delegates exact owner material and returns the private receipt", async () => {
  const calls: unknown[] = [];
  const run = {
    run_id: "a".repeat(64),
    candidate_git_sha: "b".repeat(40),
    revision: 1,
  } as never;
  const controlPlane = {
    activate: async (input: unknown) => {
      calls.push(input);
      return { outcome: "activated" as const, run };
    },
  } as DurablePreviewShadowControlPlaneWorkflow;
  const context = createPreviewShadowActivationContext("b".repeat(40));
  assert.equal(
    context.previewShadowConfigurationSha256,
    "c6db8b06428fde9a7ffb13d78641e66efc584203c7862db93de42a9d9d64d89c"
  );
  assert.equal(
    context.selectedCandidateConfigurationSha256,
    "b8cc8547c6d2573b7d323b3327ab31bf74c237a1486c13e0e7780a63880e25ac"
  );
  assert.equal(context.targetStage, "preview_shadow");
  assert.equal(context.targetEnvironment, "preview_staging");
  assert.equal(context.targetCohort, "shadow");
  assert.equal(context.exposure, "none");
  const workflow = createPreviewShadowActivationRequestWorkflow({
    controlPlane,
    context,
  });
  const request = {
    contract_version: PREVIEW_SHADOW_ACTIVATION_REQUEST_VERSION,
    action: "activate",
    payload: {
      artifact: { signed: true },
      authorization: { exact: true },
      run_control_capability: "c".repeat(43),
    },
  };

  assert.equal(isPreviewShadowActivationRequest(request), true);
  const result = await workflow.handle(request);
  assert.deepEqual(result, {
    contract_version: PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION,
    outcome: "activated",
    run,
  });
  assert.deepEqual(calls, [
    {
      artifact: { signed: true },
      authorization: { exact: true },
      context,
      runControlCapability: "c".repeat(43),
    },
  ]);
});

test("activation request and deployed SHA fail closed", async () => {
  assert.throws(
    () => createPreviewShadowActivationContext("not-a-sha"),
    /preview_shadow_activation_request_invalid/
  );
  assert.equal(isPreviewShadowActivationRequest({}), false);

  const workflow = createPreviewShadowActivationRequestWorkflow({
    controlPlane: {
      activate: async () => {
        throw new Error("must_not_run");
      },
    } as DurablePreviewShadowControlPlaneWorkflow,
    context: createPreviewShadowActivationContext("d".repeat(40)),
  });
  await assert.rejects(
    () =>
      workflow.handle({
        contract_version: PREVIEW_SHADOW_ACTIVATION_REQUEST_VERSION,
        action: "activate",
        payload: {
          artifact: {},
          authorization: {},
          run_control_capability: "short",
        },
      }),
    /preview_shadow_activation_request_invalid/
  );
  await assert.rejects(
    () =>
      workflow.handle({
        contract_version: PREVIEW_SHADOW_ACTIVATION_REQUEST_VERSION,
        action: "activate",
        payload: {
          artifact: {},
          authorization: {},
          run_control_capability: "e".repeat(43),
          extra: true,
        },
      }),
    /preview_shadow_activation_request_invalid/
  );
});
