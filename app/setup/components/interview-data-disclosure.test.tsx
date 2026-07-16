import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InterviewDataDisclosure } from "./interview-data-disclosure";

test("interview launch discloses audio processing and transcript storage truthfully", () => {
  const html = renderToStaticMarkup(<InterviewDataDisclosure />);

  assert.match(html, /Audio is processed live by configured voice providers/);
  assert.match(html, /Transcript text is stored for feedback and review/);
  assert.match(
    html,
    /Meelni application does not create or store a replayable interview recording/
  );
  assert.doesNotMatch(html, /providers? (?:do not|does not) retain/i);
  assert.doesNotMatch(html, /recording is saved|choose whether to save/i);
});
