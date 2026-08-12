import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeEvidenceLimitedCandidateResponseSignal,
  classifyCandidateResponseEvidence,
} from "./feedback-eligibility";

test("classifies natural spoken PM evidence separately from scoreable grammar", () => {
  const spokenAnswers = [
    "The target customer is neighborhood volunteers. The recurring problem is changing delivery routes. Customer interviews are the first research step. A shared exception queue is the initial product choice. Completed deliveries are the primary metric. Late route changes are a guardrail metric. Customer evidence feeds into the product decision.",
    "The target research cohort is volunteer coordinators. The recurring problem is disrupted delivery ownership. Customer interviews are the first discovery step. A recent route exception is the interview topic. Frequent blockers are the primary priority. Rare reports are outside the first scope. Customer evidence feeds into the backlog decision.",
    "The largest customer risk is notification fatigue. The workflow test is the volunteer routine. A separate product risk is missing delivery context. The prototype is the minimum useful detail set. The privacy boundary is unrelated personal information. Customer comprehension is one validation outcome. Reassignment success is another validation outcome. Product findings feed into the launch decision.",
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

test("uses bounded punctuation-independent relationships for long-form evidence", () => {
  const unrelated =
    "The old garden path curves beside a quiet stone wall where birds gather every morning. Several painted chairs sit beneath the trees while neighbors carry baskets through the gate. Rain collects in shallow bowls and reflects the changing sky. At sunset the lamps glow softly across the empty courtyard.";
  const keywordSalad =
    "customer product research metric retention cohort conversion churn activation prioritization tradeoff strategy roadmap segment market experiment prototype launch adoption revenue growth pricing workflow feature interview insight decision outcome guardrail risk problem solution user buyer team leader stakeholder delivery analysis planning support demand value usability reliability discovery execution alignment communication evidence recommendation";
  const absurd =
    "The purple umbrella is a silent mountain. The glass bicycle is a jar of thunder. The invisible staircase is a forgotten season. The wooden cloud is an ancient recipe. The sleeping clock is a silver ocean. The empty corridor is a floating garden. The final doorway is impossible weather.";

  const sparseAnchors =
    "The amber breeze crossed the cedar garden while a customer carried baskets through the old gate before a metric appeared beside the product display. Dawn settled over the field, grove, harbor, island, meadow, orchard, river, stone trail, upland valley, and willow trees beside the courtyard.";
  const weakLinkedAnchors =
    "Customer and metric with product appear beside amber breeze cedar dawn elm field grove harbor island juniper kettle lantern meadow north orchard pebble quiet river stone trail upland valley willow yellow zephyr. The unrelated courtyard remains calm throughout the afternoon.";
  const offTopicRambling =
    "Visitors wandered through the museum atrium and paused beside quiet paintings before crossing the marble hall. A distant guide described old frames, changing light, and the history of the building. The group moved slowly through several galleries, rested near the windows, and left before the evening rain arrived.";

  for (const text of [
    unrelated,
    keywordSalad,
    absurd,
    sparseAnchors,
    weakLinkedAnchors,
    offTopicRambling,
  ]) {
    assert.equal(
      classifyCandidateResponseEvidence({
        text,
        passesQuantitativeGates: true,
      }),
      "insufficient",
      text
    );
  }

  const repeatedStuffing = `${Array.from(
    { length: 8 },
    () => "customer and metric because product"
  ).join(
    " "
  )} amber breeze cedar dawn elm field grove harbor island juniper kettle lantern meadow north orchard pebble quiet river stone trail upland valley willow yellow zephyr`;
  assert.equal(
    classifyCandidateResponseEvidence({
      text: repeatedStuffing,
      passesQuantitativeGates: true,
    }),
    "insufficient"
  );

  for (const text of [
    "um well okay target customer volunteer coordinators recurring problem route ownership because changing schedules then workflow option shared queue before product launch research cohort and metric review through completed delivery evidence while support risk remains decision input across two operating cycles and partner teams",
    "right the customer group no I mean the coordinator cohort recurring problem is route ownership because schedules change then the workflow maybe the product queue before launch research feeds into the decision while completion metric and support risk stay as evidence across two operating cycles",
  ]) {
    assert.equal(
      classifyCandidateResponseEvidence({
        text,
        passesQuantitativeGates: true,
      }),
      "evidence_limited",
      text
    );
  }
});

test("dedupes lexeme identity and uses an exact fourteen-token relationship window", () => {
  const doubleMembership = analyzeEvidenceLimitedCandidateResponseSignal(
    "measure because measure amber breeze cedar dawn elm field grove harbor island juniper kettle lantern meadow north orchard pebble quiet river stone trail upland valley willow yellow zephyr twice"
  );
  assert.equal(doubleMembership.distinctRecognizedEvidenceLexemeCount, 1);
  assert.equal(doubleMembership.recognizedEvidenceOccurrenceCount, 2);

  const distance14 = analyzeEvidenceLimitedCandidateResponseSignal(
    "customer one two three four five six because eight nine ten eleven twelve thirteen metric amber breeze cedar dawn elm field grove harbor island juniper kettle lantern meadow north orchard pebble quiet river stone trail upland valley willow yellow zephyr"
  );
  const distance15 = analyzeEvidenceLimitedCandidateResponseSignal(
    "customer one two three four five six because eight nine ten eleven twelve thirteen fourteen metric amber breeze cedar dawn elm field grove harbor island juniper kettle lantern meadow north orchard pebble quiet river stone trail upland valley willow yellow zephyr"
  );
  assert.equal(distance14.strongRelationshipCount, 1);
  assert.equal(distance15.strongRelationshipCount, 0);
});

test("keeps engineered lexical false positives qualitative-only", () => {
  const engineered =
    "quiet garden customer rain because metric fountain then product label before decision bell while risk museum wall amber breeze cedar dawn elm field grove harbor island juniper kettle lantern meadow north orchard pebble quiet river stone trail upland valley willow yellow zephyr across evening courtyard";
  const lexical = analyzeEvidenceLimitedCandidateResponseSignal(engineered);
  assert.equal(lexical.qualifies, true);
  assert.equal(
    classifyCandidateResponseEvidence({
      text: engineered,
      passesQuantitativeGates: true,
    }),
    "evidence_limited"
  );
});
