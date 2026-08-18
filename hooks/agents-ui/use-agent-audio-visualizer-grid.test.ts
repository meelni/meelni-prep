import assert from "node:assert/strict";
import test from "node:test";

import {
  generateConnectingSequence,
  generateListeningSequence,
  generateThinkingSequence,
} from "./use-agent-audio-visualizer-grid";

test("builds a bounded connecting ring", () => {
  const sequence = generateConnectingSequence(7, 7, 3);

  assert.equal(sequence.length, 24);
  assert.deepEqual(sequence[0], { x: 0, y: 0 });
  assert.deepEqual(sequence.at(-1), { x: 0, y: 1 });
});

test("uses distinct listening and thinking paths", () => {
  const listening = generateListeningSequence(7, 7);
  const thinking = generateThinkingSequence(7, 7);

  assert.deepEqual(listening[0], { x: 3, y: 3 });
  assert.ok(listening.slice(1).every(({ x, y }) => x === -1 && y === -1));
  assert.deepEqual(thinking[0], { x: 0, y: 3 });
  assert.deepEqual(thinking.at(-1), { x: 1, y: 3 });
});
