/**
 * Test Demo Component for NudgeOverlay
 *
 * This file demonstrates how the NudgeOverlay component will look with different nudge types.
 * Can be used for manual testing and visual QA.
 *
 * Usage:
 * Import this component in a test page and click the buttons to see different nudges.
 */

"use client";

import { useState } from "react";
import { NudgeOverlay, Nudge, FrameworkCoverage, NudgeType } from "./nudge-overlay";

const mockFrameworkCoverage: FrameworkCoverage = [
  { name: "Clarify", covered: true },
  { name: "Customers", covered: true },
  { name: "Problem", covered: false },
  { name: "Solution", covered: false },
  { name: "Tradeoffs", covered: false },
];

const mockNudges: Record<NudgeType, Nudge> = {
  metric_missing: {
    type: "metric_missing",
    message: "Can you quantify that? Consider adding specific numbers or metrics.",
  },
  move_on: {
    type: "move_on",
    message: "Great insights! Let's move to the next part of the framework.",
  },
  clarify_first: {
    type: "clarify_first",
    message: "What questions would you ask first to better understand the problem?",
  },
  framework_element: {
    type: "framework_element",
    message: "Consider discussing the tradeoffs of your proposed solution.",
  },
};

export function NudgeOverlayTestDemo() {
  const [currentNudge, setCurrentNudge] = useState<Nudge | null>(null);
  const [coverage, setCoverage] = useState<FrameworkCoverage>(mockFrameworkCoverage);

  const showNudge = (type: NudgeType) => {
    setCurrentNudge(mockNudges[type]);
  };

  const toggleCoverageElement = (index: number) => {
    setCoverage((prev) =>
      prev.map((el, i) => (i === index ? { ...el, covered: !el.covered } : el))
    );
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">NudgeOverlay Test Demo</h1>
          <p className="text-muted-foreground">
            Click buttons to test different nudge types and framework coverage states.
          </p>
        </div>

        {/* Nudge Type Buttons */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Test Nudge Types</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => showNudge("metric_missing")}
              className="p-4 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors"
            >
              📊 Metric Missing
            </button>
            <button
              onClick={() => showNudge("move_on")}
              className="p-4 bg-purple-500/10 text-purple-500 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-colors"
            >
              ⏭️ Move On
            </button>
            <button
              onClick={() => showNudge("clarify_first")}
              className="p-4 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors"
            >
              ❓ Clarify First
            </button>
            <button
              onClick={() => showNudge("framework_element")}
              className="p-4 bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
            >
              💡 Framework Element
            </button>
          </div>
        </div>

        {/* Framework Coverage Controls */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Framework Coverage Controls</h2>
          <div className="grid grid-cols-5 gap-4">
            {coverage.map((element, index) => (
              <button
                key={index}
                onClick={() => toggleCoverageElement(index)}
                className={`p-4 rounded-lg border transition-colors ${
                  element.covered
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-muted/50 text-muted-foreground border-border"
                }`}
              >
                <div className="text-sm font-medium">{element.name}</div>
                <div className="text-xs mt-1">
                  {element.covered ? "✅ Covered" : "⚪ Not Covered"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Clear Nudge Button */}
        <div>
          <button
            onClick={() => setCurrentNudge(null)}
            className="px-6 py-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg hover:bg-destructive/20 transition-colors"
          >
            Clear Current Nudge
          </button>
        </div>

        {/* Instructions */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-2">How to Test:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>Click any nudge type button to display that nudge in the top-right corner</li>
            <li>Nudges will auto-dismiss after 5 seconds</li>
            <li>Click the X button on a nudge to dismiss it manually</li>
            <li>Press ESC key to dismiss the current nudge</li>
            <li>Toggle framework elements to see the progress indicator update</li>
            <li>The progress bar and percentage update based on covered elements</li>
          </ul>
        </div>
      </div>

      {/* NudgeOverlay Component */}
      <NudgeOverlay
        nudge={currentNudge}
        frameworkCoverage={coverage}
        onDismiss={() => setCurrentNudge(null)}
      />
    </div>
  );
}
