import assert from "node:assert/strict";
import test from "node:test";
import {
  isTranscriptEvent,
  isTranscriptInterruptionMarker,
  isTranscriptRuntimeSettlement,
  isTranscriptRuntimeWriterRegistration,
} from "@meelni/agent";
import writerSequence6m14 from "../writer-sequence-6m14.json";

import { createFeedbackGoldenPathFixtures } from "./feedback-generation";

test("feedback golden fixtures use canonical writer lifecycle contracts", () => {
  const fixtures = createFeedbackGoldenPathFixtures();
  assert.deepEqual(
    new Set(fixtures.map((fixture) => fixture.roundType)),
    new Set(["product_sense", "behavioral", "strategy", "execution"])
  );
  assert.ok(fixtures.some((fixture) => fixture.id === "short-rich"));
  assert.ok(fixtures.some((fixture) => fixture.id === "long-silent"));
  assert.ok(fixtures.some((fixture) => fixture.id === "no-answer"));
  assert.ok(fixtures.some((fixture) => fixture.id === "corrupt"));

  for (const fixture of fixtures) {
    assert.equal(
      isTranscriptRuntimeWriterRegistration(fixture.writerRegistration),
      true,
      fixture.id
    );
    assert.ok(fixture.events.every(isTranscriptEvent), fixture.id);
    assert.ok(
      fixture.markers.every(isTranscriptInterruptionMarker),
      fixture.id
    );
    assert.equal(
      isTranscriptRuntimeSettlement(fixture.settlement),
      true,
      fixture.id
    );
  }
});

test("6m14 collision fixture uses one unique gap-free turn-marker namespace", () => {
  const fixture = createFeedbackGoldenPathFixtures().find(
    (candidate) => candidate.id === "turn-marker-6m14"
  );
  assert.ok(fixture);
  const sequences = [
    ...fixture.events.map((event) => event.sequence),
    ...fixture.markers.map((marker) => marker.sequence),
  ].sort((left, right) => left - right);
  assert.equal(new Set(sequences).size, sequences.length);
  assert.deepEqual(
    sequences,
    writerSequence6m14.allocations.map((allocation) => allocation.sequence)
  );
  assert.equal(
    Date.parse(fixture.settlement.settled_at) -
      Date.parse(fixture.writerRegistration.registered_at),
    writerSequence6m14.incidentDurationSeconds * 1_000
  );
  assert.equal(
    Date.parse(fixture.markers[0]!.occurred_at) -
      Date.parse(fixture.writerRegistration.registered_at),
    writerSequence6m14.markerOffsetSeconds * 1_000
  );
});
