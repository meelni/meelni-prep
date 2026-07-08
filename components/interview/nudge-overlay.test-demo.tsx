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

import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  HelpCircle,
  Lightbulb,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  NudgeOverlay,
  Nudge,
  NudgeType,
} from "./nudge-overlay";

const mockNudges: Record<NudgeType, Nudge> = {
  quantify: {
    type: "quantify",
    message: "Can you quantify that? Consider adding specific numbers or metrics.",
  },
  move_on: {
    type: "move_on",
    message: "Great insights! Let's move to the next part of the framework.",
  },
  clarify: {
    type: "clarify",
    message: "What questions would you ask first to better understand the problem?",
  },
  missing_element: {
    type: "missing_element",
    message: "Consider discussing the tradeoffs of your proposed solution.",
  },
  time_limit: {
    type: "time_limit",
    message: "You're spending a while here. Wrap this point and move forward.",
  },
};

const nudgeDemoButtons: Array<{
  type: NudgeType;
  label: string;
  icon: LucideIcon;
  className: string;
}> = [
  {
    type: "quantify",
    label: "Quantify",
    icon: TrendingUp,
    className:
      "border-info/20 bg-info/10 text-info hover:bg-info/15 hover:text-info",
  },
  {
    type: "move_on",
    label: "Move On",
    icon: ArrowRight,
    className:
      "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
  },
  {
    type: "clarify",
    label: "Clarify",
    icon: HelpCircle,
    className:
      "border-warning/20 bg-warning/10 text-warning hover:bg-warning/15 hover:text-warning",
  },
  {
    type: "missing_element",
    label: "Missing Element",
    icon: Lightbulb,
    className:
      "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
  },
];

export function NudgeOverlayTestDemo() {
  const [currentNudge, setCurrentNudge] = useState<Nudge | null>(null);

  const showNudge = (type: NudgeType) => {
    setCurrentNudge(mockNudges[type]);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">NudgeOverlay Test Demo</h1>
          <p className="text-muted-foreground">
            Click buttons to test different nudge types.
          </p>
        </div>

        {/* Nudge Type Buttons */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Test Nudge Types</h2>
          <div className="grid grid-cols-2 gap-4">
            {nudgeDemoButtons.map(({ type, label, icon: Icon, className }) => (
              <Button
                key={type}
                type="button"
                variant="outline"
                onClick={() => showNudge(type)}
                className={`h-auto justify-start gap-3 rounded-lg p-4 ${className}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Clear Nudge Button */}
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentNudge(null)}
            className="border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
          >
            Clear Current Nudge
          </Button>
        </div>

        {/* Instructions */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-2">How to Test:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>Click any nudge type button to display that nudge in the top-right corner</li>
            <li>Nudges will auto-dismiss after 5 seconds</li>
            <li>Click the X button on a nudge to dismiss it manually</li>
            <li>Press ESC key to dismiss the current nudge</li>
          </ul>
        </div>
      </div>

      {/* NudgeOverlay Component */}
      <NudgeOverlay
        nudge={currentNudge}
        onDismiss={() => setCurrentNudge(null)}
      />
    </div>
  );
}
