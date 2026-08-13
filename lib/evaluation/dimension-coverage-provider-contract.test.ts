import assert from "node:assert/strict";
import test from "node:test";

import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
} from "@meelni/test-fixtures";
import { deriveCandidateAnswerBlocks } from "@meelni/core";
import { getDimensionCoveragePrompt } from "./dimension-coverage-prompt";
import {
  getDimensionCoverageProviderResponseFormat,
  getDimensionCoverageProviderResponseFormatContractHash,
} from "./dimension-coverage-provider-format";

test("provider contract is strict, closed, and hash-stable", () => {
  const blocks = deriveCandidateAnswerBlocks(
    createAnswerBlockSegmentationFixture(1).events
  ).blocks;
  const format = getDimensionCoverageProviderResponseFormat(
    "product_sense",
    blocks,
    true
  );
  assert.equal(format.type, "json_schema");
  assert.equal(format.json_schema.strict, true);
  assert.equal(format.json_schema.schema.additionalProperties, false);
  assert.match(
    getDimensionCoverageProviderResponseFormatContractHash(),
    /^[a-f0-9]{64}$/
  );
  const serialized = JSON.stringify(format);
  assert.doesNotMatch(
    serialized,
    /narrative|confidence|overallScore|eventId|quote/
  );
});

test("qualitative-only provider schema permits no numerical score", () => {
  const blocks = deriveCandidateAnswerBlocks(
    createAnswerBlockSegmentationFixture(1).events
  ).blocks;
  const format = getDimensionCoverageProviderResponseFormat(
    "behavioral",
    blocks,
    false
  );
  const structure =
    format.json_schema.schema.properties.dimensions.properties.structure;
  assert.deepEqual(structure.properties.score, { type: "null" });
});

test("equivalent segmentation produces identical provider prompt and schema", () => {
  const projections = ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => {
    const blocks = deriveCandidateAnswerBlocks(
      createAnswerBlockSegmentationFixture(segmentCount).events
    ).blocks;
    return {
      prompt: getDimensionCoveragePrompt("execution", blocks, true),
      format: getDimensionCoverageProviderResponseFormat(
        "execution",
        blocks,
        true
      ),
    };
  });
  for (const projection of projections.slice(1)) {
    assert.deepEqual(projection, projections[0]);
  }
  assert.doesNotMatch(projections[0]!.prompt, /candidate-segment-/);
  assert.match(projections[0]!.prompt, /answer-block:0001/);
});
