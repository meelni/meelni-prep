import assert from "node:assert/strict";
import test from "node:test";

import { loadPublicQuestionCorpus } from "./public-question-corpus";

test("public question corpus requests active records and serializes dates", async () => {
  let requestedActiveOnly = false;
  const corpus = await loadPublicQuestionCorpus(
    { limit: 20, offset: 0 },
    async (options) => {
      requestedActiveOnly = options.activeOnly === true;
      return {
        total: 1,
        questions: [
          {
            id: "question-1",
            company: "Example",
            questionText: "How would you measure success?",
            questionType: "Execution",
            askedAt: new Date("2025-11-20T00:00:00.000Z"),
            isActive: true,
            createdAt: null,
          },
        ],
      };
    }
  );

  assert.equal(requestedActiveOnly, true);
  assert.equal(corpus.total, 1);
  assert.equal(corpus.questions[0].askedAt, "2025-11-20T00:00:00.000Z");
  assert.equal(corpus.questions[0].createdAt, null);
});

test("public question corpus fails closed when the published bank is empty", async () => {
  await assert.rejects(
    loadPublicQuestionCorpus({ limit: 20, offset: 0 }, async () => ({
      total: 0,
      questions: [],
    })),
    /question_bank_unavailable/
  );
});
