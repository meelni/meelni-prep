import assert from "node:assert/strict";
import test from "node:test";

import { establishTranscriptEndCutoff } from "./transcript-end-settlement";

test("explicit end establishes its packet cutoff before draining", async () => {
  let endIntent = false;
  const acceptedPackets: string[] = [];

  const settlement = await establishTranscriptEndCutoff({
    setEndIntent: (value) => {
      endIntent = value;
    },
    flush: async () => {
      if (!endIntent) acceptedPackets.push("late-packet");
      return { settled: true, pending: 0, failed: 0 };
    },
  });

  assert.deepEqual(settlement, { settled: true, pending: 0, failed: 0 });
  assert.deepEqual(acceptedPackets, []);
  assert.equal(endIntent, true);
});

test("failed transcript settlement safely reopens packet acceptance", async () => {
  let endIntent = false;
  const settlement = await establishTranscriptEndCutoff({
    setEndIntent: (value) => {
      endIntent = value;
    },
    flush: async () => ({ settled: false, pending: 1, failed: 0 }),
  });

  assert.equal(settlement.settled, false);
  assert.equal(endIntent, false);
});

test("a drain exception safely reopens packet acceptance", async () => {
  let endIntent = false;
  await assert.rejects(
    establishTranscriptEndCutoff({
      setEndIntent: (value) => {
        endIntent = value;
      },
      flush: async () => {
        throw new Error("storage unavailable");
      },
    }),
    /storage unavailable/
  );
  assert.equal(endIntent, false);
});
