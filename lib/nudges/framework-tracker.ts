/**
 * Framework Tracker - Real-time framework coverage analysis
 * Workstream #7 - Tracks PM framework adherence and generates intelligent nudges
 */

import {
  InterviewType,
  InterviewFramework,
  FrameworkCoverage,
  NudgeDecision,
  TranscriptTurn,
} from "@/lib/types/nudges";

/**
 * Framework definitions with keyword-based detection
 */
type FrameworkDefinitionKey =
  | "product_sense"
  | "analytical"
  | "leadership"
  | "strategy";

const FRAMEWORKS: Record<FrameworkDefinitionKey, InterviewFramework> = {
  product_sense: {
    type: "product_sense",
    elements: [
      {
        id: "clarify",
        name: "Clarify",
        keywords: ["clarify", "understand", "question", "assumptions", "assume", "context", "what if", "who is", "define"],
        detected: false,
      },
      {
        id: "user",
        name: "User",
        keywords: ["user", "customer", "persona", "segment", "audience", "target", "who", "demographic"],
        detected: false,
      },
      {
        id: "pain",
        name: "Pain",
        keywords: ["pain", "problem", "frustration", "challenge", "struggle", "difficulty", "issue", "need"],
        detected: false,
      },
      {
        id: "solution",
        name: "Solution",
        keywords: ["solution", "feature", "build", "design", "create", "implement", "develop", "product"],
        detected: false,
      },
      {
        id: "metrics",
        name: "Metrics",
        keywords: ["metric", "measure", "kpi", "data", "number", "%", "percentage", "rate", "engagement", "revenue"],
        detected: false,
      },
    ],
  },
  analytical: {
    type: "analytical",
    elements: [
      {
        id: "goal",
        name: "Goal",
        keywords: ["goal", "objective", "outcome", "target", "aim", "purpose", "mission"],
        detected: false,
      },
      {
        id: "metrics",
        name: "Metrics",
        keywords: ["metric", "measure", "kpi", "success criteria", "indicator", "benchmark", "data point"],
        detected: false,
      },
      {
        id: "data",
        name: "Data",
        keywords: ["data", "analysis", "research", "evidence", "study", "survey", "analytics", "information"],
        detected: false,
      },
      {
        id: "analysis",
        name: "Analysis",
        keywords: ["because", "therefore", "insight", "finding", "conclusion", "pattern", "trend", "correlation"],
        detected: false,
      },
      {
        id: "recommendation",
        name: "Recommendation",
        keywords: ["recommend", "suggest", "propose", "should", "advise", "conclusion", "next step"],
        detected: false,
      },
    ],
  },
  leadership: {
    type: "leadership",
    elements: [
      {
        id: "situation",
        name: "Situation",
        keywords: ["situation", "context", "background", "when", "where", "scenario", "circumstance"],
        detected: false,
      },
      {
        id: "task",
        name: "Task",
        keywords: ["task", "responsibility", "challenge", "goal", "objective", "role", "assigned"],
        detected: false,
      },
      {
        id: "action",
        name: "Action",
        keywords: ["action", "did", "decided", "implemented", "executed", "led", "organized", "initiated"],
        detected: false,
      },
      {
        id: "result",
        name: "Result",
        keywords: ["result", "outcome", "impact", "achieved", "accomplished", "delivered", "success", "improved"],
        detected: false,
      },
    ],
  },
  strategy: {
    type: "strategy",
    elements: [
      {
        id: "market",
        name: "Market",
        keywords: ["market", "industry", "tam", "opportunity", "size", "growth", "landscape", "sector"],
        detected: false,
      },
      {
        id: "competition",
        name: "Competition",
        keywords: ["competitor", "competitive", "vs", "alternative", "rival", "threat", "substitute"],
        detected: false,
      },
      {
        id: "positioning",
        name: "Positioning",
        keywords: ["differentiate", "unique", "value prop", "positioning", "advantage", "moat", "distinctive"],
        detected: false,
      },
      {
        id: "execution",
        name: "Execution",
        keywords: ["roadmap", "launch", "execute", "timeline", "plan", "strategy", "implementation", "rollout"],
        detected: false,
      },
    ],
  },
};

/**
 * FrameworkTracker class - Analyzes transcript turns and tracks framework coverage
 */
export class FrameworkTracker {
  private interviewType: InterviewType;
  private framework: InterviewFramework;
  private sessionStartTime: number;
  private lastNudgeTime: number;
  private currentElementStartTime: number | null;
  private currentElementId: string | null;

  constructor(interviewType: InterviewType, sessionStartTime?: number) {
    this.interviewType = interviewType;
    this.framework = JSON.parse(
      JSON.stringify(FRAMEWORKS[getFrameworkDefinitionKey(interviewType)])
    ); // Deep copy
    this.framework.type = interviewType;
    this.sessionStartTime = sessionStartTime || Date.now();
    this.lastNudgeTime = this.sessionStartTime;
    this.currentElementStartTime = null;
    this.currentElementId = null;
  }

  /**
   * Analyzes a single transcript turn and updates framework coverage
   */
  analyzeTurn(turn: TranscriptTurn): FrameworkCoverage {
    if (turn.speaker !== "user") {
      return this.getCoverage();
    }

    const text = turn.text.toLowerCase();
    const turnTime = turn.timestamp;

    // Check each framework element for keyword matches
    for (const element of this.framework.elements) {
      const hasKeyword = element.keywords.some((keyword) =>
        text.includes(keyword.toLowerCase())
      );

      if (hasKeyword && !element.detected) {
        // First mention of this element
        element.detected = true;
        element.firstMentionAt = Math.floor((turnTime - this.sessionStartTime) / 1000);
        this.currentElementId = element.id;
        this.currentElementStartTime = turnTime;
      } else if (hasKeyword && element.detected) {
        // Still talking about this element
        this.currentElementId = element.id;
        if (this.currentElementStartTime) {
          element.timeSpent = Math.floor((turnTime - this.currentElementStartTime) / 1000);
        }
      }
    }

    return this.getCoverage();
  }

  /**
   * Returns current framework coverage state
   */
  getCoverage(): FrameworkCoverage {
    const detectedCount = this.framework.elements.filter((e) => e.detected).length;
    const totalCount = this.framework.elements.length;
    const coveragePercentage = Math.round((detectedCount / totalCount) * 100);
    const elapsedTime = Math.floor((Date.now() - this.sessionStartTime) / 1000);

    return {
      interviewType: this.interviewType,
      elements: this.framework.elements,
      coveragePercentage,
      currentElement: this.currentElementId,
      elapsedTime,
    };
  }

  /**
   * Returns list of framework elements not yet mentioned
   */
  getMissingElements(): string[] {
    return this.framework.elements
      .filter((e) => !e.detected)
      .map((e) => e.name);
  }

  /**
   * Decides if a nudge should be generated based on current coverage and timing
   */
  shouldNudge(timeElapsed?: number): NudgeDecision {
    const coverage = this.getCoverage();
    const elapsed = timeElapsed || coverage.elapsedTime;
    const timeSinceLastNudge = elapsed - Math.floor((this.lastNudgeTime - this.sessionStartTime) / 1000);

    // Don't nudge too frequently (minimum 30 seconds between nudges)
    if (timeSinceLastNudge < 30) {
      return { shouldNudge: false, nudgeType: null, message: "", priority: "low" };
    }

    // Rule 1: No metrics mentioned after 90 seconds
    const metricsElement = this.framework.elements.find(
      (e) => e.id === "metrics" || e.name === "Metrics"
    );
    if (
      elapsed >= 90 &&
      metricsElement &&
      !metricsElement.detected &&
      (this.interviewType === "product_sense" ||
        this.interviewType === "analytical" ||
        this.interviewType === "execution")
    ) {
      this.lastNudgeTime = Date.now();
      return {
        shouldNudge: true,
        nudgeType: "quantify",
        message: "Can you quantify that? What metrics would you track?",
        priority: "high",
        context: {
          missingElements: [metricsElement.name],
        },
      };
    }

    // Rule 2: Spending too long on one element (>60 seconds)
    const currentElement = this.framework.elements.find((e) => e.id === this.currentElementId);
    if (currentElement && currentElement.timeSpent && currentElement.timeSpent > 60) {
      this.lastNudgeTime = Date.now();
      return {
        shouldNudge: true,
        nudgeType: "move_on",
        message: `You've covered ${currentElement.name} well. Let's move to the next part.`,
        priority: "medium",
        context: {
          currentElement: currentElement.name,
          timeOnCurrentElement: currentElement.timeSpent,
        },
      };
    }

    // Rule 3: Skipped clarifying questions (Product Sense specific)
    const clarifyElement = this.framework.elements.find((e) => e.id === "clarify");
    if (
      this.interviewType === "product_sense" &&
      elapsed >= 45 &&
      clarifyElement &&
      !clarifyElement.detected
    ) {
      this.lastNudgeTime = Date.now();
      return {
        shouldNudge: true,
        nudgeType: "clarify",
        message: "Before we continue, what clarifying questions would you ask first?",
        priority: "high",
        context: {
          missingElements: [clarifyElement.name],
        },
      };
    }

    // Rule 4: Missing multiple elements at midpoint (>3 minutes)
    const missingElements = this.getMissingElements();
    if (elapsed >= 180 && missingElements.length >= 2) {
      this.lastNudgeTime = Date.now();
      return {
        shouldNudge: true,
        nudgeType: "missing_element",
        message: `You haven't covered ${missingElements[0]} yet. Can you speak to that?`,
        priority: "medium",
        context: {
          missingElements,
        },
      };
    }

    // Rule 5: No elements detected after 60 seconds (early intervention)
    if (elapsed >= 60 && coverage.coveragePercentage === 0) {
      this.lastNudgeTime = Date.now();
      return {
        shouldNudge: true,
        nudgeType: "missing_element",
        message: this.getFrameworkStarterPrompt(),
        priority: "high",
        context: {
          missingElements: this.framework.elements.map((e) => e.name),
        },
      };
    }

    return { shouldNudge: false, nudgeType: null, message: "", priority: "low" };
  }

  /**
   * Returns a framework-specific starter prompt for nudges
   */
  private getFrameworkStarterPrompt(): string {
    switch (this.interviewType) {
      case "product_sense":
        return "Let's start by clarifying the question. What assumptions would you want to validate?";
      case "analytical":
      case "execution":
        return "What's the goal we're trying to achieve here? Let's define that first.";
      case "leadership":
      case "behavioral":
        return "Can you set the context? What was the situation you were in?";
      case "strategy":
        return "Let's start with the market landscape. What's the opportunity?";
      default:
        return "Can you walk me through your framework for approaching this?";
    }
  }

  /**
   * Resets the tracker for a new session
   */
  reset(sessionStartTime?: number): void {
    this.framework = JSON.parse(
      JSON.stringify(FRAMEWORKS[getFrameworkDefinitionKey(this.interviewType)])
    );
    this.framework.type = this.interviewType;
    this.sessionStartTime = sessionStartTime || Date.now();
    this.lastNudgeTime = this.sessionStartTime;
    this.currentElementStartTime = null;
    this.currentElementId = null;
  }

  /**
   * Returns a summary of the current session for debugging
   */
  getDebugSummary(): {
    interviewType: InterviewType;
    coverage: FrameworkCoverage;
    missingElements: string[];
    detectedElements: string[];
    sessionDuration: number;
  } {
    const coverage = this.getCoverage();
    const detected = this.framework.elements.filter((e) => e.detected).map((e) => e.name);
    const missing = this.getMissingElements();

    return {
      interviewType: this.interviewType,
      coverage,
      missingElements: missing,
      detectedElements: detected,
      sessionDuration: coverage.elapsedTime,
    };
  }
}

/**
 * Factory function to create a FrameworkTracker instance
 */
export function createFrameworkTracker(
  interviewType: InterviewType,
  sessionStartTime?: number
): FrameworkTracker {
  return new FrameworkTracker(interviewType, sessionStartTime);
}

/**
 * Utility function to check if text contains framework keywords
 */
export function detectFrameworkKeywords(
  text: string,
  interviewType: InterviewType
): { element: string; keywords: string[] }[] {
  const framework = FRAMEWORKS[getFrameworkDefinitionKey(interviewType)];
  const detections: { element: string; keywords: string[] }[] = [];
  const lowerText = text.toLowerCase();

  for (const element of framework.elements) {
    const foundKeywords = element.keywords.filter((keyword) =>
      lowerText.includes(keyword.toLowerCase())
    );
    if (foundKeywords.length > 0) {
      detections.push({ element: element.name, keywords: foundKeywords });
    }
  }

  return detections;
}

function getFrameworkDefinitionKey(
  interviewType: InterviewType
): FrameworkDefinitionKey {
  if (interviewType === "execution") {
    return "analytical";
  }

  if (interviewType === "behavioral") {
    return "leadership";
  }

  return interviewType;
}
