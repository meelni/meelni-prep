import assert from "node:assert/strict";
import test from "node:test";

import { deriveCandidateAnswerBlocks } from "@meelni/core";
import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
} from "./answer-blocks";

test("synthetic answer-block fixtures retain every generated source event", () => {
  for (const segmentCount of ANSWER_BLOCK_SEGMENT_COUNTS) {
    const fixture = createAnswerBlockSegmentationFixture(segmentCount);
    const derived = deriveCandidateAnswerBlocks(fixture.events);
    assert.equal(derived.blocks.length, 2);
    assert.equal(
      derived.blocks.reduce((sum, block) => sum + block.response.length, 0),
      segmentCount * 2
    );
    assert.ok(
      derived.blocks.every((block) =>
        block.response.every((source) =>
          source.eventId.startsWith("synthetic-")
        )
      )
    );
  }
});
