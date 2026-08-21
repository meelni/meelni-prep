import assert from "node:assert/strict";
import test from "node:test";

import { runPreviewShadowOperatorCli } from "./run-adaptive-interviewer-preview-shadow";

test("Preview-shadow operator help is provider-free and content-free", async () => {
  let output = "";
  const status = await runPreviewShadowOperatorCli([], {
    write(value: string) {
      output += value;
      return true;
    },
  });

  assert.equal(status, 0);
  assert.match(output, /Preview-shadow operator/);
  assert.match(output, /--packet-directory PATH/);
  assert.doesNotMatch(output, /token|capability\.txt|DATABASE_URL/);
});

test("Preview-shadow operator rejects unknown and incomplete authority options", async () => {
  await assert.rejects(
    () =>
      runPreviewShadowOperatorCli([
        "activate",
        "--packet-directory",
        "/tmp/external",
        "--unknown",
        "value",
      ]),
    /preview_shadow_operator_option_unknown/
  );
  await assert.rejects(
    () =>
      runPreviewShadowOperatorCli([
        "stop",
        "--activation-path",
        "/tmp/activation.json",
        "--env-file",
        "/tmp/preview.env",
        "--expected-revision",
        "1",
        "--reason",
        "kill_switch_failure",
        "--evidence-sha256",
        "a".repeat(64),
      ]),
    /preview_shadow_operator_packet-directory_required/
  );
});
