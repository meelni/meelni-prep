/**
 * Framework Tracker Tests & Usage Examples
 * Demonstrates how the framework tracker works
 */

import { FrameworkTracker, createFrameworkTracker, detectFrameworkKeywords } from "./framework-tracker";
import { TranscriptTurn } from "@/lib/types/nudges";
import assert from "node:assert/strict";
import test from "node:test";

/**
 * Example Usage 1: Product Sense Interview
 */
function exampleProductSense() {
  console.log("=== Product Sense Interview Example ===\n");

  const tracker = createFrameworkTracker("product_sense", Date.now());

  // Simulate user turns
  const turns: TranscriptTurn[] = [
    {
      id: "1",
      speaker: "user",
      text: "Let me start by clarifying a few assumptions. Who is the target user for this product?",
      timestamp: Date.now(),
    },
    {
      id: "2",
      speaker: "interviewer",
      text: "Good question. Let's say it's for college students.",
      timestamp: Date.now() + 5000,
    },
    {
      id: "3",
      speaker: "user",
      text: "Okay, so the main pain point I see is that students struggle with time management and often miss deadlines.",
      timestamp: Date.now() + 30000,
    },
    {
      id: "4",
      speaker: "user",
      text: "We could build a solution that sends smart reminders and helps them prioritize tasks.",
      timestamp: Date.now() + 60000,
    },
  ];

  // Analyze each turn
  for (const turn of turns) {
    const coverage = tracker.analyzeTurn(turn);
    console.log(`Turn ${turn.id} (${turn.speaker}):`);
    console.log(`  Coverage: ${coverage.coveragePercentage}%`);
    console.log(`  Detected: ${coverage.elements.filter((e) => e.detected).map((e) => e.name).join(", ")}`);
    console.log(`  Missing: ${tracker.getMissingElements().join(", ")}`);
    console.log();
  }

  // Check if nudge needed after 90 seconds
  const nudge = tracker.shouldNudge(95);
  if (nudge.shouldNudge) {
    console.log(`Nudge: ${nudge.message} (${nudge.priority} priority, type: ${nudge.nudgeType})`);
  } else {
    console.log("No nudge needed yet.");
  }

  console.log("\nDebug Summary:", tracker.getDebugSummary());
}

/**
 * Example Usage 2: Analytical Interview
 */
function exampleAnalytical() {
  console.log("\n\n=== Analytical Interview Example ===\n");

  const tracker = createFrameworkTracker("analytical", Date.now());

  const turns: TranscriptTurn[] = [
    {
      id: "1",
      speaker: "user",
      text: "The goal here is to increase user engagement on the platform.",
      timestamp: Date.now(),
    },
    {
      id: "2",
      speaker: "user",
      text: "We should measure this with metrics like daily active users and session duration.",
      timestamp: Date.now() + 30000,
    },
    {
      id: "3",
      speaker: "user",
      text: "Looking at the data, I found that users who complete onboarding have 3x higher retention.",
      timestamp: Date.now() + 60000,
    },
  ];

  for (const turn of turns) {
    const coverage = tracker.analyzeTurn(turn);
    console.log(`Turn ${turn.id}:`);
    console.log(`  Coverage: ${coverage.coveragePercentage}%`);
    console.log(`  Current Element: ${coverage.currentElement}`);
    console.log();
  }

  // Check coverage
  const coverage = tracker.getCoverage();
  console.log(`Final Coverage: ${coverage.coveragePercentage}%`);
  console.log(`Missing: ${tracker.getMissingElements().join(", ")}`);
}

/**
 * Example Usage 3: Nudge Timing Rules
 */
function exampleNudgeTiming() {
  console.log("\n\n=== Nudge Timing Examples ===\n");

  const tracker = createFrameworkTracker("product_sense", Date.now() - 95000); // 95 seconds ago

  // Simulate a user who hasn't mentioned metrics
  const turn: TranscriptTurn = {
    id: "1",
    speaker: "user",
    text: "The users are college students and their main problem is time management.",
    timestamp: Date.now(),
  };

  tracker.analyzeTurn(turn);

  console.log("Scenario: 95 seconds elapsed, no metrics mentioned");
  const nudge1 = tracker.shouldNudge(95);
  if (nudge1.shouldNudge) {
    console.log(`✓ Nudge triggered: "${nudge1.message}"`);
    console.log(`  Type: ${nudge1.nudgeType}, Priority: ${nudge1.priority}`);
  }

  // Scenario 2: Spending too long on one element
  console.log("\nScenario: Spending 65 seconds on 'Clarify' element");
  const tracker2 = createFrameworkTracker("product_sense", Date.now() - 65000);
  const longTurn: TranscriptTurn = {
    id: "2",
    speaker: "user",
    text: "Let me clarify more assumptions about the target users and their context.",
    timestamp: Date.now(),
  };
  tracker2.analyzeTurn(longTurn);

  // Manually set time spent (simulating extended conversation)
  const clarifyElement = tracker2.getCoverage().elements.find((e) => e.id === "clarify");
  if (clarifyElement) {
    clarifyElement.timeSpent = 65;
  }

  const nudge2 = tracker2.shouldNudge(70);
  if (nudge2.shouldNudge) {
    console.log(`✓ Nudge triggered: "${nudge2.message}"`);
    console.log(`  Type: ${nudge2.nudgeType}, Priority: ${nudge2.priority}`);
  }
}

/**
 * Example Usage 4: Keyword Detection Utility
 */
function exampleKeywordDetection() {
  console.log("\n\n=== Keyword Detection Example ===\n");

  const text = "The target users are college students who struggle with time management. We need to measure engagement with metrics like DAU and retention rate.";

  const detections = detectFrameworkKeywords(text, "product_sense");

  console.log("Text:", text);
  console.log("\nDetected framework elements:");
  for (const detection of detections) {
    console.log(`  - ${detection.element}: [${detection.keywords.join(", ")}]`);
  }
}

/**
 * Example Usage 5: Leadership (STAR) Interview
 */
function exampleLeadership() {
  console.log("\n\n=== Leadership (STAR) Interview Example ===\n");

  const tracker = createFrameworkTracker("leadership", Date.now());

  const turns: TranscriptTurn[] = [
    {
      id: "1",
      speaker: "user",
      text: "The situation was that our team was falling behind on a critical product launch.",
      timestamp: Date.now(),
    },
    {
      id: "2",
      speaker: "user",
      text: "My task was to get the project back on track and deliver on time.",
      timestamp: Date.now() + 20000,
    },
    {
      id: "3",
      speaker: "user",
      text: "I took action by reorganizing the team into smaller pods and implementing daily standups.",
      timestamp: Date.now() + 40000,
    },
    {
      id: "4",
      speaker: "user",
      text: "As a result, we delivered the product 2 weeks early with 95% bug-free rate.",
      timestamp: Date.now() + 60000,
    },
  ];

  for (const turn of turns) {
    const coverage = tracker.analyzeTurn(turn);
    console.log(`Turn ${turn.id}:`);
    console.log(`  Coverage: ${coverage.coveragePercentage}%`);
    console.log(`  Detected: ${coverage.elements.filter((e) => e.detected).map((e) => e.name).join(", ")}`);
  }

  const finalCoverage = tracker.getCoverage();
  console.log(`\nFinal Coverage: ${finalCoverage.coveragePercentage}% (${finalCoverage.elements.filter((e) => e.detected).length}/${finalCoverage.elements.length} elements)`);
}

/**
 * Run all examples
 */
export function runFrameworkTrackerExamples() {
  exampleProductSense();
  exampleAnalytical();
  exampleLeadership();
  exampleNudgeTiming();
  exampleKeywordDetection();
}

// Uncomment to run examples:
// runFrameworkTrackerExamples();

test("execution interviews use the analytical framework for nudges", () => {
  const tracker = createFrameworkTracker("execution", Date.now());
  const coverage = tracker.analyzeTurn({
    id: "execution-turn",
    speaker: "user",
    text: "The goal is retention, and I would measure cohort retention and activation metrics.",
    timestamp: Date.now(),
  });

  assert.equal(coverage.interviewType, "execution");
  assert.equal(
    coverage.elements.some((element) => element.name === "Metrics" && element.detected),
    true
  );
});

test("behavioral interviews use the leadership framework for nudges", () => {
  const tracker = createFrameworkTracker("behavioral", Date.now());
  const coverage = tracker.analyzeTurn({
    id: "behavioral-turn",
    speaker: "user",
    text: "The situation was tense, my task was alignment, and I led the action plan.",
    timestamp: Date.now(),
  });

  assert.equal(coverage.interviewType, "behavioral");
  assert.equal(
    coverage.elements.some((element) => element.name === "Situation" && element.detected),
    true
  );
});
