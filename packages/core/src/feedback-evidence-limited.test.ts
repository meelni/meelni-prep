import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_LIMITED_ACTIONS,
  EVIDENCE_LIMITED_CONFIDENCE,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS,
  EVIDENCE_LIMITED_STRENGTH_SIGNALS,
  EVIDENCE_LIMITED_SUMMARY,
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION,
  hasServerOwnedEvidenceLimitedContent,
  parseEvidenceLimitedFeedback,
  parsePersistedEvidenceLimitedFeedback,
  type EvidenceLimitedFeedbackResult,
} from "./feedback-evidence-limited";
import { FEEDBACK_RUBRIC_VERSION } from "./feedback-v2";

const transcript = [
  {
    eventId: "writer:answer:1",
    speaker: "user" as const,
    text: "I interviewed twelve customers, tracked activation at 40%, and compared an 8/10 conversion ratio on August 8.",
  },
  {
    eventId: "writer:interviewer:1",
    speaker: "interviewer" as const,
    text: "How would you make the decision?",
  },
  {
    eventId: "writer:answer:2",
    speaker: "user" as const,
    text: "I would choose the segment with the clearest recurring need and explain the tradeoff.",
  },
];

function selection() {
  return {
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "partial",
    strengths: [
      {
        signalCode: "customer_problem_connection",
        actionCode: "connect_customer_to_decision",
        transcriptRef: "writer:answer:1",
      },
    ],
    improvements: [
      {
        signalCode: "tradeoff_decision",
        actionCode: "compare_tradeoffs_and_choose",
        transcriptRef: "writer:answer:1",
      },
    ],
  };
}

function persisted(result: EvidenceLimitedFeedbackResult) {
  return {
    schemaVersion: result.schemaVersion,
    promptVersion: result.promptVersion,
    rubricVersion: result.rubricVersion,
    evaluationState: result.evaluationState,
    strengths: structuredClone(result.strengths),
    improvements: structuredClone(result.improvements),
    summary: result.summary,
  };
}

test("resolves closed selections into useful server-owned feedback and exact citations", () => {
  const parsed = parseEvidenceLimitedFeedback(selection(), {
    transcript,
    modelVersion: "fixture-model-v1",
  });

  assert.equal(parsed.schemaVersion, FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION);
  assert.equal(parsed.summary, EVIDENCE_LIMITED_SUMMARY);
  assert.equal(parsed.strengths.length, 1);
  assert.equal(parsed.improvements.length, 1);
  assert.equal(
    parsed.strengths[0]!.observation,
    EVIDENCE_LIMITED_STRENGTH_SIGNALS.customer_problem_connection.observation
  );
  assert.equal(
    parsed.improvements[0]!.observation,
    EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS.tradeoff_decision.observation
  );
  assert.equal(
    parsed.improvements[0]!.nextStep,
    EVIDENCE_LIMITED_ACTIONS.compare_tradeoffs_and_choose.nextStep
  );
  assert.equal(parsed.strengths[0]!.evidence[0]!.quote, transcript[0]!.text);
  assert.match(parsed.strengths[0]!.evidence[0]!.quote, /40%/);
  assert.match(parsed.strengths[0]!.evidence[0]!.quote, /8\/10/);
  assert.equal(parsed.strengths[0]!.confidence, EVIDENCE_LIMITED_CONFIDENCE);
});

test("provider selections cannot introduce arbitrary narrative or quote strings", () => {
  for (const arbitrary of ARBITRARY_MODEL_STRINGS) {
    const rootCopy = { ...selection(), summary: arbitrary };
    assert.throws(
      () =>
        parseEvidenceLimitedFeedback(rootCopy, {
          transcript,
          modelVersion: "fixture-model-v1",
        }),
      arbitrary
    );

    for (const field of ["observation", "nextStep", "quote"] as const) {
      const itemCopy = selection();
      Object.assign(itemCopy.strengths[0]!, { [field]: arbitrary });
      assert.throws(
        () =>
          parseEvidenceLimitedFeedback(itemCopy, {
            transcript,
            modelVersion: "fixture-model-v1",
          }),
        `${field}: ${arbitrary}`
      );
    }
  }
});

test("rejects unknown codes, malformed selections, empty arrays, and invalid references", () => {
  const cases: Array<{ name: string; value: unknown }> = [];

  const unknownSignal = selection();
  unknownSignal.strengths[0]!.signalCode = "sextillion";
  cases.push({ name: "unknown signal", value: unknownSignal });

  const unknownAction = selection();
  unknownAction.improvements[0]!.actionCode = "VIII";
  cases.push({ name: "unknown action", value: unknownAction });

  const mismatchedDimension = selection();
  mismatchedDimension.strengths[0]!.actionCode = "outline_reasoning";
  cases.push({
    name: "mismatched action dimension",
    value: mismatchedDimension,
  });

  cases.push({
    name: "empty strengths",
    value: { ...selection(), strengths: [] },
  });
  cases.push({
    name: "empty improvements",
    value: { ...selection(), improvements: [] },
  });

  const duplicateStrengthRef = selection();
  duplicateStrengthRef.strengths.push({
    signalCode: "customer_problem_connection",
    actionCode: "connect_customer_to_decision",
    transcriptRef: "writer:answer:1",
  });
  cases.push({ name: "duplicate strength ref", value: duplicateStrengthRef });

  const duplicateStrengthIdentity = selection();
  duplicateStrengthIdentity.strengths.push({
    signalCode: "customer_problem_connection",
    actionCode: "connect_customer_to_decision",
    transcriptRef: "writer:answer:2",
  });
  cases.push({
    name: "duplicate strength identity with a different ref",
    value: duplicateStrengthIdentity,
  });

  const duplicateImprovementIdentity = selection();
  duplicateImprovementIdentity.improvements.push({
    signalCode: "tradeoff_decision",
    actionCode: "compare_tradeoffs_and_choose",
    transcriptRef: "writer:answer:2",
  });
  cases.push({
    name: "duplicate improvement identity with a different ref",
    value: duplicateImprovementIdentity,
  });

  const duplicateActionAcrossCategories = selection();
  duplicateActionAcrossCategories.improvements[0] = {
    signalCode: "customer_decision_connection",
    actionCode: "connect_customer_to_decision",
    transcriptRef: "writer:answer:2",
  };
  cases.push({
    name: "duplicate action identity across strength and improvement",
    value: duplicateActionAcrossCategories,
  });

  const missingRef = selection();
  missingRef.strengths[0]!.transcriptRef = "writer:missing";
  cases.push({ name: "missing ref", value: missingRef });

  const interviewerRef = selection();
  interviewerRef.strengths[0]!.transcriptRef = "writer:interviewer:1";
  cases.push({ name: "interviewer ref", value: interviewerRef });

  const malformed = selection();
  Object.assign(malformed.improvements[0]!, { providerNarrative: "anything" });
  cases.push({ name: "extra field", value: malformed });

  for (const candidate of cases) {
    assert.throws(
      () =>
        parseEvidenceLimitedFeedback(candidate.value, {
          transcript,
          modelVersion: "fixture-model-v1",
        }),
      candidate.name
    );
  }
});

test("allows one candidate answer to support one strength and one improvement", () => {
  const parsed = parseEvidenceLimitedFeedback(selection(), {
    transcript: [transcript[0]!],
    modelVersion: "fixture-model-v1",
  });

  assert.deepEqual(parsed.strengths[0]!.transcriptRefs, ["writer:answer:1"]);
  assert.deepEqual(parsed.improvements[0]!.transcriptRefs, ["writer:answer:1"]);
  assert.equal(parsed.strengths[0]!.evidence[0]!.quote, transcript[0]!.text);
  assert.equal(parsed.improvements[0]!.evidence[0]!.quote, transcript[0]!.text);
});

test("persisted evidence-limited content must match codes, templates, and frozen citations exactly", () => {
  const resolved = parseEvidenceLimitedFeedback(selection(), {
    transcript,
    modelVersion: "fixture-model-v1",
  });
  const stored = persisted(resolved);
  const parsed = parsePersistedEvidenceLimitedFeedback(stored, {
    transcript,
    modelVersion: "fixture-model-v1",
  });
  assert.deepEqual(parsed, resolved);
  assert.equal(hasServerOwnedEvidenceLimitedContent(stored), true);

  const tamperedTemplateCopies = [
    () => {
      const copy = persisted(resolved);
      copy.strengths[0]!.observation = "Provider-authored observation";
      return copy;
    },
    () => {
      const copy = persisted(resolved);
      copy.improvements[0]!.nextStep = "Provider-authored next step";
      return copy;
    },
    () => ({ ...persisted(resolved), summary: "Provider summary" }),
    () => {
      const copy = persisted(resolved);
      copy.strengths[0]!.signalCode = "clear_recommendation";
      return copy;
    },
  ];

  for (const build of tamperedTemplateCopies) {
    const copy = build();
    assert.equal(hasServerOwnedEvidenceLimitedContent(copy), false);
    assert.throws(() =>
      parsePersistedEvidenceLimitedFeedback(copy, {
        transcript,
        modelVersion: "fixture-model-v1",
      })
    );
  }

  const tamperedCitation = persisted(resolved);
  tamperedCitation.strengths[0]!.evidence[0]!.quote = "40%";
  assert.throws(() =>
    parsePersistedEvidenceLimitedFeedback(tamperedCitation, {
      transcript,
      modelVersion: "fixture-model-v1",
    })
  );

  const duplicateStrength = persisted(resolved);
  duplicateStrength.strengths.push({
    ...structuredClone(duplicateStrength.strengths[0]!),
    transcriptRefs: ["writer:answer:2"],
    evidence: [
      {
        turnRef: "writer:answer:2",
        quote: transcript[2]!.text,
      },
    ],
  });
  assert.equal(hasServerOwnedEvidenceLimitedContent(duplicateStrength), false);
  assert.throws(() =>
    parsePersistedEvidenceLimitedFeedback(duplicateStrength, {
      transcript,
      modelVersion: "fixture-model-v1",
    })
  );

  const duplicateAction = persisted(resolved);
  duplicateAction.improvements[0] = {
    signalCode: "customer_decision_connection",
    actionCode: "connect_customer_to_decision",
    dimension: "insight",
    observation:
      EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS.customer_decision_connection
        .observation,
    transcriptRefs: ["writer:answer:2"],
    evidence: [
      {
        turnRef: "writer:answer:2",
        quote: transcript[2]!.text,
      },
    ],
    nextStep: EVIDENCE_LIMITED_ACTIONS.connect_customer_to_decision.nextStep,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    confidence: EVIDENCE_LIMITED_CONFIDENCE,
  };
  assert.equal(hasServerOwnedEvidenceLimitedContent(duplicateAction), false);
  assert.throws(() =>
    parsePersistedEvidenceLimitedFeedback(duplicateAction, {
      transcript,
      modelVersion: "fixture-model-v1",
    })
  );
});

const ARBITRARY_MODEL_STRINGS = [
  "VIII",
  "IX",
  "sextillion septillion octillion nonillion decillion",
  "myriad gross thirds both trio duo zeroes ones twos",
  "a+ b- grade a grade B grade b grade C result D",
  "\u200B",
  "\u2060",
  "\u034F",
  "\u200B\u2060\u034F",
] as const;
