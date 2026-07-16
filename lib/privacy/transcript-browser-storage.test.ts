import assert from "node:assert/strict";
import test from "node:test";

import { scrubRetiredTranscriptBrowserStorage } from "./transcript-browser-storage";

test("retired transcript blobs are removed without being read", () => {
  const removed: string[] = [];
  const storage = {
    removeItem(key: string) {
      removed.push(key);
    },
    getItem() {
      throw new Error("retired transcript values must never be read");
    },
  };
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage, sessionStorage: storage },
  });
  try {
    scrubRetiredTranscriptBrowserStorage();
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }

  assert.deepEqual(removed, [
    "transcript_queue",
    "transcript_queue",
    "transcript_queue_v2",
    "transcript_queue_v2",
  ]);
});
