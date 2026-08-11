#!/usr/bin/env tsx
/**
 * Provider-free feedback fixture inspector.
 *
 * The former database script was retired because it selected an arbitrary
 * existing user and inserted lifecycle rows directly. The canonical end-to-
 * end check now runs through `npm run test:feedback`.
 */

import {
  isTranscriptEvent,
  isTranscriptInterruptionMarker,
  isTranscriptRuntimeSettlement,
  isTranscriptRuntimeWriterRegistration,
} from "@meelni/agent";
import { createFeedbackGoldenPathFixtures } from "@meelni/test-fixtures";

import { assertNonProductionScriptEnvironment } from "./non-production-script-guard";

assertNonProductionScriptEnvironment();

const fixtures = createFeedbackGoldenPathFixtures();
for (const fixture of fixtures) {
  if (
    !isTranscriptRuntimeWriterRegistration(fixture.writerRegistration) ||
    !fixture.events.every(isTranscriptEvent) ||
    !fixture.markers.every(isTranscriptInterruptionMarker) ||
    !isTranscriptRuntimeSettlement(fixture.settlement)
  ) {
    throw new Error(`Invalid canonical feedback fixture: ${fixture.id}`);
  }
}

console.log(
  JSON.stringify(
    {
      providerFree: true,
      customerStateTouched: false,
      fixtureCount: fixtures.length,
      fixtures: fixtures.map((fixture) => ({
        id: fixture.id,
        roundType: fixture.roundType,
        expectedOutcome: fixture.expectedOutcome,
      })),
      goldenPathCommand: "npm run test:feedback",
    },
    null,
    2
  )
);
