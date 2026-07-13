import assert from "node:assert/strict";
import test from "node:test";

import { inngestSourceFunctions } from "@/app/api/inngest/route";

const EXPECTED_SOURCE_FUNCTION_IDS = [
  "feedback-generate",
  "insights-update",
  "account-deletion",
  "account-deletion-recovery",
  "interview-deadline-enforce",
  "interview-deadline-recovery",
  "interview-reconnect-enforce",
  "interview-reconnect-recovery",
  "interview-room-cleanup",
  "interview-room-cleanup-recovery",
  "interview-presence-reconciliation",
  "interview-presence-reconciliation-recovery",
  "interview-start-recovery",
  "interview-credit-recovery",
] as const;

type InventoryFunction = {
  opts: {
    id: string;
    onFailure?: unknown;
  };
  getConfig(input: {
    appPrefix: string;
    baseUrl: URL;
  }): Array<{ id: string; name: string }>;
};

test("Inngest inventory includes 14 source functions and one generated failure handler", () => {
  const functions = inngestSourceFunctions as unknown as InventoryFunction[];
  const sourceIds = functions.map((fn) => fn.opts.id);

  assert.deepEqual(sourceIds, [...EXPECTED_SOURCE_FUNCTION_IDS]);
  assert.equal(new Set(sourceIds).size, 14);
  assert.deepEqual(
    functions.filter((fn) => fn.opts.onFailure).map((fn) => fn.opts.id),
    ["feedback-generate"]
  );

  const registeredConfigs = functions.flatMap((fn) =>
    fn.getConfig({
      appPrefix: "meelni",
      baseUrl: new URL("https://preview.example.com/api/inngest"),
    })
  );
  const generatedFailureHandlers = registeredConfigs.filter(({ id }) =>
    id.endsWith("-failure")
  );

  assert.equal(registeredConfigs.length, 15);
  assert.deepEqual(
    generatedFailureHandlers.map(({ id, name }) => ({ id, name })),
    [
      {
        id: "meelni-feedback-generate-failure",
        name: "Generate Interview Feedback (failure)",
      },
    ]
  );
});
