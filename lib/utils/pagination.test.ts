import assert from "node:assert/strict";
import test from "node:test";

import { parseNonNegativeIntegerParam } from "./pagination";

test("pagination integers preserve absent defaults and valid values", () => {
  assert.equal(parseNonNegativeIntegerParam(null, 20), 20);
  assert.equal(parseNonNegativeIntegerParam("0", 20), 0);
  assert.equal(parseNonNegativeIntegerParam("100", 20), 100);
  assert.equal(
    parseNonNegativeIntegerParam(String(Number.MAX_SAFE_INTEGER), 20),
    Number.MAX_SAFE_INTEGER
  );
});

test("pagination integers reject partial, signed, fractional, and unsafe values", () => {
  for (const value of [
    "",
    "20junk",
    " 20",
    "+20",
    "-1",
    "1.5",
    "NaN",
    "Infinity",
    "9007199254740992",
    "9".repeat(400),
  ]) {
    assert.equal(parseNonNegativeIntegerParam(value, 20), null, value);
  }
});
