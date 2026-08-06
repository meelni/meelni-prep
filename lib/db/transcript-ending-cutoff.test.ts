import assert from "node:assert/strict";
import test from "node:test";

import { endingTranscriptCutoff } from "./transcripts";

const BASE_SESSION = {
  reconnectDeadlineAt: null,
  startedAt: new Date("2026-08-05T20:00:00.000Z"),
  config: { duration: 30 },
};

test("user-end evidence is cut off at the atomic ending timestamp", () => {
  const endingAt = new Date("2026-08-05T20:08:43.123Z");
  assert.equal(
    endingTranscriptCutoff({
      ...BASE_SESSION,
      terminalReason: "user_end",
      endingAt,
    })?.toISOString(),
    endingAt.toISOString()
  );
});

test("user-end cutoff is never inferred from wall-clock interview duration", () => {
  assert.equal(
    endingTranscriptCutoff({
      ...BASE_SESSION,
      terminalReason: "user_end",
      endingAt: null,
    }),
    null
  );
});
