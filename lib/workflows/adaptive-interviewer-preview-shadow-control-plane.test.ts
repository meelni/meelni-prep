import assert from "node:assert/strict";
import test from "node:test";

import {
  PreviewShadowControlPlaneError,
  type DurablePreviewShadowControlPlaneStore,
} from "@/lib/db/adaptive-interviewer-preview-shadow-control-plane";
import { createDurablePreviewShadowControlPlaneWorkflow } from "./adaptive-interviewer-preview-shadow-control-plane";

test("workflow construction and activation reject reflection traps content-free", async () => {
  const hostile = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("raw-owner-capability-secret");
      },
    }
  );
  assert.throws(
    () =>
      createDurablePreviewShadowControlPlaneWorkflow(
        hostile as Parameters<
          typeof createDurablePreviewShadowControlPlaneWorkflow
        >[0]
      ),
    closedInvalid
  );

  const store = {
    activate: async () => {
      throw new Error("must-not-run");
    },
  } as unknown as DurablePreviewShadowControlPlaneStore;
  const workflow = createDurablePreviewShadowControlPlaneWorkflow({
    store,
    ownerDecisionVerifier: {
      verify() {
        throw new Error("raw-signature-secret");
      },
    },
    ownerKeyRegistry: {} as never,
    clock: () => new Date("2026-08-20T12:00:00.000Z"),
  });
  await assert.rejects(
    () => workflow.activate(hostile as never),
    closedInvalid
  );
  await assert.rejects(
    () =>
      workflow.activate({
        artifact: null,
        authorization: null,
        context: {} as never,
        runControlCapability: "x",
      }),
    (error: unknown) => {
      assert.ok(error instanceof PreviewShadowControlPlaneError);
      assert.equal(error.code, "preview_shadow_control_plane_unauthenticated");
      assert.doesNotMatch(error.message, /secret/);
      return true;
    }
  );
});

function closedInvalid(error: unknown): boolean {
  assert.ok(error instanceof PreviewShadowControlPlaneError);
  assert.equal(error.code, "preview_shadow_control_plane_invalid");
  assert.doesNotMatch(error.message, /secret/);
  return true;
}
