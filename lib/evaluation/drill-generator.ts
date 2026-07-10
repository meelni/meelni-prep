/**
 * Drill Generator
 * Generates focused practice suggestions based on weak areas in interview performance
 */

import type { DrillSuggestion, RubricScores } from "@meelni/core";

/**
 * Drill templates for each dimension
 * Each template includes title, description, and actionable tips
 */
const DRILL_TEMPLATES = {
  structure: [
    {
      title: "Framework Flash Cards",
      description: "Practice applying structured frameworks to random interview questions",
      tips: [
        "Create flash cards with STAR, 5-step Product Sense, and Goal-Metric-Feature frameworks",
        "Time yourself: 60 seconds to outline structure before answering",
        "Record yourself applying frameworks to 5 practice questions per day",
      ],
    },
    {
      title: "Structure First Speaking",
      description: "Practice always starting answers with explicit structure",
      tips: [
        "Begin every answer with: 'I'll break this down into 3 parts...'",
        "Use signposting: 'First...', 'Second...', 'Finally...'",
        "End with a summary tying all parts together",
      ],
    },
  ],
  clarity: [
    {
      title: "Jargon Elimination Challenge",
      description: "Record and review your answers, removing all industry jargon",
      tips: [
        "Record 5-minute mock answer and transcribe it",
        "Highlight every acronym, buzzword, and technical term",
        "Rewrite explanation for a non-technical friend",
      ],
    },
    {
      title: "One-Sentence Summaries",
      description: "Practice condensing complex ideas into single clear sentences",
      tips: [
        "After each practice question, summarize answer in one sentence",
        "Use the 'So what?' test: if someone asks 'so what?', you weren't clear enough",
        "Practice explaining your product ideas to family members outside tech",
      ],
    },
  ],
  insight: [
    {
      title: "Metric-First Thinking",
      description: "Practice leading with quantitative impact in every answer",
      tips: [
        "Start every answer with a baseline metric or goal",
        "Estimate impact ranges: '20-30% improvement in retention'",
        "Tie every feature idea to a measurable business outcome",
      ],
    },
    {
      title: "Second-Order Thinking Practice",
      description: "Go beyond obvious insights by asking 'and then what?'",
      tips: [
        "For every solution, ask: 'What happens next? What are unintended consequences?'",
        "Practice identifying non-obvious trade-offs in product decisions",
        "Read post-mortems of product failures to see what was missed",
      ],
    },
  ],
  communication: [
    {
      title: "Pause and Pace Practice",
      description: "Record yourself and analyze pacing, filler words, and pauses",
      tips: [
        "Count filler words ('um', 'like', 'you know') in 5-minute recording",
        "Practice strategic pauses: breathe instead of saying 'um'",
        "Vary your pace: slow down for important points, speed up for context",
      ],
    },
    {
      title: "Active Interviewer Engagement",
      description: "Practice asking clarifying questions and checking for understanding",
      tips: [
        "Ask at least 2 clarifying questions before diving into answers",
        "Check in mid-answer: 'Does that make sense?', 'Should I go deeper here?'",
        "Summarize at milestones: 'So far I've covered X and Y, now let me talk about Z'",
      ],
    },
  ],
  leadership: [
    {
      title: "Impact Storytelling",
      description: "Practice telling stories that showcase ownership and results",
      tips: [
        "Structure every story with: Challenge → Your Action → Measurable Impact",
        "Quantify results: users gained, revenue increased, time saved",
        "Emphasize decisions YOU made, not what your team did collectively",
      ],
    },
    {
      title: "Trade-off Decision Practice",
      description: "Practice making and defending tough calls with incomplete information",
      tips: [
        "For every product idea, explicitly state what you're NOT doing and why",
        "Practice using frameworks: 'Impact vs Effort', 'Must-have vs Nice-to-have'",
        "Role-play stakeholder pushback: defend your prioritization rationale",
      ],
    },
  ],
};

/**
 * Generate 2-3 focused practice suggestions based on lowest scoring dimensions
 *
 * @param scores - Rubric scores for all 5 dimensions
 * @returns Array of 2-3 drill suggestions targeting weakest areas
 */
export function generateDrills(scores: Omit<RubricScores, "overall">): DrillSuggestion[] {
  // Convert scores to array for sorting
  const scoreEntries = [
    { dimension: "structure" as const, score: scores.structure },
    { dimension: "clarity" as const, score: scores.clarity },
    { dimension: "insight" as const, score: scores.insight },
    { dimension: "communication" as const, score: scores.communication },
    { dimension: "leadership" as const, score: scores.leadership },
  ];

  // Sort by score (ascending) to find weakest areas
  scoreEntries.sort((a, b) => a.score - b.score);

  // Take the 2 lowest scoring dimensions
  const weakestDimensions = scoreEntries.slice(0, 2).map((entry) => entry.dimension);

  // Generate drills for those dimensions
  const drills: DrillSuggestion[] = [];

  for (const dimension of weakestDimensions) {
    const templates = DRILL_TEMPLATES[dimension];
    if (templates && templates.length > 0) {
      // Pick a random template from available options
      const template = templates[Math.floor(Math.random() * templates.length)];
      drills.push(template);
    }
  }

  // If we still have room and there's a third weak area (score < 6), add one more drill
  if (drills.length < 3 && scoreEntries.length > 2 && scoreEntries[2].score < 6) {
    const thirdDimension = scoreEntries[2].dimension;
    const templates = DRILL_TEMPLATES[thirdDimension];
    if (templates && templates.length > 0) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      drills.push(template);
    }
  }

  return drills;
}

/**
 * Get all available drills for a specific dimension
 * Useful for manual drill selection or UI display
 *
 * @param dimension - The competency dimension
 * @returns Array of all drill templates for that dimension
 */
export function getDrillsForDimension(
  dimension: "structure" | "clarity" | "insight" | "communication" | "leadership"
): DrillSuggestion[] {
  return DRILL_TEMPLATES[dimension] || [];
}

/**
 * Get a random drill for any dimension
 * Useful for daily practice recommendations
 */
export function getRandomDrill(): DrillSuggestion {
  const allDrills = Object.values(DRILL_TEMPLATES).flat();
  return allDrills[Math.floor(Math.random() * allDrills.length)];
}
