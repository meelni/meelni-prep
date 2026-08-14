import assert from "node:assert/strict";
import test from "node:test";

import {
  isTranscriptRuntimeSettlementCommandAck,
  isTranscriptRuntimeSettlementCommandPull,
} from "@meelni/agent";
import {
  RUNTIME_SETTLEMENT_COMMAND_FIXTURE,
  RUNTIME_SETTLEMENT_FAILURE_FIXTURES,
} from "./runtime-settlement-command";

test("runtime settlement fixtures are provider-free and generation fenced", () => {
  assert.equal(
    isTranscriptRuntimeSettlementCommandPull(
      RUNTIME_SETTLEMENT_COMMAND_FIXTURE.pull
    ),
    true
  );
  assert.equal(
    isTranscriptRuntimeSettlementCommandAck(
      RUNTIME_SETTLEMENT_COMMAND_FIXTURE.acknowledgement
    ),
    true
  );
  assert.equal(
    RUNTIME_SETTLEMENT_COMMAND_FIXTURE.command.writer_generation,
    RUNTIME_SETTLEMENT_COMMAND_FIXTURE.pull.writer_generation
  );
  assert.equal(
    JSON.stringify(RUNTIME_SETTLEMENT_COMMAND_FIXTURE).includes("text"),
    false
  );
  assert.deepEqual(
    RUNTIME_SETTLEMENT_FAILURE_FIXTURES.map(({ name }) => name),
    [
      "lost_packet",
      "candidate_disconnect",
      "replacement_writer",
      "bounded_timeout",
      "already_terminal",
    ]
  );
});
