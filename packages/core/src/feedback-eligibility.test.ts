import assert from "node:assert/strict";
import test from "node:test";

import { classifyCandidateResponseEvidence } from "./feedback-eligibility";

test("classifies natural spoken PM evidence separately from scoreable grammar", () => {
  const spokenAnswers = [
    "The target customer is neighborhood volunteers. The recurring problem is changing delivery routes. Customer interviews are the first research step. A shared exception queue is the initial product choice. Completed deliveries are the primary metric. Late route changes are a guardrail metric. The evidence supports the next decision.",
    "The target research cohort is volunteer coordinators. The recurring problem is disrupted delivery ownership. Customer interviews are the first discovery step. A recent route exception is the interview topic. Frequent blockers are the primary priority. Rare reports are outside the first scope. The evidence supports the backlog decision.",
    "The largest customer risk is notification fatigue. The workflow test is the volunteer routine. A separate product risk is missing delivery context. The prototype is the minimum useful detail set. The privacy boundary is unrelated personal information. Customer comprehension is one validation outcome. Reassignment success is another validation outcome. The findings are the launch input.",
  ];

  for (const spoken of spokenAnswers) {
    assert.equal(
      classifyCandidateResponseEvidence({
        text: spoken,
        passesQuantitativeGates: true,
      }),
      "evidence_limited",
      spoken
    );
  }
  assert.equal(
    classifyCandidateResponseEvidence({
      text: "I would prioritize coordinators because customer interviews show that route changes create the most frequent delivery problem.",
      passesQuantitativeGates: true,
    }),
    "scoreable"
  );
});

test("keeps filler, gibberish, and failed quantitative evidence insufficient", () => {
  const gibberish =
    "qwerty user product metric market because foobar blargle snorf wibble wobble plugh";
  assert.equal(
    classifyCandidateResponseEvidence({
      text: gibberish,
      passesQuantitativeGates: true,
    }),
    "insufficient"
  );
  const filler =
    "um okay like maybe right well actually basically honestly perhaps product customer";
  assert.equal(
    classifyCandidateResponseEvidence({
      text: filler,
      passesQuantitativeGates: false,
    }),
    "insufficient"
  );
  assert.equal(
    classifyCandidateResponseEvidence({
      text: "I would prioritize customers because the research identifies a repeated workflow problem.",
      passesQuantitativeGates: false,
    }),
    "insufficient"
  );
});

test("requires long-form evidence signals across separate segments", () => {
  const unrelated =
    "The old garden path curves beside a quiet stone wall where birds gather every morning. Several painted chairs sit beneath the trees while neighbors carry baskets through the gate. Rain collects in shallow bowls and reflects the changing sky. At sunset the lamps glow softly across the empty courtyard.";
  const keywordSalad =
    "customer product research metric retention cohort conversion churn activation prioritization tradeoff strategy roadmap segment market experiment prototype launch adoption revenue growth pricing workflow feature interview insight decision outcome guardrail risk problem solution user buyer team leader stakeholder delivery analysis planning support demand value usability reliability discovery execution alignment communication evidence recommendation";
  const absurd =
    "The purple umbrella is a silent mountain. The glass bicycle is a jar of thunder. The invisible staircase is a forgotten season. The wooden cloud is an ancient recipe. The sleeping clock is a silver ocean. The empty corridor is a floating garden. The final doorway is impossible weather.";

  for (const text of [unrelated, keywordSalad, absurd]) {
    assert.equal(
      classifyCandidateResponseEvidence({
        text,
        passesQuantitativeGates: true,
      }),
      "insufficient",
      text
    );
  }

  const repeatedStuffing = Array.from(
    { length: 24 },
    () => "customer research"
  ).join(". ");
  assert.equal(
    classifyCandidateResponseEvidence({
      text: repeatedStuffing,
      passesQuantitativeGates: false,
    }),
    "insufficient"
  );
});
