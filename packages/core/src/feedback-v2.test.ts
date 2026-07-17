import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  FEEDBACK_V2_REJECTION_CODES,
  FEEDBACK_V2_REJECTION_TAXONOMY_VERSION,
  FeedbackV2ParseError,
  isFeedbackV2Item,
  projectFeedbackItems,
  parseFeedbackV2,
  type FeedbackTranscriptTurn,
  type FeedbackV2RejectionCode,
} from "./feedback-v2";

const transcript = [
  {
    eventId: "writer-a:1",
    speaker: "user" as const,
    text: "I would start with working parents and measure weekly completed plans.",
  },
  {
    eventId: "writer-a:2",
    speaker: "user" as const,
    text: "The trade-off is speed versus confidence, so I would test a concierge flow first.",
  },
];

function validResponse() {
  return {
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "full",
    scores: {
      structure: 8,
      clarity: 7,
      insight: 9,
      communication: 7,
      leadership: 8,
    },
    strengths: [
      {
        dimension: "insight",
        observation:
          "The answer chooses a specific audience and measurable behavior.",
        transcriptRefs: ["writer-a:1"],
        evidence: [
          {
            turnRef: "writer-a:1",
            quote: "working parents and measure weekly completed plans",
          },
        ],
        nextStep: "Carry the segment into solution prioritization.",
        rubricVersion: FEEDBACK_RUBRIC_VERSION,
        confidence: 0.9,
      },
    ],
    improvements: [
      {
        dimension: "structure",
        observation:
          "The concierge experiment lacks an explicit success threshold.",
        transcriptRefs: ["writer-a:2"],
        evidence: [
          {
            turnRef: "writer-a:2",
            quote: "test a concierge flow first",
          },
        ],
        nextStep: "Name the decision threshold before describing the test.",
        rubricVersion: FEEDBACK_RUBRIC_VERSION,
        confidence: 0.8,
      },
    ],
    drills: ["Define one metric and decision threshold before each answer."],
    summary: "Feedback is limited to the grounded findings above.",
  };
}

function exceptionalResponseFixture() {
  const response = validResponse();
  Object.assign(response.scores, {
    structure: 10,
    clarity: 10,
    insight: 10,
    communication: 10,
    leadership: 10,
  });

  const sources = [
    {
      eventId: "writer-exceptional:structure",
      text: "I define the product goal and sequence the decision criteria before comparing options.",
      dimension: "structure",
      observation:
        "The answer defines the goal and sequences the decision criteria.",
      quote: "define the product goal and sequence the decision criteria",
    },
    {
      eventId: "writer-exceptional:clarity",
      text: "I name the customer problem and explain the chosen scope in plain language.",
      dimension: "clarity",
      observation:
        "The answer names the customer problem and explains the chosen scope.",
      quote: "name the customer problem and explain the chosen scope",
    },
    {
      eventId: "writer-exceptional:insight",
      text: "I identify working parents and connect recurring scheduling pain to the product opportunity.",
      dimension: "insight",
      observation:
        "The answer identifies working parents and connects recurring scheduling pain.",
      quote: "identify working parents and connect recurring scheduling pain",
    },
    {
      eventId: "writer-exceptional:communication",
      text: "I compare two options and explain the trade-off before recommending the launch path.",
      dimension: "communication",
      observation:
        "The answer compares two options and explains the trade-off.",
      quote: "compare two options and explain the trade-off",
    },
    {
      eventId: "writer-exceptional:leadership",
      text: "I align design and engineering stakeholders and document the launch decision.",
      dimension: "leadership",
      observation:
        "The answer aligns stakeholders and documents the launch decision.",
      quote:
        "align design and engineering stakeholders and document the launch decision",
    },
  ] as const;

  response.strengths = sources.map((source) => ({
    ...response.strengths[0],
    dimension: source.dimension,
    observation: source.observation,
    transcriptRefs: [source.eventId],
    evidence: [{ turnRef: source.eventId, quote: source.quote }],
  }));
  response.improvements = [
    {
      ...response.improvements[0],
      observation: "The experiment does not define a success threshold.",
      transcriptRefs: ["writer-exceptional:improvement"],
      evidence: [
        {
          turnRef: "writer-exceptional:improvement",
          quote: "not defined a success threshold",
        },
      ],
    },
  ];

  return {
    response,
    transcript: [
      ...sources.map((source) => ({
        eventId: source.eventId,
        speaker: "user" as const,
        text: source.text,
      })),
      {
        eventId: "writer-exceptional:improvement",
        speaker: "user" as const,
        text: "I would test a concierge flow first, but I have not defined a success threshold.",
      },
    ],
    sources,
  };
}

test("parses complete grounded feedback and computes the canonical overall score", () => {
  const result = parseFeedbackV2(validResponse(), {
    transcript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });

  assert.equal(result.overallScore, 7.9);
  assert.equal(result.modelVersion, "gpt-test-1");
  assert.equal(result.strengths[0].evidence[0].turnRef, "writer-a:1");
});

test("projects legacy and v2 items into safe comparison text", () => {
  assert.deepEqual(
    projectFeedbackItems([
      "Legacy strength",
      { text: "Legacy object strength", dimension: "clarity" },
      validResponse().strengths[0],
      { unexpected: true },
    ]),
    [
      "Legacy strength",
      "Legacy object strength",
      "The answer chooses a specific audience and measurable behavior. Next step: Carry the segment into solution prioritization.",
    ]
  );
});

test("recognizes only complete feedback v2 items at read boundaries", () => {
  const valid = validResponse().strengths[0];
  assert.equal(isFeedbackV2Item(valid), true);

  const invalidItems = [
    { ...valid, observation: " " },
    { ...valid, transcriptRefs: [] },
    { ...valid, transcriptRefs: ["writer-a:1", "writer-a:1"] },
    { ...valid, evidence: [null] },
    { ...valid, evidence: [{ turnRef: "writer-a:1", quote: " " }] },
    {
      ...valid,
      transcriptRefs: ["writer-a:1"],
      evidence: [{ turnRef: "writer-a:2", quote: "exact text" }],
    },
    { ...valid, nextStep: " " },
    { ...valid, confidence: Number.NaN },
    { ...valid, confidence: 1.1 },
  ];

  for (const invalid of invalidItems) {
    assert.equal(isFeedbackV2Item(invalid), false);
  }
});

test("accepts an explicitly matching partial evaluation state", () => {
  const response = { ...validResponse(), evaluationState: "partial" };
  const result = parseFeedbackV2(response, {
    transcript,
    evaluationState: "partial",
    modelVersion: "gpt-test-1",
  });
  assert.equal(result.evaluationState, "partial");
});

test("classifies synthetic feedback mutations with the closed content-free rejection taxonomy", () => {
  assert.equal(
    FEEDBACK_V2_REJECTION_TAXONOMY_VERSION,
    "feedback-v2-rejection.v1"
  );
  assert.equal(
    new Set(FEEDBACK_V2_REJECTION_CODES).size,
    FEEDBACK_V2_REJECTION_CODES.length
  );

  const assertRejection = (
    expected: FeedbackV2RejectionCode,
    mutate: (response: ReturnType<typeof validResponse>) => void,
    mutatedTranscript: FeedbackTranscriptTurn[] = transcript
  ) => {
    const response = structuredClone(validResponse());
    mutate(response);
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: mutatedTranscript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      (error: unknown) =>
        error instanceof FeedbackV2ParseError && error.code === expected,
      expected
    );
  };

  assertRejection("schema_version_mismatch", (response) => {
    response.schemaVersion =
      "feedback.future" as typeof FEEDBACK_SCHEMA_VERSION;
  });
  assertRejection("prompt_version_mismatch", (response) => {
    response.promptVersion = "prompt.future" as typeof FEEDBACK_PROMPT_VERSION;
  });
  assertRejection("rubric_version_mismatch", (response) => {
    response.rubricVersion = "rubric.future" as typeof FEEDBACK_RUBRIC_VERSION;
  });
  assertRejection("evaluation_state_mismatch", (response) => {
    response.evaluationState = "partial";
  });
  assertRejection("score_invalid", (response) => {
    response.scores.structure = 10.5;
  });
  assertRejection("exceptional_score_insufficient_evidence", (response) => {
    response.scores.structure = 9;
  });
  assertRejection(
    "evidence_turn_ref_wrong_speaker",
    (response) => {
      response.strengths[0].transcriptRefs = ["writer-a:3"];
      response.strengths[0].evidence = [
        { turnRef: "writer-a:3", quote: "define a decision threshold" },
      ];
    },
    [
      ...transcript,
      {
        eventId: "writer-a:3",
        speaker: "interviewer" as const,
        text: "Please define a decision threshold before continuing.",
      },
    ]
  );
  assertRejection("evidence_quote_not_grounded", (response) => {
    response.strengths[0].evidence[0].quote =
      "provider invented this private evidence";
  });
  assertRejection("evidence_reference_set_mismatch", (response) => {
    response.strengths[0].transcriptRefs = ["writer-a:2"];
  });
  assertRejection("evidence_reused_across_findings", (response) => {
    response.improvements[0].transcriptRefs = ["writer-a:1"];
    response.improvements[0].evidence = [
      {
        turnRef: "writer-a:1",
        quote: "working parents and measure weekly completed plans",
      },
    ];
  });
  assertRejection("findings_count_invalid", (response) => {
    response.strengths = [];
  });
  assertRejection("evidence_count_invalid", (response) => {
    response.strengths[0].evidence = [];
  });
  assertRejection("drills_invalid", (response) => {
    response.drills = [];
  });
});

test("rejects incomplete findings instead of inferring missing fields", () => {
  const response = validResponse();
  delete (response.strengths[0] as Partial<(typeof response.strengths)[number]>)
    .nextStep;
  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    FeedbackV2ParseError
  );
});

test("rejects evidence quotes that do not exactly occur in the referenced turn", () => {
  const response = validResponse();
  response.strengths[0].evidence[0].quote = "Working Parents";
  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /quote is not exact evidence/
  );
});

test("accepts evidence from a canonical candidate turn", () => {
  const result = parseFeedbackV2(validResponse(), {
    transcript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });

  assert.equal(result.strengths[0].evidence[0].turnRef, "writer-a:1");
});

test("rejects an exact quote from an interviewer turn as candidate evidence", () => {
  const response = validResponse();
  response.strengths[0].transcriptRefs[0] = "writer-a:interviewer";
  response.strengths[0].evidence[0] = {
    turnRef: "writer-a:interviewer",
    quote: "prioritized enterprise customers",
  };

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          ...transcript,
          {
            eventId: "writer-a:interviewer",
            speaker: "interviewer",
            text: "You clearly prioritized enterprise customers.",
          },
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /must reference a candidate turn/
  );
});

test("normalizes harmless quote typography to exact canonical transcript text", () => {
  const response = validResponse();
  const typographicTranscript = [
    {
      eventId: "writer-a:1",
      speaker: "user" as const,
      text: "I would start with working parents — and measure weekly completed plans.",
    },
    transcript[1],
  ];
  response.strengths[0].evidence[0].quote =
    "working parents - and  measure weekly completed plans";
  const parsed = parseFeedbackV2(response, {
    transcript: typographicTranscript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(
    parsed.strengths[0].evidence[0].quote,
    "working parents — and measure weekly completed plans"
  );
});

test("rejects exact but meaningless evidence spans", () => {
  const lowSignalTranscript = [
    {
      eventId: "writer-a:1",
      speaker: "user" as const,
      text: "I would not prioritize users. In practice, we shipped 1 improvement for PM users, never 123456. hmm okay yeah well lol abc да 20 I. thanks hmmmmmm uhhhhh zzzzzz 20 foo 20 xyz 20 blah нет はい 好的 نعم 嗯嗯 呵呵 ええ qwerty foobar asdfgh garbage whatever wibble wobble plugh xyzzy 测试 占位 哈哈 呃呃 ああ مم дада жж.",
    },
    transcript[1],
  ];
  for (const quote of [
    "I",
    "would",
    "I would",
    ".",
    "1",
    "not",
    "123456",
    "hmm",
    "okay",
    "yeah",
    "well",
    "lol",
    "abc",
    "да",
    "20 I",
    "thanks",
    "hmmmmmm",
    "uhhhhh",
    "zzzzzz",
    "20 foo",
    "20 xyz",
    "20 blah",
    "нет",
    "はい",
    "好的",
    "نعم",
    "嗯嗯",
    "呵呵",
    "ええ",
    "qwerty",
    "foobar",
    "asdfgh",
    "garbage",
    "whatever",
    "qwerty foobar",
    "garbage whatever",
    "wibble wobble",
    "plugh xyzzy",
    "测试 占位",
    "呵呵 ええ",
    "qwerty foobar asdfgh garbage whatever wibble wobble",
    "哈哈",
    "呃呃",
    "ああ",
    "مم",
    "дада",
    "жж",
  ]) {
    const response = validResponse();
    response.strengths[0].evidence[0].quote = quote;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: lowSignalTranscript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /minimally substantive evidence/,
      quote
    );
  }
});

test("accepts concise evidence with meaningful candidate language", () => {
  const conciseTranscript = [
    {
      eventId: "writer-a:1",
      speaker: "user" as const,
      text: "For PM users, we shipped a focused onboarding flow and measured retention at 20%. The risk, cost, goal, user, and data matter. MVP ARR MRR GMV TAM ICP UX UI mvp arr ₹20 ¥20 20€ 20‰ ٢٠٪ ٢٠؉ ٢× ٢٠€ €٢٠.",
    },
    transcript[1],
  ];
  for (const quote of [
    "PM",
    "PM users",
    "we shipped",
    "retention",
    "20%",
    "risk",
    "cost",
    "goal",
    "user",
    "data",
    "MVP",
    "ARR",
    "MRR",
    "GMV",
    "TAM",
    "ICP",
    "UX",
    "UI",
    "mvp",
    "arr",
    "₹20",
    "¥20",
    "20€",
    "20‰",
    "٢٠٪",
    "٢٠؉",
    "٢×",
    "٢٠€",
    "€٢٠",
  ]) {
    const response = validResponse();
    response.strengths[0].observation = `The answer explicitly cites ${quote}.`;
    response.strengths[0].evidence[0].quote = quote;
    const parsed = parseFeedbackV2(response, {
      transcript: conciseTranscript,
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.strengths[0].evidence[0].quote, quote);
  }
});

test("accepts meaningful exact evidence without requiring a PM noun allowlist", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The answer aligned design and engineering on the tradeoff.";
  response.strengths[0].evidence[0].quote =
    "aligned design and engineering on the tradeoff";

  const parsed = parseFeedbackV2(response, {
    transcript: [
      {
        eventId: "writer-a:1",
        speaker: "user",
        text: "I aligned design and engineering on the tradeoff before launch.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });

  assert.equal(
    parsed.strengths[0].evidence[0].quote,
    "aligned design and engineering on the tradeoff"
  );
});

test("accepts concise non-Latin and Unicode-qualified evidence", () => {
  const conciseTranscript = [
    {
      eventId: "writer-a:1",
      speaker: "user" as const,
      text: "增长 增长率 企業 数据 20 用户",
    },
    transcript[1],
  ];
  for (const quote of ["增长", "增长率", "企業", "数据", "20 用户"]) {
    const response = validResponse();
    response.strengths[0].observation = `The answer explicitly cites ${quote}.`;
    response.strengths[0].evidence[0].quote = quote;
    const parsed = parseFeedbackV2(response, {
      transcript: conciseTranscript,
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.strengths[0].evidence[0].quote, quote);
  }
});

test("accepts meaningful multilingual evidence without enumerating every noun", () => {
  const multilingualTranscript = [
    {
      eventId: "writer-a:1",
      speaker: "user" as const,
      text: "Alineé diseño e ingeniería antes del lanzamiento. Unternehmenskunden mit hohem Risiko. clients à forte fréquence. وازنت المخاطر بعناية. 優先順位を説明した。",
    },
    transcript[1],
  ];

  for (const quote of [
    "Alineé diseño e ingeniería antes del lanzamiento",
    "Unternehmenskunden mit hohem Risiko",
    "clients à forte fréquence",
    "وازنت",
    "優先順位",
  ]) {
    const response = validResponse();
    response.strengths[0].observation = `The answer explicitly cites ${quote}.`;
    response.strengths[0].evidence[0].quote = quote;
    const parsed = parseFeedbackV2(response, {
      transcript: multilingualTranscript,
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.strengths[0].evidence[0].quote, quote);
  }
});

test("rejects a claimed exact citation synthesized across separate turns", () => {
  const response = validResponse();
  response.strengths[0] = {
    ...response.strengths[0],
    observation:
      "The answer states working parents test a concierge flow first.",
    transcriptRefs: ["writer-a:1", "writer-a:3"],
    evidence: [
      { turnRef: "writer-a:1", quote: "working parents" },
      { turnRef: "writer-a:3", quote: "test a concierge flow first" },
    ],
  };

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          ...transcript,
          {
            eventId: "writer-a:3",
            speaker: "user",
            text: "I would test a concierge flow first.",
          },
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /exact citation that is absent from every individual evidence quote/
  );
});

test("rejects bounded said, quoted, and according-to citations synthesized across turns", () => {
  const citationTranscript = [
    transcript[0],
    transcript[1],
    {
      eventId: "writer-a:3",
      speaker: "user" as const,
      text: "Retention matters, so I would test a concierge flow first.",
    },
  ];
  for (const observation of [
    "The candidate said working parents retention was the named priority.",
    "According to the answer, working parents retention was the named priority.",
    "The candidate explicitly quoted working parents retention as the priority.",
    'The candidate said "working parents" was the named priority and quoted "retention growth".',
  ]) {
    const response = validResponse();
    response.strengths[0] = {
      ...response.strengths[0],
      observation,
      transcriptRefs: ["writer-a:1", "writer-a:3"],
      evidence: [
        {
          turnRef: "writer-a:1",
          quote: "working parents and measure weekly completed plans",
        },
        { turnRef: "writer-a:3", quote: "Retention matters" },
      ],
    };

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: citationTranscript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /exact citation that is absent from every individual evidence quote/,
      observation
    );
  }
});

test("does not reinterpret ordinary attribution paraphrases as exact citations", () => {
  for (const observation of [
    "The candidate said the audience was specific and measurable.",
    "According to the answer, the audience is specific and measurable.",
  ]) {
    const response = validResponse();
    response.strengths[0].observation = observation;
    const parsed = parseFeedbackV2(response, {
      transcript,
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.strengths[0].observation, observation);
  }
});

test("rejects observations without observable support in their cited turns", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The candidate facilitated a legal compliance workshop.";
  response.strengths[0].evidence[0].quote = "risk";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            eventId: "writer-a:1",
            speaker: "user",
            text: "I would prioritize enterprise users because security risk creates the clearest initial product opportunity.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /no observable support|material claim absent/
  );
});

test("rejects affirmative observations supported by only one shared concept", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The prioritization ensured legal compliance and robust privacy safeguards.";
  response.strengths[0].evidence[0].quote = "prioritize working parents";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            eventId: "writer-a:1",
            speaker: "user",
            text: "I would prioritize working parents and measure weekly retention before expanding the calendar pilot.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /at least two independent observable supports|material claim absent/
  );
});

test("requires two grounded supports for negative and absence observations", () => {
  const oneSupport = validResponse();
  oneSupport.improvements[0].observation =
    "The experiment lacks a success threshold.";
  oneSupport.improvements[0].evidence[0].quote = "test a concierge flow first";

  assert.throws(
    () =>
      parseFeedbackV2(oneSupport, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /at least two independent observable supports/
  );

  const twoSupports = parseFeedbackV2(validResponse(), {
    transcript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(
    twoSupports.improvements[0].observation,
    "The concierge experiment lacks an explicit success threshold."
  );
});

test("rejects an unsupported material claim despite generic source overlap", () => {
  const response = validResponse();
  response.strengths[0] = {
    ...response.strengths[0],
    observation:
      "The answer explicitly cites trade-off is speed versus confidence.",
    transcriptRefs: ["writer-a:2"],
    evidence: [
      {
        turnRef: "writer-a:2",
        quote: "trade-off is speed versus confidence",
      },
    ],
  };
  response.improvements[0] = {
    ...response.improvements[0],
    observation:
      "The measurement approach should add biometric surveillance before launch.",
    transcriptRefs: ["writer-a:1"],
    evidence: [
      {
        turnRef: "writer-a:1",
        quote: "measure weekly completed plans",
      },
    ],
  };

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            ...transcript[0],
            text: "I would start with working parents and measure weekly completed plans before launch.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /at least two independent observable supports|material claim absent/
  );
});

test("rejects unsupported material claims hidden behind generic, negative, or compact anchors", () => {
  const cases = [
    {
      source:
        "I would measure weekly retention before launch because recurring usage shows product value.",
      observation:
        "The measurement before launch implemented biometric surveillance safeguards.",
      quote: "measure weekly retention before launch",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization established legal compliance, but did not mention pricing.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing. It established market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing then established market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing plus established market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing: it established market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing — it established market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing / it established market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing (it established market dominance).",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing\nIt established market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing as well as established market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization established market dominance despite not mentioning pricing.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing despite establishing market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing before establishing market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing after establishing market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing alongside establishing market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing followed by establishing market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing in addition to establishing market dominance.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents and discuss 用户 needs before launch.",
      observation:
        "The candidate established legal compliance and biometric privacy safeguards for 用户.",
      quote: "用户",
    },
    {
      source:
        "I would start with working parents and measure weekly completed plans.",
      observation:
        "The segment measurement established privacy-first, compliance-ready controls.",
      quote: "working parents and measure weekly completed plans",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing and drove profitable growth.",
      quote: "prioritize working parents",
    },
    {
      source:
        "I would prioritize working parents because recurring scheduling creates coordination pain.",
      observation:
        "The prioritization did not mention pricing and improved team morale.",
      quote: "prioritize working parents",
    },
  ];

  for (const fixture of cases) {
    const response = validResponse();
    response.strengths[0].observation = fixture.observation;
    response.strengths[0].evidence[0].quote = fixture.quote;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            { ...transcript[0], text: fixture.source },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent|at least two independent observable supports/,
      fixture.observation
    );
  }
});

test("accepts material claims only when their anchors occur in exact evidence", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The answer defines privacy safeguards and encryption controls.";
  response.strengths[0].evidence[0].quote =
    "define privacy safeguards and encryption controls";

  const parsed = parseFeedbackV2(response, {
    transcript: [
      {
        ...transcript[0],
        text: "I would define privacy safeguards and encryption controls before the launch.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });

  assert.equal(parsed.strengths[0].dimension, "insight");
});

test("canonicalizes material claim variants across findings and summaries", () => {
  const families = [
    { observed: "safe", evidenced: "safety" },
    { observed: "safety", evidenced: "safe" },
    { observed: "secure", evidenced: "security" },
    { observed: "security", evidenced: "secure" },
    { observed: "legal", evidenced: "lawful" },
    { observed: "legally approved", evidenced: "legal approval" },
    { observed: "lawful", evidenced: "legally approved" },
    { observed: "privacy", evidenced: "private" },
    { observed: "private", evidenced: "privacy" },
    { observed: "compliance", evidenced: "compliant" },
    { observed: "compliant", evidenced: "complying" },
    { observed: "comply", evidenced: "compliance" },
    { observed: "complies", evidenced: "compliant" },
    { observed: "complied", evidenced: "compliance" },
    { observed: "complying", evidenced: "compliant" },
  ] as const;

  for (const fixture of families) {
    const response = validResponse();
    const quote = `define ${fixture.evidenced} controls and encryption safeguards`;
    response.strengths[0].observation = `The answer defines ${fixture.observed} controls and encryption safeguards.`;
    response.strengths[0].evidence[0].quote = quote;
    response.summary = `The answer defines ${fixture.observed} controls and encryption safeguards.`;

    const parsed = parseFeedbackV2(response, {
      transcript: [
        {
          ...transcript[0],
          text: `I would ${quote} before launch.`,
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });

    assert.equal(parsed.summary, response.summary, fixture.observed);
  }
});

test("rejects unsupported material morphology in findings and summaries", () => {
  const claims = [
    "safe controls",
    "safety controls",
    "a secure launch",
    "security controls",
    "legal approval",
    "legally approved controls",
    "lawful controls",
    "privacy controls",
    "private records",
    "compliance controls",
    "compliant controls",
    "controls that comply with policy",
    "controls that complies with policy",
    "controls that complied with policy",
    "controls that are complying with policy",
  ] as const;

  for (const claim of claims) {
    const unsupportedFinding = validResponse();
    unsupportedFinding.strengths[0].observation = `The answer chooses working parents and measures weekly plans with ${claim}.`;
    assert.throws(
      () =>
        parseFeedbackV2(unsupportedFinding, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      `finding ${claim}`
    );

    const unsupportedSummary = validResponse();
    unsupportedSummary.summary = `The answer chooses a specific audience and measurable behavior with ${claim}.`;
    assert.throws(
      () =>
        parseFeedbackV2(unsupportedSummary, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      `summary ${claim}`
    );
  }
});

test("keeps negative material polarity distinct from positive evidence", () => {
  const claims = [
    "unsafe controls",
    "insecure storage",
    "illegal approval",
    "illegally approved controls",
    "unlawful controls",
    "noncompliant controls",
    "noncompliance with policy",
    "non-secure storage",
    "nonsecure storage",
    "unsecured storage",
    "unencrypted storage",
  ] as const;

  for (const claim of claims) {
    const response = validResponse();
    response.strengths[0].observation = `The answer chooses working parents and measures weekly plans with ${claim}.`;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      claim
    );
  }

  const grounded = validResponse();
  grounded.scores.insight = 8;
  grounded.strengths[0].observation =
    "The answer defines unsafe controls and encryption rules.";
  grounded.strengths[0].evidence[0].quote =
    "define unsafe controls and encryption rules";
  const parsed = parseFeedbackV2(grounded, {
    transcript: [
      {
        ...transcript[0],
        text: "I would define unsafe controls and encryption rules before launch.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(parsed.strengths[0].dimension, "insight");

  const polarityMismatch = validResponse();
  polarityMismatch.strengths[0].observation =
    "The answer defines safe controls and encryption rules.";
  polarityMismatch.strengths[0].evidence[0].quote =
    "define unsafe controls and encryption rules";
  assert.throws(
    () =>
      parseFeedbackV2(polarityMismatch, {
        transcript: [
          {
            ...transcript[0],
            text: "I would define unsafe controls and encryption rules before launch.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /material claim absent/
  );

  for (const { claim, evidenceText } of [
    {
      claim: "non-secure storage",
      evidenceText: "select secure storage and measure weekly retention",
    },
    {
      claim: "nonsecure storage",
      evidenceText: "select secure storage and measure weekly retention",
    },
    {
      claim: "unsecured storage",
      evidenceText: "select secure storage and measure weekly retention",
    },
    {
      claim: "unencrypted storage",
      evidenceText: "select encrypted storage and measure weekly retention",
    },
    {
      claim: "un-secured storage",
      evidenceText: "select secure storage and measure weekly retention",
    },
    {
      claim: "un-encrypted storage",
      evidenceText: "select encrypted storage and measure weekly retention",
    },
  ] as const) {
    const negativePolarity = validResponse();
    negativePolarity.strengths[0].observation = `The answer selects ${claim} and measures weekly retention.`;
    negativePolarity.strengths[0].evidence[0].quote = evidenceText;
    assert.throws(
      () =>
        parseFeedbackV2(negativePolarity, {
          transcript: [
            {
              ...transcript[0],
              text: `I ${evidenceText} before launch.`,
            },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      claim
    );
  }

  for (const { claim, evidenceClaim } of [
    { claim: "non-secure storage", evidenceClaim: "nonsecure storage" },
    { claim: "nonsecure storage", evidenceClaim: "non secure storage" },
    { claim: "unsecured storage", evidenceClaim: "un-secured storage" },
    { claim: "un-secured storage", evidenceClaim: "unsecured storage" },
    { claim: "unencrypted storage", evidenceClaim: "un-encrypted storage" },
    { claim: "un-encrypted storage", evidenceClaim: "unencrypted storage" },
  ] as const) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = `The answer selects ${claim} and measures weekly retention.`;
    const evidenceText = `select ${evidenceClaim} and measure weekly retention`;
    response.strengths[0].evidence[0].quote = evidenceText;
    const parsed = parseFeedbackV2(response, {
      transcript: [
        {
          ...transcript[0],
          text: `I ${evidenceText} before launch.`,
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(
      parsed.strengths[0].observation,
      response.strengths[0].observation
    );
  }
});

test("keeps explicit negative polarity distinct across every material family", () => {
  const cases = [
    ["safe controls", "not safe controls"],
    ["secure controls", "not secure controls"],
    ["legal controls", "not legal controls"],
    ["private data", "not private data"],
    ["compliant controls", "not compliant controls"],
    ["biometric checks", "non-biometric checks"],
    ["consent checks", "without consent checks"],
    ["discrimination checks", "no discrimination checks"],
    ["encrypted data", "unencrypted data"],
    ["fairness checks", "without fairness checks"],
    ["regulated controls", "unregulated controls"],
    ["surveillance checks", "no surveillance checks"],
    ["growth signals", "no growth signals"],
    ["demand signals", "no demand signals"],
    ["profitable growth", "not profitable growth"],
    ["delighted customers", "not delighted customers"],
    ["product-market fit signals", "no product-market fit signals"],
  ] as const;

  for (const [positiveClaim, negativeEvidence] of cases) {
    const response = validResponse();
    response.strengths[0].observation = `The answer establishes ${positiveClaim} and protects customer data.`;
    const evidenceText = `establish ${negativeEvidence} and protect customer data`;
    response.strengths[0].evidence[0].quote = evidenceText;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            {
              ...transcript[0],
              text: `I ${evidenceText} before launch.`,
            },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      `${positiveClaim} <- ${negativeEvidence}`
    );
  }
});

test("keeps contracted material negation distinct from positive evidence", () => {
  const cases = [
    ["secure storage", "storage that isn't secure"],
    ["safe controls", "controls that aren’t safe"],
    ["compliant controls", "controls that don't comply"],
    ["compliant controls", "controls that doesn’t comply"],
    ["encrypted storage", "storage that wasn't encrypted"],
    ["encrypted storage", "storage that weren’t encrypted"],
    ["encrypted storage", "storage that can't encrypt records"],
    ["encrypted storage", "storage that cannot encrypt records"],
    ["legal controls", "controls that aren't legal"],
    ["private records", "records that aren't private"],
    ["biometric checks", "checks that aren't biometric"],
    ["consent checks", "checks that don't collect consent"],
    ["fairness checks", "checks that aren't fair"],
    ["regulated controls", "controls that aren't regulated"],
    ["discrimination checks", "checks that don't discriminate"],
    ["surveillance checks", "systems that don't use surveillance"],
    ["growth signals", "signals that don't grow"],
    ["demand signals", "signals that don't demand attention"],
    ["profitable growth", "growth that isn't profitable"],
    ["delighted customers", "customers that aren't delighted"],
    [
      "product-market fit signals",
      "signals that aren't product-market fit evidence",
    ],
  ] as const;

  for (const [positiveClaim, negativeEvidence] of cases) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = `The answer selects ${positiveClaim} and measures weekly retention.`;
    const quote = `select ${negativeEvidence} and measure weekly retention`;
    response.strengths[0].evidence[0].quote = quote;
    response.summary = response.strengths[0].observation;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            { ...transcript[0], text: `I ${quote}.` },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      `${positiveClaim} <- ${negativeEvidence}`
    );
  }

  for (const { observation, evidence } of [
    {
      observation:
        "The answer selects secure storage and measures weekly retention.",
      evidence: "select secure storage and measure weekly retention",
    },
    {
      observation:
        "The answer selects secure storage and measures weekly retention.",
      evidence:
        "select storage that isn't insecure and measure weekly retention",
    },
    {
      observation:
        "The answer selects encrypted storage and measures weekly retention.",
      evidence:
        "select storage that isn't unencrypted and measure weekly retention",
    },
  ] as const) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = evidence;
    response.summary = observation;
    const parsed = parseFeedbackV2(response, {
      transcript: [{ ...transcript[0], text: `I ${evidence}.` }, transcript[1]],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.summary, observation);
  }
});

test("accepts positive double negations across every material family", () => {
  const cases = [
    ["safety", "safe controls", "controls that aren't without safety"],
    ["security", "secure controls", "controls that aren’t without security"],
    ["legal", "legal controls", "controls that aren't without legality"],
    ["privacy", "private records", "records that aren’t non-private"],
    [
      "compliance",
      "compliant controls",
      "controls that aren't without compliance",
    ],
    ["biometric", "biometric checks", "checks that aren’t non-biometric"],
    ["consent", "consent checks", "checks that aren't without consent"],
    [
      "discrimination",
      "discrimination checks",
      "checks that aren’t without discrimination",
    ],
    ["encryption", "encrypted records", "records that aren't unencrypted"],
    ["fairness", "fairness checks", "checks that aren’t unfair"],
    ["regulation", "regulated controls", "controls that aren't unregulated"],
    [
      "surveillance",
      "surveillance systems",
      "systems that aren’t without surveillance",
    ],
    ["growth", "growth signals", "signals that aren't without growth"],
    ["demand", "demand signals", "signals that aren’t without demand"],
    ["profitability", "profitable growth", "growth that isn't unprofitable"],
    ["delight", "delighted customers", "customers that aren’t undelighted"],
    [
      "product-market fit",
      "product-market fit signals",
      "signals that aren't without product-market fit",
    ],
  ] as const;

  for (const [family, positiveClaim, doubleNegatedClaim] of cases) {
    const response = validResponse();
    response.strengths[0].observation = `The answer establishes ${doubleNegatedClaim} and measures weekly retention.`;
    const evidence = `establish ${doubleNegatedClaim} and measure weekly retention`;
    response.strengths[0].evidence[0].quote = evidence;
    response.summary = response.strengths[0].observation;

    const parsed = parseFeedbackV2(response, {
      transcript: [{ ...transcript[0], text: `I ${evidence}.` }, transcript[1]],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.summary, response.summary, family);

    const canonical = validResponse();
    canonical.scores.insight = 8;
    canonical.strengths[0].observation = `The answer establishes ${positiveClaim} and measures weekly retention.`;
    canonical.strengths[0].evidence[0].quote = evidence;
    canonical.summary = canonical.strengths[0].observation;
    const canonicalParsed = parseFeedbackV2(canonical, {
      transcript: [{ ...transcript[0], text: `I ${evidence}.` }, transcript[1]],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(canonicalParsed.summary, canonical.summary, family);
  }
});

test("canonicalizes explicit negative security and encryption equivalents", () => {
  for (const { claim, evidenceClaim } of [
    { claim: "not secure storage", evidenceClaim: "insecure storage" },
    { claim: "insecure storage", evidenceClaim: "not secure storage" },
    {
      claim: "storage without encryption",
      evidenceClaim: "unencrypted storage",
    },
    {
      claim: "unencrypted storage",
      evidenceClaim: "storage without encryption",
    },
    { claim: "not encrypted storage", evidenceClaim: "unencrypted storage" },
    { claim: "unencrypted storage", evidenceClaim: "not encrypted storage" },
  ] as const) {
    const response = validResponse();
    response.improvements[0].observation = `The answer selects ${claim} and measures weekly retention.`;
    const evidenceText = `select ${evidenceClaim} and measure weekly retention`;
    response.improvements[0].transcriptRefs = ["writer-a:2"];
    response.improvements[0].evidence = [
      { turnRef: "writer-a:2", quote: evidenceText },
    ];
    const parsed = parseFeedbackV2(response, {
      transcript: [
        transcript[0],
        { ...transcript[1], text: `I ${evidenceText} before launch.` },
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(
      parsed.improvements[0].observation,
      response.improvements[0].observation,
      `${claim} <- ${evidenceClaim}`
    );
  }

  for (const { claim, evidenceClaim } of [
    { claim: "secure storage", evidenceClaim: "not secure storage" },
    {
      claim: "encrypted storage",
      evidenceClaim: "storage without encryption",
    },
    { claim: "encrypted storage", evidenceClaim: "not encrypted storage" },
  ] as const) {
    const response = validResponse();
    response.improvements[0].observation = `The answer selects ${claim} and measures weekly retention.`;
    const evidenceText = `select ${evidenceClaim} and measure weekly retention`;
    response.improvements[0].transcriptRefs = ["writer-a:2"];
    response.improvements[0].evidence = [
      { turnRef: "writer-a:2", quote: evidenceText },
    ];
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            transcript[0],
            { ...transcript[1], text: `I ${evidenceText} before launch.` },
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      `${claim} <- ${evidenceClaim}`
    );
  }
});

test("normalizes bounded product-market-fit separators in findings and summaries", () => {
  const separators = [
    "\u2010",
    "\u2011",
    "\u2012",
    "\u2013",
    "\u2014",
    "\u2015",
    "\u2212",
    "\u2044",
    "\u2215",
    "\uff0f",
  ] as const;

  for (const separator of separators) {
    const unsupportedFinding = validResponse();
    unsupportedFinding.strengths[0].observation = `The answer chooses a specific audience and measurable behavior, proving product${separator}market fit.`;
    assert.throws(
      () =>
        parseFeedbackV2(unsupportedFinding, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      `finding separator ${JSON.stringify(separator)}`
    );

    const unsupportedSummary = validResponse();
    unsupportedSummary.summary = `The answer chooses a specific audience and measurable behavior. The concierge experiment defines a decision threshold. This proves product${separator}market fit.`;
    assert.throws(
      () =>
        parseFeedbackV2(unsupportedSummary, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      `summary separator ${JSON.stringify(separator)}`
    );

    const grounded = validResponse();
    const materialClaim = `product${separator}market fit`;
    grounded.strengths[0].observation = `The answer defines ${materialClaim} with retention and activation evidence.`;
    grounded.strengths[0].evidence[0].quote = `define ${materialClaim} with retention and activation evidence`;
    const parsed = parseFeedbackV2(grounded, {
      transcript: [
        {
          ...transcript[0],
          text: `I would define ${materialClaim} with retention and activation evidence before launch.`,
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(
      parsed.strengths[0].observation,
      grounded.strengths[0].observation
    );
  }
});

test("scopes negative contradiction checks to the claimed target", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The candidate did not define a retention metric.";
  response.strengths[0].evidence[0].quote = "defined a retention metric";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            ...transcript[0],
            text: "I did not discuss pricing, but I defined a retention metric before launch.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /negative claim contradicted/
  );
});

test("scopes negation independently across coordinated clauses", () => {
  for (const coordinator of ["and", "and then", "or"] as const) {
    const response = validResponse();
    const source = `I did not discuss pricing ${coordinator} I defined a retention metric before launch.`;
    response.improvements[0].observation =
      "The candidate did not define a retention metric.";
    response.improvements[0].transcriptRefs = ["writer-a:2"];
    response.improvements[0].evidence = [
      { turnRef: "writer-a:2", quote: source },
    ];

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [transcript[0], { ...transcript[1], text: source }],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /negative claim contradicted/,
      coordinator
    );
  }

  for (const { source, observation } of [
    {
      source:
        "I did not discuss pricing and I did not define a retention metric before launch.",
      observation: "The candidate did not define a retention metric.",
    },
    {
      source:
        "I did not define retention and the activation metric before launch.",
      observation:
        "The candidate did not define a retention or activation metric.",
    },
  ]) {
    const response = validResponse();
    response.improvements[0].observation = observation;
    response.improvements[0].transcriptRefs = ["writer-a:2"];
    response.improvements[0].evidence = [
      { turnRef: "writer-a:2", quote: source },
    ];

    const parsed = parseFeedbackV2(response, {
      transcript: [transcript[0], { ...transcript[1], text: source }],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(
      parsed.improvements[0].observation,
      response.improvements[0].observation
    );
  }
});

test("recognizes a positive coordinated predicate without a repeated subject", () => {
  for (const source of [
    "I did not discuss pricing and defined a retention metric before launch.",
    "I did not discuss pricing and established a retention metric before launch.",
    "I did not discuss pricing and calculated a retention metric before launch.",
    "I did not discuss pricing and built a retention metric before launch.",
    "I did not discuss pricing and ran a retention analysis before launch.",
    "I did not discuss pricing and we build a retention metric before launch.",
    "I did not discuss pricing and she runs a retention analysis before launch.",
  ]) {
    const response = validResponse();
    response.improvements[0].observation =
      "The candidate did not define a retention metric.";
    response.improvements[0].transcriptRefs = ["writer-a:2"];
    response.improvements[0].evidence = [
      { turnRef: "writer-a:2", quote: source },
    ];

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [transcript[0], { ...transcript[1], text: source }],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /negative claim contradicted/,
      source
    );
  }
});

test("finds coordinated positive targets with indirect objects", () => {
  const response = validResponse();
  response.improvements[0].observation =
    "The answer did not supply a success threshold.";
  response.improvements[0].evidence[0].quote =
    "did not launch and supplied us with a success threshold";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          transcript[0],
          {
            ...transcript[1],
            text: "I did not launch and supplied us with a success threshold before testing.",
          },
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /negative claim contradicted/
  );
});

test("recognizes irregular positive coordinated predicates", () => {
  for (const source of [
    "I did not discuss pricing and made a retention dashboard before launch.",
    "I did not discuss pricing and wrote a retention metric definition before launch.",
    "I did not discuss pricing and found a retention metric before launch.",
  ]) {
    const response = validResponse();
    response.improvements[0].observation =
      "The candidate did not define a retention metric.";
    response.improvements[0].transcriptRefs = ["writer-a:2"];
    response.improvements[0].evidence = [
      { turnRef: "writer-a:2", quote: source },
    ];

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [transcript[0], { ...transcript[1], text: source }],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /negative claim contradicted/,
      source
    );
  }
});

test("does not split coordinated target nouns that only resemble predicates", () => {
  for (const { source, observation } of [
    {
      source:
        "I did not define retention and segmented activation metrics before launch.",
      observation:
        "The candidate did not define a retention or activation metric.",
    },
    {
      source:
        "I did not build retention and calculated activation forecasts before launch.",
      observation:
        "The candidate did not build a retention or activation forecast.",
    },
  ] as const) {
    const response = validResponse();
    response.improvements[0].observation = observation;
    response.improvements[0].transcriptRefs = ["writer-a:2"];
    response.improvements[0].evidence = [
      { turnRef: "writer-a:2", quote: source },
    ];

    const parsed = parseFeedbackV2(response, {
      transcript: [transcript[0], { ...transcript[1], text: source }],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(
      parsed.improvements[0].observation,
      response.improvements[0].observation
    );
  }
});

test("recognizes contractions as negative evidence rather than positive contradictions", () => {
  for (const contraction of ["didn't", "didn’t"] as const) {
    const response = validResponse();
    const source = `I ${contraction} define a retention metric before launch.`;
    response.improvements[0].observation =
      "The candidate did not define a retention metric.";
    response.improvements[0].transcriptRefs = ["writer-a:2"];
    response.improvements[0].evidence = [
      { turnRef: "writer-a:2", quote: source },
    ];

    const parsed = parseFeedbackV2(response, {
      transcript: [transcript[0], { ...transcript[1], text: source }],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(
      parsed.improvements[0].observation,
      response.improvements[0].observation
    );
  }
});

test("scopes positive subordinate and sequential predicates away from unrelated negation", () => {
  const sources = [
    "I did not discuss pricing before defining a retention metric before launch.",
    "I did not discuss pricing after defining a retention metric before launch.",
    "I did not discuss pricing and subsequently defined a retention metric before launch.",
  ] as const;

  for (const source of sources) {
    const response = validResponse();
    response.improvements[0].observation =
      "The candidate did not define a retention metric.";
    response.improvements[0].transcriptRefs = ["writer-a:2"];
    response.improvements[0].evidence = [
      { turnRef: "writer-a:2", quote: source },
    ];

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [transcript[0], { ...transcript[1], text: source }],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /negative claim contradicted/,
      source
    );
  }
});

test("finds positive target clauses after common punctuation boundaries", () => {
  const separators = [": ", " — ", " – ", " - ", " … ", " / ", " ("] as const;

  for (const separator of separators) {
    const response = validResponse();
    const source = `I never guess${separator}I define the customer segment and metric before launch.`;
    response.improvements[0].observation =
      "The answer never defines the customer segment or metric.";
    response.improvements[0].transcriptRefs = ["writer-a:2"];
    response.improvements[0].evidence = [
      { turnRef: "writer-a:2", quote: source },
    ];

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [transcript[0], { ...transcript[1], text: source }],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /negative claim contradicted/,
      `separator ${JSON.stringify(separator)}`
    );
  }
});

test("does not treat punctuation alone as a positive target contradiction", () => {
  const separators = [": ", " — ", " – ", " - ", " … ", " / ", " ("] as const;

  for (const separator of separators) {
    const response = validResponse();
    const source = `I never define the customer segment or metric${separator}I explain the launch timing and support workflow.`;
    response.improvements[0].observation =
      "The answer never defines the customer segment or metric.";
    response.improvements[0].transcriptRefs = ["writer-a:2"];
    response.improvements[0].evidence = [
      { turnRef: "writer-a:2", quote: source },
    ];

    const parsed = parseFeedbackV2(response, {
      transcript: [transcript[0], { ...transcript[1], text: source }],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(
      parsed.improvements[0].observation,
      response.improvements[0].observation
    );
  }

  const slashCompound = validResponse();
  const slashSource =
    "I never define activation/retention metrics before launch.";
  slashCompound.improvements[0].observation =
    "The answer never defines activation or retention metrics.";
  slashCompound.improvements[0].transcriptRefs = ["writer-a:2"];
  slashCompound.improvements[0].evidence = [
    { turnRef: "writer-a:2", quote: slashSource },
  ];
  assert.doesNotThrow(() =>
    parseFeedbackV2(slashCompound, {
      transcript: [transcript[0], { ...transcript[1], text: slashSource }],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    })
  );
});

test("rejects a nearby unrelated quote even when the full turn contains the claimed behavior", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The candidate facilitated a legal compliance workshop.";
  response.strengths[0].evidence[0].quote = "security risk";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            eventId: "writer-a:1",
            speaker: "user",
            text: "I prioritized security risk, then facilitated a legal compliance workshop with counsel.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /exact evidence quotes/
  );
});

test("requires quantitative and absolute claims to appear in exact evidence", () => {
  const cases = [
    {
      observation:
        "The candidate validated the idea with twenty customer interviews and a statistically significant experiment.",
      expected: /quantitative claim absent/,
    },
    {
      observation:
        "The candidate validated the idea with a dozen customer interviews.",
      expected: /quantitative claim absent/,
    },
    {
      observation: "The candidate considered every user segment.",
      expected: /absolute claim absent/,
    },
  ];

  for (const { observation, expected } of cases) {
    const response = validResponse();
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = "risk";
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            {
              eventId: "writer-a:1",
              speaker: "user",
              text: "I would prioritize enterprise users because security risk creates the clearest initial product opportunity.",
            },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      expected,
      observation
    );
  }
});

test("canonicalizes dozen and twelve as the same grounded quantity", () => {
  for (const [observedQuantity, evidencedQuantity] of [
    ["dozen", "twelve"],
    ["twelve", "dozen"],
  ] as const) {
    const response = validResponse();
    const quote = `interviewed ${evidencedQuantity} customers and measured weekly retention`;
    response.strengths[0].observation = `The answer interviewed ${observedQuantity} customers and measured weekly retention.`;
    response.strengths[0].evidence[0].quote = quote;
    response.summary = `The answer interviewed ${observedQuantity} customers and measured weekly retention.`;

    const parsed = parseFeedbackV2(response, {
      transcript: [
        {
          ...transcript[0],
          text: `I ${quote} before launch.`,
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.summary, response.summary);
  }
});

test("binds ordinary quantities to their local metric targets", () => {
  const cases = [
    {
      observation:
        "The answer reports retention at 20 percent and measures weekly plans.",
      evidence:
        "report churn at 20 percent and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports 20 percent retention and measures weekly plans.",
      evidence:
        "report 20 percent churn and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports latency at twenty milliseconds and measures weekly plans.",
      evidence:
        "report cost at twenty milliseconds and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports twenty points of NPS and measures weekly plans.",
      evidence:
        "report twenty points of latency and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports an error rate of 20 percent and measures weekly plans.",
      evidence:
        "report a cost of 20 percent and measure weekly plans before launch",
    },
  ] as const;

  for (const { observation, evidence } of cases) {
    const response = validResponse();
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = evidence;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            { ...transcript[0], text: `I ${evidence}.` },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      observation
    );
  }
});

test("canonicalizes digits and number words for the same local metric", () => {
  for (const { observation, evidence } of [
    {
      observation:
        "The answer reports retention at twenty percent and measures weekly plans.",
      evidence:
        "report retention at 20 percent and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports twenty points of NPS and measures weekly plans.",
      evidence:
        "report 20 points of NPS and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports an error rate of 20 percent and measures weekly plans.",
      evidence:
        "report an error rate of twenty percent and measure weekly plans before launch",
    },
  ] as const) {
    const response = validResponse();
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = evidence;
    const parsed = parseFeedbackV2(response, {
      transcript: [{ ...transcript[0], text: `I ${evidence}.` }, transcript[1]],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.strengths[0].observation, observation);
  }
});

test("binds coordinated and multiple quantities without cross-binding", () => {
  for (const { observation, evidence } of [
    {
      observation:
        "The answer reports retention and activation at 20 percent and measures weekly plans.",
      evidence:
        "report retention and churn at 20 percent and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports 20 percent retention and activation and measures weekly plans.",
      evidence:
        "report 20 percent retention and churn and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports retention at 20 percent and activation at 30 percent.",
      evidence: "report retention at 30 percent and activation at 20 percent",
    },
    {
      observation:
        "The answer reports 20 percent retention and activation and measures weekly plans.",
      evidence:
        "report 20 percent retention and activation at 30 percent and measure weekly plans",
    },
    {
      observation:
        "The answer reports latency and cost at 20 milliseconds and measures weekly plans.",
      evidence:
        "report latency and NPS at 20 milliseconds and measure weekly plans before launch",
    },
  ] as const) {
    const response = validResponse();
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = evidence;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            { ...transcript[0], text: `I ${evidence}.` },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      observation
    );
  }

  for (const groundedText of [
    "report retention and activation at 20 percent and measure weekly plans before launch",
    "report 20 percent retention and activation and measure weekly plans before launch",
    "report retention at 20 percent and activation at 30 percent",
  ] as const) {
    const response = validResponse();
    response.strengths[0].observation = `The answer ${groundedText}.`;
    response.strengths[0].evidence[0].quote = groundedText;
    const parsed = parseFeedbackV2(response, {
      transcript: [
        { ...transcript[0], text: `I ${groundedText}.` },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(
      parsed.strengths[0].observation,
      response.strengths[0].observation
    );
  }
});

test("does not bind ordinary counts across predicates to later metrics", () => {
  for (const [observedCount, evidencedCount] of [
    ["twenty", "20"],
    ["20", "twenty"],
  ] as const) {
    const response = validResponse();
    response.strengths[0].observation = `The answer interviewed ${observedCount} customers and measured weekly retention.`;
    response.strengths[0].evidence[0].quote = `interviewed ${evidencedCount} customers and measured weekly retention`;

    const parsed = parseFeedbackV2(response, {
      transcript: [
        {
          ...transcript[0],
          text: `I interviewed ${evidencedCount} customers and measured weekly retention before launch.`,
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(
      parsed.strengths[0].observation,
      response.strengths[0].observation
    );
  }
});

test("binds same-unit quantities to their distinct count predicates", () => {
  for (const { observedInterviewed, observedRetained, evidence } of [
    {
      observedInterviewed: "40",
      observedRetained: "8",
      evidence: "interviewed 8 users and retained 40 users",
    },
    {
      observedInterviewed: "forty",
      observedRetained: "eight",
      evidence: "interviewed 8 users and retained 40 users",
    },
    {
      observedInterviewed: "40",
      observedRetained: "8",
      evidence: "interviewed eight users and retained forty users",
    },
    {
      observedInterviewed: "40",
      observedRetained: "40",
      evidence: "interviewed 8 users and retained 40 users",
    },
    {
      observedInterviewed: "forty",
      observedRetained: "forty",
      evidence: "interviewed eight users and retained forty users",
    },
  ] as const) {
    const response = validResponse();
    response.strengths[0].observation = `The answer interviewed ${observedInterviewed} users and retained ${observedRetained} users.`;
    response.strengths[0].evidence[0].quote = evidence;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            { ...transcript[0], text: `I ${evidence} before launch.` },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      `${observedInterviewed}/${observedRetained} <- ${evidence}`
    );
  }

  for (const { observation, evidence } of [
    {
      observation:
        "The answer interviewed eight users and retained forty users.",
      evidence: "interviewed 8 users and retained 40 users",
    },
    {
      observation: "The answer interviewed 8 users and retained 40 users.",
      evidence: "interviewed eight users and retained forty users",
    },
  ] as const) {
    const response = validResponse();
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = evidence;
    const parsed = parseFeedbackV2(response, {
      transcript: [
        { ...transcript[0], text: `I ${evidence} before launch.` },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.strengths[0].observation, observation);
  }
});

test("keeps modified local quantity targets without letting counts borrow later metrics", () => {
  for (const [observedQuantity, evidencedQuantity] of [
    ["20", "twenty"],
    ["twenty", "20"],
  ] as const) {
    const mismatchedMetric = validResponse();
    mismatchedMetric.strengths[0].observation = `The answer reports retention for the enterprise cohort at ${observedQuantity} percent and measures weekly plans.`;
    const mismatchedEvidence = `report churn for the enterprise cohort at ${evidencedQuantity} percent and measure weekly plans before launch`;
    mismatchedMetric.strengths[0].evidence[0].quote = mismatchedEvidence;

    assert.throws(
      () =>
        parseFeedbackV2(mismatchedMetric, {
          transcript: [
            { ...transcript[0], text: `I ${mismatchedEvidence}.` },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      observedQuantity
    );

    for (const connector of ["for", "in", "at"] as const) {
      const countBorrow = validResponse();
      countBorrow.strengths[0].observation = `The weekly analysis reports retention at ${observedQuantity}.`;
      const countEvidence = `interviewed ${evidencedQuantity} ${connector} retention analysis and reviewed weekly behavior`;
      countBorrow.strengths[0].evidence[0].quote = countEvidence;
      assert.throws(
        () =>
          parseFeedbackV2(countBorrow, {
            transcript: [
              { ...transcript[0], text: `I ${countEvidence}.` },
              transcript[1],
            ],
            evaluationState: "full",
            modelVersion: "gpt-test-1",
          }),
        /quantitative claim absent/,
        `${observedQuantity} ${connector}`
      );
    }

    const grounded = validResponse();
    grounded.strengths[0].observation = `The answer reports retention for the enterprise cohort at ${observedQuantity} percent and measures weekly plans.`;
    const groundedEvidence = `report retention for the enterprise cohort at ${evidencedQuantity} percent and measure weekly plans before launch`;
    grounded.strengths[0].evidence[0].quote = groundedEvidence;
    const parsed = parseFeedbackV2(grounded, {
      transcript: [
        { ...transcript[0], text: `I ${groundedEvidence}.` },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(
      parsed.strengths[0].observation,
      grounded.strengths[0].observation
    );
  }
});

test("binds summary quantities to their local metric targets", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The answer reports churn at 20 percent and measures weekly plans.";
  response.strengths[0].evidence[0].quote =
    "report churn at 20 percent and measure weekly plans";
  response.summary =
    "The answer reports retention at 20 percent and measures weekly plans.";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            ...transcript[0],
            text: "I report churn at 20 percent and measure weekly plans before launch.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /summary contains a quantitative claim absent/
  );
});

test("requires plural magnitudes and relative quantities in exact evidence", () => {
  const claims = [
    "dozens of interviews",
    "hundreds of interviews",
    "thousands of interviews",
    "millions of interviews",
    "twice as many interviews",
    "double the interviews",
    "half the interviews",
  ] as const;

  for (const claim of claims) {
    const response = validResponse();
    response.strengths[0].observation = `The answer chooses working parents and measures weekly plans after ${claim}.`;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      claim
    );
  }

  const grounded = validResponse();
  grounded.strengths[0].observation =
    "The answer interviews dozens of parents and measures weekly plans.";
  grounded.strengths[0].evidence[0].quote =
    "interview dozens of parents and measure weekly plans";
  const parsed = parseFeedbackV2(grounded, {
    transcript: [
      {
        ...transcript[0],
        text: "I would interview dozens of parents and measure weekly plans before launch.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(parsed.strengths[0].dimension, "insight");
});

test("binds arbitrary multipliers and composed numbers to exact quantitative evidence", () => {
  const multiplier = validResponse();
  multiplier.strengths[0].observation =
    "The answer reports 4x retention growth and measures weekly plans.";
  multiplier.strengths[0].evidence[0].quote =
    "report retention growth and measure weekly plans";
  assert.throws(
    () =>
      parseFeedbackV2(multiplier, {
        transcript: [
          {
            ...transcript[0],
            text: "I report retention growth and measure weekly plans before launch.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /quantitative claim absent/
  );

  for (const { observation, evidenceText } of [
    {
      observation:
        "The answer reports 4x retention growth and measures weekly plans.",
      evidenceText:
        "report 4x conversion growth and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports fourfold retention growth and measures weekly plans.",
      evidenceText:
        "report retention growth and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports 4x the retention growth and measures weekly plans.",
      evidenceText:
        "report 4x the conversion growth and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports 4-fold retention growth and measures weekly plans.",
      evidenceText:
        "report 4-fold conversion growth and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports fourfold increase in retention and measures weekly plans.",
      evidenceText:
        "report fourfold increase in conversion and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports 4x annual retention and measures weekly plans.",
      evidenceText:
        "report 4x annual conversion and measure weekly plans before launch",
    },
  ] as const) {
    const response = validResponse();
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = evidenceText;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            {
              ...transcript[0],
              text: `I ${evidenceText}.`,
            },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      observation
    );
  }

  const groundedMultiplier = validResponse();
  groundedMultiplier.strengths[0].observation =
    "The answer reports fourfold retention growth and measures weekly plans.";
  groundedMultiplier.strengths[0].evidence[0].quote =
    "report fourfold retention growth and measure weekly plans";
  const parsedMultiplier = parseFeedbackV2(groundedMultiplier, {
    transcript: [
      {
        ...transcript[0],
        text: "I report fourfold retention growth and measure weekly plans before launch.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(parsedMultiplier.strengths[0].dimension, "insight");

  const equivalentMultiplierForms = validResponse();
  equivalentMultiplierForms.strengths[0].observation =
    "The answer reports 4x the annual retention growth and measures weekly plans.";
  equivalentMultiplierForms.strengths[0].evidence[0].quote =
    "report four-fold growth in retention and measure weekly plans";
  const parsedEquivalentMultiplier = parseFeedbackV2(
    equivalentMultiplierForms,
    {
      transcript: [
        {
          ...transcript[0],
          text: "I report four-fold growth in retention and measure weekly plans before launch.",
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    }
  );
  assert.equal(parsedEquivalentMultiplier.strengths[0].dimension, "insight");

  const composed = validResponse();
  composed.strengths[0].observation =
    "The answer interviewed twenty-one customers and measured weekly retention.";
  composed.strengths[0].evidence[0].quote =
    "ran twenty experiments and interviewed one customer while measuring weekly retention";
  assert.throws(
    () =>
      parseFeedbackV2(composed, {
        transcript: [
          {
            ...transcript[0],
            text: "I ran twenty experiments and interviewed one customer while measuring weekly retention.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /quantitative claim absent/
  );

  const grounded = validResponse();
  grounded.strengths[0].observation =
    "The answer interviewed twenty-one customers and measured weekly retention.";
  grounded.strengths[0].evidence[0].quote =
    "interviewed twenty-one customers and measured weekly retention";
  const parsed = parseFeedbackV2(grounded, {
    transcript: [
      {
        ...transcript[0],
        text: "I interviewed twenty-one customers and measured weekly retention before launch.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(parsed.strengths[0].dimension, "insight");
});

test("binds multipliers past possessives and leading modifiers", () => {
  for (const { observation, evidenceText } of [
    {
      observation:
        "The answer reports 4x their latency and measures weekly plans.",
      evidenceText:
        "report 4x their throughput and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports fourfold mobile latency and measures weekly plans.",
      evidenceText:
        "report fourfold mobile throughput and measure weekly plans before launch",
    },
  ] as const) {
    const response = validResponse();
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = evidenceText;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            { ...transcript[0], text: `I ${evidenceText}.` },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      observation
    );
  }

  for (const { observation, evidenceText } of [
    {
      observation:
        "The answer reports 4x their latency and measures weekly plans.",
      evidenceText:
        "report fourfold mobile latency and measure weekly plans before launch",
    },
    {
      observation:
        "The answer reports fourfold mobile latency and measures weekly plans.",
      evidenceText:
        "report 4x their latency and measure weekly plans before launch",
    },
  ] as const) {
    const response = validResponse();
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = evidenceText;
    const parsed = parseFeedbackV2(response, {
      transcript: [
        { ...transcript[0], text: `I ${evidenceText}.` },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.strengths[0].observation, observation);
  }
});

test("binds lexical multipliers to their exact targets", () => {
  for (const [multiplier, claimedTarget, evidencedTarget] of [
    ["doubled", "retention", "conversion"],
    ["tripled", "revenue", "retention"],
    ["halved", "conversion", "revenue"],
    ["quadrupled", "retention", "conversion"],
  ] as const) {
    const response = validResponse();
    response.strengths[0].observation = `The answer ${multiplier} ${claimedTarget} and measured weekly plans.`;
    response.strengths[0].evidence[0].quote = `${multiplier} ${evidencedTarget} and measured weekly plans`;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            {
              ...transcript[0],
              text: `I ${multiplier} ${evidencedTarget} and measured weekly plans before launch.`,
            },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      multiplier
    );
  }
});

test("binds quadruple lexical multiplier targets in summaries", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The answer quadrupled conversion and measured weekly plans.";
  response.strengths[0].evidence[0].quote =
    "quadrupled conversion and measured weekly plans";
  response.summary =
    "The answer quadrupled retention and measured weekly plans.";
  const multiplierTranscript = [
    {
      ...transcript[0],
      text: "I quadrupled conversion and measured weekly plans before launch.",
    },
    transcript[1],
  ];

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: multiplierTranscript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /quantitative claim absent/
  );

  response.summary =
    "The answer quadrupled conversion and measured weekly plans.";
  const parsed = parseFeedbackV2(response, {
    transcript: multiplierTranscript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(parsed.summary, response.summary);
});

test("rejects directional findings and summaries contradicted by exact evidence", () => {
  const directionalTranscript = [
    {
      eventId: "writer-a:1",
      speaker: "user" as const,
      text: "Retention decreased by 20% after launch for working parents.",
    },
    transcript[1],
  ];

  const contradictedFinding = validResponse();
  contradictedFinding.scores.insight = 8;
  contradictedFinding.strengths[0].observation =
    "Retention increased by 20% after launch for working parents.";
  contradictedFinding.strengths[0].evidence[0].quote =
    "Retention decreased by 20% after launch for working parents";
  assert.throws(
    () =>
      parseFeedbackV2(contradictedFinding, {
        transcript: directionalTranscript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /material claim absent/
  );

  const contradictedSummary = validResponse();
  contradictedSummary.scores.insight = 8;
  contradictedSummary.strengths[0].observation =
    "Retention decreased by 20% after launch for working parents.";
  contradictedSummary.strengths[0].evidence[0].quote =
    "Retention decreased by 20% after launch for working parents";
  contradictedSummary.summary =
    "Retention increased by 20% after launch for working parents.";
  assert.throws(
    () =>
      parseFeedbackV2(contradictedSummary, {
        transcript: directionalTranscript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /summary contains a material claim absent/
  );

  const groundedNegative = validResponse();
  groundedNegative.scores.insight = 8;
  groundedNegative.strengths[0].observation =
    "Retention decreased by 20% after launch for working parents.";
  groundedNegative.strengths[0].evidence[0].quote =
    "Retention decreased by 20% after launch for working parents";
  const parsed = parseFeedbackV2(groundedNegative, {
    transcript: directionalTranscript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(
    parsed.strengths[0].observation,
    groundedNegative.strengths[0].observation
  );
});

test("binds directional polarity to generic observable metric targets", () => {
  for (const target of ["latency", "engagement", "NPS", "error rate", "cost"]) {
    const source = `${target} decreased after launch and we measured weekly plans.`;
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = `${target} increased after launch and the answer measured weekly plans.`;
    response.strengths[0].evidence[0].quote = source.slice(0, -1);

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent from its exact evidence quotes/,
      target
    );
  }
});

test("binds generic metric polarity in summaries and mixed-direction clauses", () => {
  const source =
    "Latency decreased and engagement increased after launch for working parents.";
  const response = validResponse();
  response.scores.insight = 8;
  response.strengths[0].observation =
    "The answer reports latency decreased and engagement increased after launch.";
  response.strengths[0].evidence[0].quote = source.slice(0, -1);
  response.summary =
    "Latency increased and engagement increased after launch for working parents.";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [{ ...transcript[0], text: source }, transcript[1]],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /summary contains a material claim absent from grounded findings/
  );

  response.summary = response.strengths[0].observation;
  const parsed = parseFeedbackV2(response, {
    transcript: [{ ...transcript[0], text: source }, transcript[1]],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(parsed.summary, response.summary);
});

test("does not classify ordinary directional prose as a metric claim", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The answer reduced ambiguity and improved its recommendation.";
  response.strengths[0].evidence[0].quote =
    "reduced ambiguity and improved its recommendation";

  const parsed = parseFeedbackV2(response, {
    transcript: [
      {
        ...transcript[0],
        text: "I reduced ambiguity and improved its recommendation for working parents.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(parsed.scores.insight, 9);

  const separatedMetric = validResponse();
  separatedMetric.strengths[0].observation =
    "The answer improved its recommendation and separately measured latency.";
  separatedMetric.strengths[0].evidence[0].quote =
    "improved its recommendation and separately measured latency";
  parseFeedbackV2(separatedMetric, {
    transcript: [
      {
        ...transcript[0],
        text: "I improved its recommendation and separately measured latency for working parents.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
});

test("does not bind canonical metric directions across unrelated predicates", () => {
  for (const { direction, evidenceDirection } of [
    { direction: "increased", evidenceDirection: "increased" },
    { direction: "decreased", evidenceDirection: "decreased" },
    { direction: "strong", evidenceDirection: "had strong" },
  ] as const) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = `The answer reports ${direction} retention after the weekly experiment.`;
    const quote = `retention was the weekly metric and the experiment ${evidenceDirection} sample quality`;
    response.strengths[0].evidence[0].quote = quote;
    response.summary = response.strengths[0].observation;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [
            { ...transcript[0], text: `I said ${quote}.` },
            transcript[1],
          ],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /(?:material|directional) claim absent/,
      direction
    );
  }

  const grounded = validResponse();
  grounded.scores.insight = 8;
  grounded.strengths[0].observation =
    "The answer reports increased weekly retention after the experiment.";
  grounded.strengths[0].evidence[0].quote =
    "experiment increased weekly retention for working parents";
  grounded.summary = grounded.strengths[0].observation;
  const parsed = parseFeedbackV2(grounded, {
    transcript: [
      {
        ...transcript[0],
        text: "The experiment increased weekly retention for working parents.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(parsed.summary, grounded.summary);

  const describedTarget = validResponse();
  describedTarget.scores.insight = 8;
  describedTarget.strengths[0].observation =
    "The answer reports strong customer demand after the experiment.";
  describedTarget.strengths[0].evidence[0].quote =
    "experiment showed strong customer demand for working parents";
  describedTarget.summary = describedTarget.strengths[0].observation;
  const describedTargetParsed = parseFeedbackV2(describedTarget, {
    transcript: [
      {
        ...transcript[0],
        text: "The experiment showed strong customer demand for working parents.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(describedTargetParsed.summary, describedTarget.summary);
});

test("does not use a negative generic metric finding as exceptional-score support", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "Engagement decreased after launch and the answer measured weekly plans.";
  response.strengths[0].evidence[0].quote =
    "Engagement decreased after launch and measured weekly plans";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            ...transcript[0],
            text: "Engagement decreased after launch and measured weekly plans.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /exceptional insight score requires a same-dimension grounded strength/
  );
});

test("binds opposite directions to their local coordinated metrics in findings", () => {
  const cases = [
    {
      source:
        "Retention decreased and activation increased after launch for working parents.",
      observation:
        "The answer reports retention increased and activation increased after launch.",
    },
    {
      source:
        "Activation increased and retention decreased after launch for working parents.",
      observation:
        "The answer reports activation decreased and retention decreased after launch.",
    },
    {
      source:
        "Retention decreased, activation increased, and revenue grew after launch for working parents.",
      observation:
        "The answer reports retention increased, activation increased, and revenue grew after launch.",
    },
  ] as const;

  for (const { source, observation } of cases) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source.slice(0, -1);

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent from its exact evidence quotes/,
      `${source} => ${observation}`
    );
  }
});

test("binds opposite directions to their local coordinated metrics in summaries", () => {
  const cases = [
    {
      source:
        "Retention decreased and activation increased after launch for working parents.",
      observation: "The answer reports activation increased after launch.",
      summary:
        "Retention increased and activation increased after launch for working parents.",
    },
    {
      source:
        "Activation increased and retention decreased after launch for working parents.",
      observation: "The answer reports activation increased after launch.",
      summary:
        "Activation decreased and retention decreased after launch for working parents.",
    },
    {
      source:
        "Retention decreased, activation increased, and revenue grew after launch for working parents.",
      observation:
        "The answer reports activation increased and revenue grew after launch.",
      summary:
        "Retention increased, activation increased, and revenue grew after launch for working parents.",
    },
  ] as const;

  for (const { source, observation, summary } of cases) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source.slice(0, -1);
    response.summary = summary;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /summary contains a material claim absent from grounded findings/,
      `${source} => ${summary}`
    );
  }
});

test("preserves shared directions across coordinated metric groups", () => {
  const cases = [
    {
      source:
        "Retention and activation increased after launch for working parents.",
      observation:
        "The answer reports retention and activation increased after launch.",
    },
    {
      source:
        "Increased retention, activation, and revenue after launch for working parents.",
      observation:
        "The answer reports increased retention, activation, and revenue after launch.",
    },
  ] as const;

  for (const { source, observation } of cases) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source.slice(0, -1);
    response.summary = observation;

    const parsed = parseFeedbackV2(response, {
      transcript: [{ ...transcript[0], text: source }, transcript[1]],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.strengths[0].observation, observation);
    assert.equal(parsed.summary, observation);
  }
});

test("does not synthesize directional findings across unrelated evidence units", () => {
  const directionalTranscript = [
    {
      eventId: "writer-direction:retention",
      speaker: "user" as const,
      text: "We linked retention to the rollout plan for working parents.",
    },
    {
      eventId: "writer-direction:activation",
      speaker: "user" as const,
      text: "Activation increased after prioritization of the onboarding flow.",
    },
    transcript[1],
  ];
  const response = validResponse();
  response.scores.insight = 8;
  response.strengths[0].observation =
    "The answer linked increased retention to rollout prioritization.";
  response.strengths[0].transcriptRefs = [
    "writer-direction:retention",
    "writer-direction:activation",
  ];
  response.strengths[0].evidence = [
    {
      turnRef: "writer-direction:retention",
      quote: "linked retention to the rollout plan",
    },
    {
      turnRef: "writer-direction:activation",
      quote: "Activation increased after prioritization of the onboarding flow",
    },
  ];

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: directionalTranscript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /(?:material|directional) claim absent/
  );
});

test("accepts multi-evidence findings when one unit grounds the full direction and target", () => {
  const directionalTranscript = [
    {
      eventId: "writer-direction:retention",
      speaker: "user" as const,
      text: "Retention increased after launch for working parents.",
    },
    {
      eventId: "writer-direction:priority",
      speaker: "user" as const,
      text: "We prioritized the rollout plan for working parents.",
    },
    transcript[1],
  ];
  const response = validResponse();
  response.scores.insight = 8;
  response.strengths[0].observation =
    "The answer linked increased retention to rollout prioritization.";
  response.strengths[0].transcriptRefs = [
    "writer-direction:retention",
    "writer-direction:priority",
  ];
  response.strengths[0].evidence = [
    {
      turnRef: "writer-direction:retention",
      quote: "Retention increased after launch for working parents",
    },
    {
      turnRef: "writer-direction:priority",
      quote: "prioritized the rollout plan for working parents",
    },
  ];

  const parsed = parseFeedbackV2(response, {
    transcript: directionalTranscript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(
    parsed.strengths[0].observation,
    response.strengths[0].observation
  );
});

test("does not synthesize directional summaries across unrelated evidence units", () => {
  const directionalTranscript = [
    {
      eventId: "writer-direction:retention",
      speaker: "user" as const,
      text: "We linked retention to the rollout plan for working parents.",
    },
    {
      eventId: "writer-direction:activation",
      speaker: "user" as const,
      text: "Activation increased after prioritization of the onboarding flow.",
    },
  ];
  const response = validResponse();
  response.scores.insight = 8;
  response.strengths[0].observation =
    "The answer linked retention to rollout planning.";
  response.strengths[0].transcriptRefs = ["writer-direction:retention"];
  response.strengths[0].evidence = [
    {
      turnRef: "writer-direction:retention",
      quote: "linked retention to the rollout plan for working parents",
    },
  ];
  response.improvements[0].observation =
    "The answer linked increased activation to prioritization.";
  response.improvements[0].transcriptRefs = ["writer-direction:activation"];
  response.improvements[0].evidence = [
    {
      turnRef: "writer-direction:activation",
      quote: "Activation increased after prioritization of the onboarding flow",
    },
  ];
  response.summary = "Retention increased after prioritization.";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: directionalTranscript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /summary contains (?:a material|a directional) claim absent/
  );

  response.summary = "Activation increased after prioritization.";
  const parsed = parseFeedbackV2(response, {
    transcript: directionalTranscript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(parsed.summary, response.summary);
});

test("keeps directional material polarity distinct in exact evidence", () => {
  const response = validResponse();
  response.scores.insight = 8;
  response.strengths[0].observation =
    "The answer reports declining demand and weak growth.";
  response.strengths[0].evidence[0].quote =
    "strong demand and rapid growth among working parents";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            ...transcript[0],
            text: "I expect strong demand and rapid growth among working parents.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /material claim absent/
  );
});

test("rejects absence findings contradicted by explicit positive evidence", () => {
  const response = validResponse();
  response.scores.insight = 8;
  response.strengths[0] = {
    ...response.strengths[0],
    observation: "The answer tests a concierge flow before launch.",
    transcriptRefs: ["writer-a:2"],
    evidence: [
      {
        turnRef: "writer-a:2",
        quote: "test a concierge flow first",
      },
    ],
  };
  response.improvements[0] = {
    ...response.improvements[0],
    observation:
      "The retention metric and customer threshold remain undefined.",
    transcriptRefs: ["writer-a:1"],
    evidence: [
      {
        turnRef: "writer-a:1",
        quote:
          "define the retention metric and specify the customer threshold clearly",
      },
    ],
  };

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            ...transcript[0],
            text: "I define the retention metric and specify the customer threshold clearly.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /negative claim contradicted/
  );
});

test("rejects a negative observation contradicted by cited positive evidence", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The candidate did not identify a measurable outcome.";
  response.strengths[0].evidence[0].quote = "retention";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            eventId: "writer-a:1",
            speaker: "user",
            text: "I would measure retention because it captures recurring customer value over time.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /negative claim contradicted/
  );
});

test("requires adequate exact context for confidence above 0.9", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The answer explicitly identifies security risk.";
  response.strengths[0].evidence[0].quote = "security risk";
  response.strengths[0].confidence = 1;

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            eventId: "writer-a:1",
            speaker: "user",
            text: "I would prioritize enterprise users because security risk creates the clearest initial product opportunity.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /confidence above 0\.9 requires/
  );
});

test("accepts very-high-confidence findings with adequate grounded context", () => {
  const response = validResponse();
  response.strengths[0].confidence = 0.98;

  const parsed = parseFeedbackV2(response, {
    transcript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });

  assert.equal(parsed.strengths[0].confidence, 0.98);
});

test("counts compact-script context fairly for very-high confidence", () => {
  const response = validResponse();
  const quote =
    "因为 用户 在夜间容易错过重要提醒，所以我会先分析他们的需求，然后优先处理高风险场景";
  response.strengths[0].observation = `The answer explicitly cites ${quote}.`;
  response.strengths[0].evidence[0].quote = quote;
  response.strengths[0].confidence = 0.98;

  const parsed = parseFeedbackV2(response, {
    transcript: [
      { eventId: "writer-a:1", speaker: "user", text: quote },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });

  assert.equal(parsed.strengths[0].confidence, 0.98);
});

test("rejects exceptional dimensions without same-dimension grounded strengths", () => {
  const response = validResponse();
  Object.assign(response.scores, {
    structure: 10,
    clarity: 10,
    insight: 10,
    communication: 10,
    leadership: 10,
  });

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /exceptional structure score requires a same-dimension grounded strength/
  );
});

test("grounds each exceptional dimension even when the weighted overall is below 9", () => {
  const response = validResponse();
  Object.assign(response.scores, {
    structure: 10,
    clarity: 7,
    insight: 9,
    communication: 7,
    leadership: 8,
  });

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /exceptional structure score requires a same-dimension grounded strength/
  );
});

test("negative findings mislabeled as strengths cannot unlock exceptional scores", () => {
  for (const { observation, quote, source } of [
    {
      observation: "The answer does not define a success threshold.",
      quote: "not define a success threshold",
      source: "I did not define a success threshold before launch.",
    },
    {
      observation: "The answer leaves the success threshold undefined.",
      quote: "leave the success threshold undefined",
      source: "I leave the success threshold undefined before launch.",
    },
    {
      observation:
        "Retention decreased by 20% after launch for working parents.",
      quote: "Retention decreased by 20% after launch for working parents",
      source: "Retention decreased by 20% after launch for working parents.",
    },
    ...[
      "unset",
      "undecided",
      "undetermined",
      "unmeasured",
      "unresolved",
      "indeterminate",
      "TBD",
      "unknown",
      "to be determined",
      "pending",
      "unvalidated",
    ].map((absence) => ({
      observation: `The answer leaves the success threshold ${absence}.`,
      quote: `leave the success threshold ${absence}`,
      source: `I leave the success threshold ${absence} before launch.`,
    })),
    ...["barely", "hardly", "scarcely"].map((limiter) => ({
      observation: `The answer ${limiter} defines the success threshold and measures weekly plans.`,
      quote: `${limiter} defines the success threshold and measures weekly plans`,
      source: `The answer ${limiter} defines the success threshold and measures weekly plans before launch.`,
    })),
  ] as const) {
    const response = validResponse();
    response.scores.structure = 10;
    response.scores.insight = 8;
    response.strengths[0] = {
      ...response.strengths[0],
      dimension: "structure",
      observation,
      evidence: [{ turnRef: "writer-a:1", quote }],
    };

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /exceptional structure score requires a same-dimension grounded strength/,
      observation
    );
  }
});

test("rejects a near-perfect all-9 profile without broad evidence", () => {
  const { response, sources } = exceptionalResponseFixture();
  Object.assign(response.scores, {
    structure: 9,
    clarity: 9,
    insight: 9,
    communication: 9,
    leadership: 9,
  });
  for (const strength of response.strengths) {
    strength.transcriptRefs = ["writer-exceptional:collapsed"];
    strength.evidence[0]!.turnRef = "writer-exceptional:collapsed";
  }
  response.improvements[0]!.transcriptRefs = ["writer-exceptional:collapsed"];
  response.improvements[0]!.evidence[0]!.turnRef =
    "writer-exceptional:collapsed";
  const collapsedTranscript = [
    {
      eventId: "writer-exceptional:collapsed",
      speaker: "user" as const,
      text: `${sources.map((source) => source.text).join(" ")} I would test a concierge flow first, but I have not defined a success threshold.`,
    },
  ];

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: collapsedTranscript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /exceptional scores with an overall score of 9 or higher/
  );
});

test("rejects the audited all-9 payload with unsupported findings and a hiring summary", () => {
  const auditTranscript = [
    {
      eventId: "turn_0001",
      speaker: "user" as const,
      text: "I would prioritize working parents and measure weekly retention before expanding the calendar pilot.",
    },
    {
      eventId: "turn_0002",
      speaker: "user" as const,
      text: "I would interview new managers because they struggle with onboarding, and then test guided checklists.",
    },
    {
      eventId: "turn_0003",
      speaker: "user" as const,
      text: "I would compare cohorts before launch because repeat usage signals durable value for the product.",
    },
  ];
  const response = {
    ...validResponse(),
    evaluationState: "partial",
    scores: {
      structure: 9,
      clarity: 9,
      insight: 9,
      communication: 9,
      leadership: 9,
    },
    strengths: [
      {
        ...validResponse().strengths[0],
        observation:
          "The prioritization ensured legal compliance and robust privacy safeguards.",
        transcriptRefs: ["turn_0001"],
        evidence: [
          { turnRef: "turn_0001", quote: "prioritize working parents" },
        ],
      },
    ],
    improvements: [
      {
        ...validResponse().improvements[0],
        observation:
          "The measurement approach should add biometric surveillance before launch.",
        transcriptRefs: ["turn_0001"],
        evidence: [{ turnRef: "turn_0001", quote: "measure weekly retention" }],
      },
    ],
    drills: ["Practice defending biometric surveillance in the next answer."],
    summary: "This flawless candidate should be hired immediately.",
  };

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: auditTranscript,
        evaluationState: "partial",
        modelVersion: "gpt-test",
      }),
    FeedbackV2ParseError
  );
});

test("accepts an all-10 profile only with broad exact evidence", () => {
  const { response, transcript: broadTranscript } =
    exceptionalResponseFixture();

  const parsed = parseFeedbackV2(response, {
    transcript: broadTranscript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });

  assert.deepEqual(Object.values(parsed.scores), [10, 10, 10, 10, 10]);
});

test("rejects hiring, readiness, pass-fail, and unsupported absolute summaries", () => {
  for (const summary of [
    "This candidate should be hired immediately.",
    "The candidate is interview-ready.",
    "This answer passes the interview bar.",
    "This candidate should advance to the next round.",
    "This candidate deserves an offer.",
    "I recommend an offer.",
    "This applicant should advance to the next round.",
    "I recommend moving this candidate forward.",
    "The candidate should proceed in the interview process.",
    "This is a definite yes for the candidate.",
    "This flawless candidate showed no weaknesses.",
    "The answer has only strengths.",
  ]) {
    const response = validResponse();
    response.summary = summary;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /summary must not make/,
      summary
    );
  }
});

test("default-ignorable characters cannot hide a forbidden outcome", () => {
  const response = validResponse();
  response.summary =
    "The answer chooses a specific audience and measurable behavior, so this candidate should be h\u200Dired.";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /summary must not make hiring/
  );
});

test("rejects generalized offer and candidate-advancement outcomes", () => {
  const outcomes = [
    "The candidate earned an offer.",
    "An offer is warranted for this candidate.",
    "Extend an offer to the candidate.",
    "The applicant advances to the next round.",
    "Send the applicant to the next round.",
    "Recommend advancing the applicant.",
    "The candidate goes to the next round.",
    "The candidate should receive an offer.",
    "I support extending an offer to the candidate.",
    "The applicant ought to proceed to the next round.",
    "This makes the candidate employable.",
    "We should give the candidate an offer.",
    "The candidate is hireable.",
    "Bring the candidate onsite.",
    "The candidate merits moving on.",
    "The candidate warrants the role.",
    "The interviewee merits the position.",
    "The applicant deserves the job.",
    "I would green-light the applicant.",
    "The candidate should get an offer.",
    "We should make an offer to the candidate.",
    "Invite the candidate onsite.",
    "Advance the candidate.",
    "Move the candidate forward.",
    "Advance candidate.",
    "Move candidate forward.",
    "The candidate belongs on the product team.",
    "This applicant is a strong fit for the product role.",
    "The interviewee is suitable for the role.",
    "This candidate fits the team.",
  ] as const;

  for (const outcome of outcomes) {
    const response = validResponse();
    response.summary = `The answer chooses a specific audience and measurable behavior. ${outcome}`;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /summary must not make hiring, readiness, pass\/fail, or hiring-bar claims/,
      outcome
    );
  }
});

test("rejects direct candidate selection for hiring roles and teams", () => {
  for (const outcome of [
    "The candidate was selected for the role.",
    "This applicant has been chosen for the job.",
    "The interviewee is selected for the position.",
    "They were chosen for the product team.",
    "He got selected for this role.",
    "She was chosen for our team.",
    "We selected the candidate for the product role.",
    "We chose this applicant for the job.",
    "You were selected for the role.",
    "I was chosen for the position.",
    "We have chosen them for the team.",
    "Select the interviewee for the team.",
    "Candidate selected for the role.",
    "Chosen for the role, this candidate advances.",
  ] as const) {
    const response = validResponse();
    response.summary = `The answer chooses a specific audience and measurable behavior. ${outcome}`;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /summary must not make hiring, readiness, pass\/fail, or hiring-bar claims/,
      outcome
    );
  }
});

test("rejects intervening and nominalized candidate selection outcomes", () => {
  const outcomes = [
    "The candidate was among those selected for the role.",
    "The candidate ended up selected for the role.",
    "The candidate was ultimately selected for the role.",
    "The candidate was ultimately not selected for the role.",
    "The candidate had clearly been chosen for the role.",
    "The candidate emerged as the one chosen for the role.",
    "The applicant ranked among those chosen for the product team.",
    "The interviewee joined the people selected for the position.",
    "The candidate's selection for the role was confirmed.",
    "The candidates selection for the role was confirmed.",
    "Candidate selection for the role was confirmed.",
    "The candidate's final selection for the role was confirmed.",
    "The selection of the candidate for the role was confirmed.",
    "The applicant’s choice for the product team was confirmed.",
    "The role selection landed on the candidate.",
    "The candidate was reported as selected for the role.",
    "The applicant appears to have been chosen for the product team.",
    "The interviewee was confirmed as selected for the position.",
    "The candidate was not reported as selected for the role.",
    "The candidate did not appear to be chosen for the role.",
    "The applicant was not confirmed as chosen for the team.",
    "The selection for the role went to the candidate.",
    "The choice for the product team fell to the applicant.",
    "The selection for the role did not go to the candidate.",
    "The choice for the team was not confirmed as the interviewee.",
    "The selection for the role was reported to have gone to the candidate.",
    "The interviewee was confirmed as not having been selected for the product job.",
    "The selection for the product role ultimately went to the candidate.",
  ] as const;

  for (const outcome of outcomes) {
    const response = validResponse();
    response.summary = outcome;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /summary must not make hiring, readiness, pass\/fail, or hiring-bar claims/,
      outcome
    );
  }
});

test("accepts bounded evidence-limited summary language", () => {
  const response = validResponse();
  response.summary =
    "The recorded answer identifies a user segment; it does not define a decision threshold.";

  const parsed = parseFeedbackV2(response, {
    transcript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });

  assert.equal(parsed.summary, response.summary);
});

test("grounds each factual summary statement independently", () => {
  for (const summary of [
    "The answer chooses a specific user and need. It invents blockchain moons.",
    "The answer chooses a specific audience and measurable behavior.It invents moons.",
    "The answer chooses a specific audience and measurable behavior; it invents blockchain moons.",
    "The answer chooses a specific audience and measurable behavior\nit invents blockchain moons.",
    "The answer chooses a specific audience and measurable behavior。It invents blockchain moons.",
    "The answer chooses a specific audience and measurable behavior.Blockchain moons are invented.",
    "The answer chooses a specific audience and measurable behavior.Customers invent blockchain moons.",
    "The answer chooses a specific audience and measurable behavior.Additionally, blockchain moons are invented.",
    "The answer chooses a specific audience and measurable behavior．Blockchain moons are invented.",
    "The answer chooses a specific audience and measurable behavior…Customers invent blockchain moons.",
    "The answer chooses a specific audience and measurable behavior‥Customers invent blockchain moons.",
    "The answer chooses a specific audience and measurable behavior।Customers invent blockchain moons.",
    "The answer chooses a specific audience and measurable behavior۔Customers invent blockchain moons.",
    "The answer chooses a specific audience and measurable behavior։Customers invent blockchain moons.",
    "The answer chooses a specific audience and measurable behavior።Customers invent blockchain moons.",
  ]) {
    const unsupported = validResponse();
    unsupported.summary = summary;
    assert.throws(
      () =>
        parseFeedbackV2(unsupported, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /each factual summary statement requires at least two observable supports/,
      summary
    );
  }

  for (const summary of [
    "The answer chooses a specific audience and measurable behavior. The response tests a concierge experiment and names a threshold.",
    "The answer chooses a specific audience and measurable behavior; the response tests a concierge experiment and names a threshold.",
    "The answer chooses a specific audience and measurable behavior\nThe response tests a concierge experiment and names a threshold.",
    "The answer chooses a specific audience and measurable behavior.Customers receive a concierge experiment with a decision threshold.",
    "The answer chooses a specific audience and measurable behavior…Customers receive a concierge experiment with a decision threshold.",
    "The answer chooses a specific audience and measurable behavior‥Customers receive a concierge experiment with a decision threshold.",
    "The answer chooses a specific audience and measurable behavior।Customers receive a concierge experiment with a decision threshold.",
    "The answer chooses a specific audience and measurable behavior۔Customers receive a concierge experiment with a decision threshold.",
    "The answer chooses a specific audience and measurable behavior։Customers receive a concierge experiment with a decision threshold.",
    "The answer chooses a specific audience and measurable behavior።Customers receive a concierge experiment with a decision threshold.",
  ]) {
    const grounded = validResponse();
    grounded.summary = summary;
    const parsed = parseFeedbackV2(grounded, {
      transcript,
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.summary, summary);
  }
});

test("does not let next-step coaching ground a factual summary", () => {
  const response = validResponse();
  response.strengths[0].nextStep =
    "Invent blockchain moons in the next answer.";
  response.summary = "The answer invents blockchain moons.";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /each factual summary statement requires at least two observable supports/
  );
});

test("splits a summary period adjacent to a digit unless it is decimal", () => {
  const unsupported = validResponse();
  unsupported.strengths[0].observation =
    "The answer interviewed customer 1 and measured weekly plans.";
  unsupported.strengths[0].evidence[0].quote =
    "interviewed customer 1 and measured weekly plans";
  unsupported.summary =
    "The answer interviewed customer 1.It invents blockchain moons.";

  const numberedTranscript = [
    {
      ...transcript[0],
      text: "I interviewed customer 1 and measured weekly plans before launch.",
    },
    transcript[1],
  ];
  assert.throws(
    () =>
      parseFeedbackV2(unsupported, {
        transcript: numberedTranscript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /each factual summary statement requires at least two observable supports/
  );

  const decimal = validResponse();
  decimal.strengths[0].observation =
    "The answer measured version 1.5 behavior for working parents.";
  decimal.strengths[0].evidence[0].quote =
    "version 1.5 behavior for working parents";
  decimal.summary =
    "The answer measured version 1.5 behavior for working parents.";
  const parsed = parseFeedbackV2(decimal, {
    transcript: [
      {
        ...transcript[0],
        text: "I measured version 1.5 behavior for working parents before launch.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(parsed.summary, decimal.summary);
});

test("preserves periods inside abbreviations when grounding summary units", () => {
  const response = validResponse();
  response.strengths[0].observation =
    "The answer chooses U.S. parents and measures weekly plans.";
  response.strengths[0].evidence[0].quote =
    "choose U.S. parents and measure weekly plans";
  response.summary =
    "The answer chooses U.S. parents and measures weekly plans.";

  const parsed = parseFeedbackV2(response, {
    transcript: [
      {
        ...transcript[0],
        text: "I would choose U.S. parents and measure weekly plans before launch.",
      },
      transcript[1],
    ],
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });

  assert.equal(parsed.summary, response.summary);
});

test("preserves grounded next-step coaching without treating it as advancement", () => {
  for (const summary of [
    "The candidate should proceed by defining a decision threshold in the next answer.",
    "They should proceed with a clearer experiment threshold.",
    "The candidate should advance the analysis by defining a threshold.",
    "They should move forward with a clearer experiment threshold.",
  ]) {
    const response = validResponse();
    response.summary = summary;
    const parsed = parseFeedbackV2(response, {
      transcript,
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });
    assert.equal(parsed.summary, summary);
  }
});

test("does not confuse grounded PM domain language with candidate outcomes", () => {
  const cases: readonly {
    summary: string;
    quote: string;
    adverse?: boolean;
  }[] = [
    {
      summary: "The answer sets a pass/fail threshold for the experiment.",
      quote: "pass/fail threshold for the experiment",
    },
    {
      summary: "The failed pilot surfaced onboarding friction.",
      quote: "failed pilot surfaced onboarding friction",
    },
    {
      summary: "The rollout includes a fail-safe fallback before launch.",
      quote: "rollout includes a fail-safe fallback before launch",
    },
    {
      summary:
        "The candidate explains how a hiring marketplace should measure role readiness.",
      quote: "hiring marketplace should measure role readiness",
    },
    {
      summary: "The answer recommends an offer structure for the launch.",
      quote: "recommends an offer structure for the launch",
    },
    {
      summary:
        "The answer explains how product-team fit affects launch ownership.",
      quote: "product-team fit affects launch ownership",
    },
    {
      summary:
        "The candidate selected an enterprise segment for the product launch.",
      quote: "candidate selected an enterprise segment for the product launch",
    },
    {
      summary: "They chose the product team for the pilot rollout.",
      quote: "chose the product team for the pilot rollout",
    },
    {
      summary:
        "The answer explains why the product team was selected for the experiment.",
      quote: "product team was selected for the experiment",
    },
    {
      summary:
        "The answer explains why the product team ended up selected for the experiment.",
      quote: "product team ended up selected for the experiment",
    },
    {
      summary:
        "The candidate's segment selection for the experiment was enterprise users.",
      quote:
        "candidate's segment selection for the experiment was enterprise users",
    },
    {
      summary:
        "The answer documents team selection for the experiment rollout.",
      quote: "team selection for the experiment rollout",
    },
    {
      summary:
        "The candidate reported that the product team was selected for the experiment.",
      quote:
        "candidate reported that the product team was selected for the experiment",
    },
    {
      summary:
        "The answer confirms the candidate selected an enterprise segment.",
      quote: "confirms the candidate selected an enterprise segment",
    },
    {
      summary:
        "The candidate did not appear in the selected experiment cohort.",
      quote: "candidate did not appear in the selected experiment cohort",
      adverse: true,
    },
  ];

  for (const fixture of cases) {
    const response = validResponse();
    if (fixture.adverse) response.scores.insight = 8;
    response.strengths[0].observation = `The answer explicitly states ${fixture.quote}.`;
    const sourceText = `I explained how the ${fixture.quote}.`;
    response.strengths[0].evidence[0].quote = sourceText;
    response.summary = fixture.summary;
    const parsed = parseFeedbackV2(response, {
      transcript: [{ ...transcript[0], text: sourceText }, transcript[1]],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    });

    assert.equal(parsed.summary, fixture.summary);
  }
});

test("rejects unsupported material and quantitative summary claims", () => {
  for (const summary of [
    "The answer established legal compliance and biometric privacy safeguards.",
    "The candidate conducted twelve interviews and proved statistically significant demand.",
    "The candidate conducted a dozen interviews and measured weekly retention.",
    "The segment measurement proves strong product-market fit and durable demand.",
    "The audience measurement demonstrates profitable growth and customer delight.",
  ]) {
    const response = validResponse();
    response.summary = summary;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /summary contains (?:a material|a quantitative) claim absent|summary requires at least two observable supports/,
      summary
    );
  }
});

test("rejects arbitrary short non-Latin evidence units", () => {
  const sourceTranscript = [
    {
      eventId: "writer-a:1",
      speaker: "user" as const,
      text: "Primero identificaría a los usuarios frecuentes porque necesito entender sus problemas antes de proponer soluciones. йц अब 漢字 ヌル жщ.",
    },
    transcript[1],
  ];

  for (const quote of ["йц", "अब", "漢字", "ヌル", "жщ"]) {
    const response = validResponse();
    response.strengths[0].evidence[0].quote = quote;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: sourceTranscript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /minimally substantive evidence/,
      quote
    );
  }
});

test("rejects arbitrary four-grapheme non-Latin evidence appended to a substantive answer", () => {
  const sourceTranscript = [
    {
      eventId: "writer-a:1",
      speaker: "user" as const,
      text: "Primero identificaría a los usuarios frecuentes porque necesito entender sus problemas antes de proponer soluciones. жщфц कखगघ 漢字仮名 ヌルホゲ.",
    },
    transcript[1],
  ];

  for (const quote of ["жщфц", "कखगघ", "漢字仮名", "ヌルホゲ"]) {
    const response = validResponse();
    response.strengths[0].evidence[0].quote = quote;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: sourceTranscript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /minimally substantive evidence/,
      quote
    );
  }
});

test("rejects repeated evidence across findings", () => {
  const repeatedEvidence = validResponse();
  repeatedEvidence.improvements[0].transcriptRefs = ["writer-a:1"];
  repeatedEvidence.improvements[0].evidence = [
    {
      turnRef: "writer-a:1",
      quote: "working parents and measure weekly completed plans",
    },
  ];
  assert.throws(
    () =>
      parseFeedbackV2(repeatedEvidence, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /repeated across findings/
  );
});

test("default-ignorable characters cannot create a distinct evidence identity", () => {
  const response = validResponse();
  response.strengths[0].transcriptRefs = ["writer-a:1"];
  response.strengths[0].evidence = [{ turnRef: "writer-a:1", quote: "risk" }];
  response.improvements[0].transcriptRefs = ["writer-a:1"];
  response.improvements[0].evidence = [
    { turnRef: "writer-a:1", quote: "risk\u200b" },
  ];

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            eventId: "writer-a:1",
            speaker: "user",
            text: "I would prioritize the risk\u200b before launch.",
          },
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /repeated across findings/
  );
});

test("nested punctuation variants cannot reuse one evidence span", () => {
  const response = validResponse();
  response.strengths[0].transcriptRefs = ["writer-a:1"];
  response.strengths[0].evidence = [
    { turnRef: "writer-a:1", quote: "working parents" },
  ];
  response.improvements[0].transcriptRefs = ["writer-a:1"];
  response.improvements[0].evidence = [
    { turnRef: "writer-a:1", quote: "working parents." },
  ];

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          {
            eventId: "writer-a:1",
            speaker: "user",
            text: "I would start with working parents.",
          },
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /overlaps evidence across findings/
  );
});

test("rejects reference and evidence sets that do not match", () => {
  const response = validResponse();
  response.strengths[0].transcriptRefs.push("writer-a:2");
  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /transcriptRefs and evidence references must match/
  );
});

test("rejects unknown keys at every object boundary", () => {
  const mutations: Array<(response: ReturnType<typeof validResponse>) => void> =
    [
      (response) => Object.assign(response, { overallScore: 8 }),
      (response) => Object.assign(response.scores, { persuasion: 8 }),
      (response) =>
        Object.assign(response.strengths[0], { text: "legacy field" }),
      (response) =>
        Object.assign(response.strengths[0].evidence[0], { speaker: "user" }),
    ];

  for (const mutate of mutations) {
    const response = validResponse();
    mutate(response);
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /contains unknown field/
    );
  }
});

test("rejects version, state, score, confidence, and transcript identity mismatches", () => {
  const mutations: Array<(response: ReturnType<typeof validResponse>) => void> =
    [
      (response) => {
        response.schemaVersion =
          "feedback.v1" as typeof FEEDBACK_SCHEMA_VERSION;
      },
      (response) => {
        response.evaluationState = "partial";
      },
      (response) => {
        response.scores.structure = 11;
      },
      (response) => {
        response.strengths[0].confidence = 1.1;
      },
      (response) => {
        response.strengths[0].transcriptRefs[0] = "missing";
        response.strengths[0].evidence[0].turnRef = "missing";
      },
    ];

  for (const mutate of mutations) {
    const response = validResponse();
    mutate(response);
    assert.throws(() =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      })
    );
  }
});

test("binds repeated quantities to one local metric and unit composite", () => {
  for (const { source, observation } of [
    {
      source:
        "I measured checkout duration at 40 seconds and activation at 40 percent.",
      observation: "The answer measured activation at 40 seconds.",
    },
    {
      source:
        "I measured checkout duration at forty seconds and activation at forty percent.",
      observation: "The answer measured activation at forty seconds.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source;

    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      source
    );
  }

  const grounded = validResponse();
  grounded.scores.insight = 8;
  grounded.strengths[0].observation =
    "The answer measured activation at 40 seconds.";
  grounded.strengths[0].evidence[0].quote = "measured activation at 40 seconds";
  assert.doesNotThrow(() =>
    parseFeedbackV2(grounded, {
      transcript: [
        {
          ...transcript[0],
          text: "I measured activation at 40 seconds before launch.",
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    })
  );
});

test("binds generic count predicates for digit and number-word quantities", () => {
  for (const { source, observation } of [
    {
      source:
        "I called 40 customers for product feedback before prioritizing the roadmap.",
      observation: "The answer emailed 40 customers for product feedback.",
    },
    {
      source:
        "I messaged forty customers for product feedback before prioritizing the roadmap.",
      observation: "The answer emailed forty customers for product feedback.",
    },
    {
      source:
        "I called a total of 40 customers for product feedback before prioritizing the roadmap.",
      observation:
        "The answer emailed a total of 40 customers for product feedback.",
    },
    {
      source:
        "I called at least forty customers for product feedback before prioritizing the roadmap.",
      observation:
        "The answer emailed at least forty customers for product feedback.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      source
    );
  }

  const measurementControl = validResponse();
  measurementControl.scores.insight = 8;
  measurementControl.strengths[0].observation =
    "The answer reported activation at 40 seconds.";
  measurementControl.strengths[0].evidence[0].quote =
    "measured activation at 40 seconds";
  assert.doesNotThrow(() =>
    parseFeedbackV2(measurementControl, {
      transcript: [
        {
          ...transcript[0],
          text: "I measured activation at 40 seconds before launch.",
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    })
  );
});

test("binds count assertion mode and bounded unit modifiers", () => {
  for (const source of [
    "I did not interview 40 customers for product feedback before prioritizing the roadmap.",
    "I never interviewed 40 customers for product feedback before prioritizing the roadmap.",
    "I failed to interview 40 customers for product feedback before prioritizing the roadmap.",
    "I would interview 40 customers for product feedback before prioritizing the roadmap.",
    "I will interview 40 customers for product feedback before prioritizing the roadmap.",
    "I will have interviewed 40 customers for product feedback before prioritizing the roadmap.",
    "I will not only interview 40 customers but also measure weekly retention.",
    "I am going to interview 40 customers for product feedback before prioritizing the roadmap.",
    "I expect to interview 40 customers for product feedback before prioritizing the roadmap.",
    "I intended to interview 40 customers for product feedback before prioritizing the roadmap.",
    "I intended researchers to interview 40 customers for product feedback before prioritizing the roadmap.",
    "I decided not to interview 40 customers for product feedback before prioritizing the roadmap.",
    "I did not manage to interview 40 customers for product feedback before prioritizing the roadmap.",
    "I can interview 40 customers for product feedback before prioritizing the roadmap.",
    "I must interview 40 customers for product feedback before prioritizing the roadmap.",
    "I am scheduled to interview 40 customers for product feedback before prioritizing the roadmap.",
    "I am supposed to interview 40 customers for product feedback before prioritizing the roadmap.",
    "I was unable to interview 40 customers for product feedback before prioritizing the roadmap.",
    "I did not get to interview 40 customers for product feedback before prioritizing the roadmap.",
    "I refused to interview 40 customers for product feedback before prioritizing the roadmap.",
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation =
      "The answer interviewed 40 customers for product feedback.";
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      source
    );
  }

  const negatedControl = validResponse();
  negatedControl.scores.insight = 8;
  negatedControl.strengths[0].observation =
    "The answer did not interview 40 customers for product feedback.";
  negatedControl.strengths[0].evidence[0].quote =
    "did not interview 40 customers for product feedback";
  assert.doesNotThrow(() =>
    parseFeedbackV2(negatedControl, {
      transcript: [
        {
          ...transcript[0],
          text: "I did not interview 40 customers for product feedback before launch.",
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    })
  );

  for (const { source, observation } of [
    {
      source:
        "I would interview 40 customers for product feedback before launch.",
      observation:
        "The answer would interview 40 customers for product feedback.",
    },
    {
      source:
        "I will interview 40 customers for product feedback before launch.",
      observation:
        "The answer will interview 40 customers for product feedback.",
    },
    {
      source:
        "I will have interviewed 40 customers for product feedback before launch.",
      observation:
        "The answer will have interviewed 40 customers for product feedback.",
    },
    {
      source:
        "I intended to interview 40 customers for product feedback before launch.",
      observation:
        "The answer intended to interview 40 customers for product feedback.",
    },
    {
      source:
        "I decided not to interview 40 customers for product feedback before launch.",
      observation:
        "The answer decided not to interview 40 customers for product feedback.",
    },
    {
      source:
        "I did not manage to interview 40 customers for product feedback before launch.",
      observation:
        "The answer did not manage to interview 40 customers for product feedback.",
    },
    {
      source:
        "I can interview 40 customers for product feedback before launch.",
      observation:
        "The answer can interview 40 customers for product feedback before launch.",
    },
    {
      source:
        "I was unable to interview 40 customers for product feedback before launch.",
      observation:
        "The answer was unable to interview 40 customers for product feedback before launch.",
    },
    {
      source:
        "I not only interviewed 40 customers but also measured weekly retention.",
      observation:
        "The answer not only interviewed 40 customers but also measured weekly retention.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source;
    assert.doesNotThrow(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      source
    );
  }

  for (const source of [
    "I interviewed 40 prospective customers for product feedback before prioritizing the roadmap.",
    "I interviewed 40 prospective enterprise customers for product feedback before prioritizing the roadmap.",
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation =
      "The answer interviewed 40 customers for product feedback.";
    response.strengths[0].evidence[0].quote = source;
    assert.doesNotThrow(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      source
    );
  }
});

test("binds assertion mode for open-vocabulary count actions", () => {
  for (const { source, observation } of [
    {
      source: "I will hit 40 customer targets before launch.",
      observation: "The answer hit 40 customer targets before launch.",
    },
    {
      source: "I would cut 40 support tickets before launch.",
      observation: "The answer cut 40 support tickets before launch.",
    },
    {
      source: "I plan to put 40 customers into the pilot.",
      observation: "The answer put 40 customers into the pilot.",
    },
    {
      source: "I hope to set 40 customer goals before launch.",
      observation: "The answer set 40 customer goals before launch.",
    },
    {
      source: "I will read 40 customer notes before prioritizing.",
      observation: "The answer read 40 customer notes before prioritizing.",
    },
    {
      source: "I will lead 40 customer sessions before launch.",
      observation: "The answer led 40 customer sessions before launch.",
    },
    {
      source: "I did not hit 40 customer targets before launch.",
      observation: "The answer hit 40 customer targets before launch.",
    },
    {
      source: "I failed to put 40 customers into the pilot.",
      observation: "The answer put 40 customers into the pilot.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      source
    );
  }

  for (const { source, observation } of [
    {
      source: "I hit 40 customer targets before launch.",
      observation: "The answer hit 40 customer targets before launch.",
    },
    {
      source: "I will hit 40 customer targets before launch.",
      observation: "The answer will hit 40 customer targets before launch.",
    },
    {
      source: "I led 40 customer sessions before launch.",
      observation: "The answer led 40 customer sessions before launch.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source;
    assert.doesNotThrow(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      source
    );
  }
});

test("binds irregular finite count actions instead of substituting an interviewed claim", () => {
  for (const source of [
    "I met 40 customers for product feedback before prioritizing the roadmap.",
    "I had 40 customers in the research cohort before prioritizing the roadmap.",
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation =
      "The answer interviewed 40 customers before prioritizing the roadmap.";
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      source
    );
  }

  for (const substitutedAction of ["met", "had"] as const) {
    const source =
      "I interviewed 40 customers before prioritizing the roadmap.";
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = `The answer ${substitutedAction} 40 customers before prioritizing the roadmap.`;
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /quantitative claim absent/,
      substitutedAction
    );
  }

  for (const action of ["met", "had"] as const) {
    const source = `I ${action} 40 customers in the research cohort before prioritizing the roadmap.`;
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = `The answer ${action} 40 customers in the research cohort.`;
    response.strengths[0].evidence[0].quote = source;
    assert.doesNotThrow(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      source
    );
  }
});

test("binds defined and undefined polarity to the local metric", () => {
  for (const contraction of [
    "did not",
    "does not",
    "didn't",
    "didn’t",
    "doesn't",
    "doesn’t",
  ] as const) {
    const source = `I ${contraction} define the retention metric before choosing the launch plan.`;
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation =
      "The answer defined the retention metric before choosing the launch plan.";
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      contraction
    );
  }

  for (const source of [
    "I never defined the retention metric before choosing the launch plan.",
    "I failed to define the retention metric before choosing the launch plan.",
    "I didn't clearly define the retention metric before choosing the launch plan.",
    "I will define the retention metric before choosing the launch plan.",
    "I will have defined the retention metric before choosing the launch plan.",
    "I am going to define the retention metric before choosing the launch plan.",
    "I expect to define the retention metric before choosing the launch plan.",
    "I intended to define the retention metric before choosing the launch plan.",
    "I intended the team to define the retention metric before choosing the launch plan.",
    "I decided not to define the retention metric before choosing the launch plan.",
    "I decided the team not to define the retention metric before choosing the launch plan.",
    "I did not manage to define the retention metric before choosing the launch plan.",
    "I can define the retention metric before choosing the launch plan.",
    "I must define the retention metric before choosing the launch plan.",
    "I am scheduled to define the retention metric before choosing the launch plan.",
    "I am supposed to define the retention metric before choosing the launch plan.",
    "I was unable to define the retention metric before choosing the launch plan.",
    "I did not get to define the retention metric before choosing the launch plan.",
    "I refused to define the retention metric before choosing the launch plan.",
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation =
      "The answer defined the retention metric before choosing the launch plan.";
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      source
    );
  }

  for (const { source, observation } of [
    {
      source: "I did not define the retention metric or decision threshold.",
      observation:
        "The answer did not define the retention metric or decision threshold.",
    },
    {
      source:
        "The retention metric is not undefined before choosing the launch plan.",
      observation:
        "The retention metric is defined before choosing the launch plan.",
    },
    {
      source: "I defined the retention metric before choosing the launch plan.",
      observation:
        "The answer defined the retention metric before choosing the launch plan.",
    },
    {
      source:
        "I will define the retention metric before choosing the launch plan.",
      observation:
        "The answer will define the retention metric before choosing the launch plan.",
    },
    {
      source:
        "I will have defined the retention metric before choosing the launch plan.",
      observation:
        "The answer will have defined the retention metric before choosing the launch plan.",
    },
    {
      source:
        "I am scheduled to define the retention metric before choosing the launch plan.",
      observation:
        "The answer is scheduled to define the retention metric before choosing the launch plan.",
    },
    {
      source:
        "I refused to define the retention metric before choosing the launch plan.",
      observation:
        "The answer refused to define the retention metric before choosing the launch plan.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source;
    assert.doesNotThrow(() =>
      parseFeedbackV2(response, {
        transcript: [{ ...transcript[0], text: source }, transcript[1]],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      })
    );
  }

  const localTarget = validResponse();
  localTarget.scores.insight = 8;
  localTarget.strengths[0].observation =
    "The answer defined the retention metric before launch.";
  localTarget.strengths[0].evidence[0].quote =
    "did not define retention but defined activation before launch";
  assert.throws(
    () =>
      parseFeedbackV2(localTarget, {
        transcript: [
          {
            ...transcript[0],
            text: "I did not define retention but defined activation before launch.",
          },
          transcript[1],
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /material claim absent/
  );
});

test("binds general directional assertion polarity without penalizing positive correlatives", () => {
  for (const source of [
    "I did not increase retention after the launch for working parents.",
    "I never increased retention after the launch for working parents.",
    "I failed to increase retention after the launch for working parents.",
    "I did not materially increase retention after the launch for working parents.",
    "I will increase retention after the launch for working parents.",
    "Retention will increase after the launch for working parents.",
    "Retention will have increased after the launch for working parents.",
    "Retention will not have increased after the launch for working parents.",
    "I am going to increase retention after the launch for working parents.",
    "I expect to increase retention after the launch for working parents.",
    "I expect retention to increase after the launch for working parents.",
    "The launch did not cause retention to increase for working parents.",
    "I intended to increase retention after the launch for working parents.",
    "I intended retention to increase after the launch for working parents.",
    "I decided not to increase retention after the launch for working parents.",
    "I decided the team not to increase retention after the launch for working parents.",
    "I did not manage to increase retention after the launch for working parents.",
    "I can increase retention after the launch for working parents.",
    "I must increase retention after the launch for working parents.",
    "I am scheduled to increase retention after the launch for working parents.",
    "I am supposed to increase retention after the launch for working parents.",
    "I was unable to increase retention after the launch for working parents.",
    "I did not get to increase retention after the launch for working parents.",
    "I refused to increase retention after the launch for working parents.",
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation =
      "The answer increased retention after the launch for working parents.";
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent|directional claim absent/,
      source
    );
  }

  for (const source of [
    "The retention metric is not undefined before choosing the launch plan.",
    "The answer not only prioritizes working parents but also measures weekly retention.",
  ]) {
    const response = validResponse();
    response.scores.structure = 9;
    response.scores.insight = 8;
    response.strengths[0].dimension = "structure";
    response.strengths[0].observation = source;
    response.strengths[0].evidence[0].quote = source;
    assert.doesNotThrow(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      source
    );
  }

  for (const source of [
    "The answer increased retention after the launch for working parents.",
    "The answer will increase retention after the launch for working parents.",
    "The answer will have increased retention after the launch for working parents.",
    "The answer expects to increase retention after the launch for working parents.",
    "The answer must increase retention after the launch for working parents.",
    "The answer is supposed to increase retention after the launch for working parents.",
    "The answer was unable to increase retention after the launch for working parents.",
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = source;
    response.strengths[0].evidence[0].quote = source;
    assert.doesNotThrow(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      source
    );
  }
});

test("does not turn adverse material noun phrases into positive double negations", () => {
  for (const { source, observation } of [
    {
      source: "The system isn't without security flaws in the launch design.",
      observation: "The system is secure despite the launch design flaws.",
    },
    {
      source: "The approach isn’t without privacy risks for customer records.",
      observation:
        "The approach protects privacy despite risks to customer records.",
    },
    {
      source: "The product isn't without compliance gaps in the launch plan.",
      observation: "The product is compliant despite gaps in the launch plan.",
    },
    {
      source:
        "The system isn't without serious security flaws in the launch design.",
      observation: "The system is secure despite the launch design flaws.",
    },
    {
      source:
        "The approach isn’t without material privacy risks for customer records.",
      observation:
        "The approach protects privacy despite risks to customer records.",
    },
    {
      source:
        "The product isn't without significant compliance gaps in the launch plan.",
      observation: "The product is compliant despite gaps in the launch plan.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      source
    );
  }

  const positiveControl = validResponse();
  positiveControl.scores.insight = 8;
  positiveControl.strengths[0].observation =
    "The system is secure and includes launch safeguards.";
  positiveControl.strengths[0].evidence[0].quote =
    "system isn't without security and includes launch safeguards";
  assert.doesNotThrow(() =>
    parseFeedbackV2(positiveControl, {
      transcript: [
        {
          ...transcript[0],
          text: "The system isn't without security and includes launch safeguards.",
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    })
  );
});

test("keeps negated privacy and security protection actions negative", () => {
  for (const { source, observation } of [
    {
      source: "The plan does not protect customer privacy during the launch.",
      observation: "The plan protects customer privacy during the launch.",
    },
    {
      source:
        "The plan didn't adequately safeguard customer privacy during the launch.",
      observation: "The plan safeguards customer privacy during the launch.",
    },
    {
      source: "The plan never protected customer privacy during the launch.",
      observation: "The plan protected customer privacy during the launch.",
    },
    {
      source: "The plan failed to protect customer privacy during the launch.",
      observation: "The plan protected customer privacy during the launch.",
    },
    {
      source: "The launch does not secure customer records against abuse.",
      observation: "The launch secures customer records against abuse.",
    },
    {
      source:
        "The launch never adequately secured customer records against abuse.",
      observation:
        "The launch adequately secured customer records against abuse.",
    },
    {
      source:
        "The launch failed to adequately secure customer records against abuse.",
      observation:
        "The launch adequately secured customer records against abuse.",
    },
    {
      source:
        "The launch did not adequately secure customer records against abuse.",
      observation:
        "The launch adequately secured customer records against abuse.",
    },
    {
      source: "The launch did not preserve customer privacy during migration.",
      observation: "The launch preserved customer privacy during migration.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      source
    );
  }

  for (const source of [
    "The launch adequately secured customer records against abuse.",
    "The launch preserved customer privacy during migration.",
    "The answer is not without a detailed security plan addressing risks before launch.",
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = source;
    response.strengths[0].evidence[0].quote = source;
    assert.doesNotThrow(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      source
    );
  }

  const positiveSecurityPlan = validResponse();
  positiveSecurityPlan.scores.insight = 8;
  positiveSecurityPlan.strengths[0].observation =
    "The answer presents a detailed security plan addressing risks before launch.";
  positiveSecurityPlan.strengths[0].evidence[0].quote =
    "The answer is not without a detailed security plan addressing risks before launch.";
  assert.doesNotThrow(() =>
    parseFeedbackV2(positiveSecurityPlan, {
      transcript: [
        {
          ...transcript[0],
          text: "The answer is not without a detailed security plan addressing risks before launch.",
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    })
  );
});

test("binds assertion mode for material security and privacy actions", () => {
  for (const { source, observation } of [
    {
      source: "The launch never encrypted customer records before migration.",
      observation: "The launch encrypted customer records before migration.",
    },
    {
      source: "The launch failed to encrypt customer records before migration.",
      observation: "The launch encrypted customer records before migration.",
    },
    {
      source: "The launch will encrypt customer records before migration.",
      observation: "The launch encrypted customer records before migration.",
    },
    {
      source: "The team plans to encrypt customer records before migration.",
      observation: "The team encrypted customer records before migration.",
    },
    {
      source: "The launch will secure customer records against abuse.",
      observation: "The launch secured customer records against abuse.",
    },
    {
      source: "The launch plans to secure customer records against abuse.",
      observation: "The launch secured customer records against abuse.",
    },
    {
      source: "The launch will preserve customer privacy during migration.",
      observation: "The launch preserved customer privacy during migration.",
    },
    {
      source: "The team plans to preserve customer privacy during migration.",
      observation: "The team preserved customer privacy during migration.",
    },
    {
      source: "The launch could comply with privacy law after remediation.",
      observation: "The launch complied with privacy law after remediation.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = observation;
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      source
    );
  }

  for (const source of [
    "The launch encrypted customer records before migration.",
    "The launch will encrypt customer records before migration.",
    "The launch never encrypted customer records before migration.",
    "The launch secured customer records against abuse.",
    "The launch preserved customer privacy during migration.",
    "The launch could comply with privacy law after remediation.",
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = source;
    response.strengths[0].evidence[0].quote = source;
    assert.doesNotThrow(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      source
    );
  }
});

test("binds material action assertion mode for descriptive and coordinated noun subjects", () => {
  const cases = [
    {
      hypothetical:
        "The security team will encrypt customer records before migration.",
      asserted:
        "The security team encrypted customer records before migration.",
    },
    {
      hypothetical:
        "The launch team plans to secure customer records against abuse.",
      asserted: "The launch team secured customer records against abuse.",
    },
    {
      hypothetical:
        "The platform team will preserve customer privacy during migration.",
      asserted:
        "The platform team preserved customer privacy during migration.",
    },
    {
      hypothetical: "Acme will encrypt customer records before migration.",
      asserted: "Acme encrypted customer records before migration.",
    },
    {
      hypothetical: "Engineers will encrypt customer records before migration.",
      asserted: "Engineers encrypted customer records before migration.",
    },
    {
      hypothetical:
        "Our cross functional security team will encrypt customer records before migration.",
      asserted:
        "Our cross functional security team encrypted customer records before migration.",
    },
    {
      hypothetical:
        "The customer data governance and platform security team will encrypt customer records before migration.",
      asserted:
        "The customer data governance and platform security team encrypted customer records before migration.",
    },
    {
      hypothetical:
        "Platform engineers and privacy specialists will preserve customer privacy during migration.",
      asserted:
        "Platform engineers and privacy specialists preserved customer privacy during migration.",
    },
    {
      hypothetical:
        "Acme cross functional security team will secure customer records against abuse.",
      asserted:
        "Acme cross functional security team secured customer records against abuse.",
    },
    {
      hypothetical:
        "Our customer data governance working group plans to secure customer records against abuse.",
      asserted:
        "Our customer data governance working group secured customer records against abuse.",
    },
    {
      hypothetical:
        "Platform security engineers can encrypt customer records before migration.",
      asserted:
        "Platform security engineers encrypted customer records before migration.",
    },
    {
      hypothetical:
        "The enterprise data security team must encrypt customer records before migration.",
      asserted:
        "The enterprise data security team encrypted customer records before migration.",
    },
    {
      hypothetical:
        "Acme security team considered encrypting customer records before migration.",
      asserted:
        "Acme security team encrypted customer records before migration.",
    },
    {
      hypothetical:
        "Acme security team avoided encrypting customer records before migration.",
      asserted:
        "Acme security team encrypted customer records before migration.",
    },
    {
      hypothetical:
        "The financial services customer identity data governance privacy compliance architecture organization will encrypt customer records before migration.",
      asserted:
        "The financial services customer identity data governance privacy compliance architecture organization encrypted customer records before migration.",
    },
    {
      hypothetical:
        "The cross functional customer data governance privacy security compliance architecture platform engineering team will preserve customer privacy during migration.",
      asserted:
        "The cross functional customer data governance privacy security compliance architecture platform engineering team preserved customer privacy during migration.",
    },
    {
      hypothetical:
        "The enterprise customer identity data governance privacy security compliance architecture platform engineering organization plans to secure customer records against abuse.",
      asserted:
        "The enterprise customer identity data governance privacy security compliance architecture platform engineering organization secured customer records against abuse.",
    },
    {
      hypothetical:
        "The cross functional global financial services customer identity data governance privacy security compliance architecture platform engineering organization will encrypt customer records before migration.",
      asserted:
        "The cross functional global financial services customer identity data governance privacy security compliance architecture platform engineering organization encrypted customer records before migration.",
    },
    {
      hypothetical:
        "Customer records will be encrypted by the security team before migration.",
      asserted:
        "Customer records were encrypted by the security team before migration.",
    },
    {
      hypothetical:
        "Customer records should be secured by the security team against abuse.",
      asserted:
        "Customer records were secured by the security team against abuse.",
    },
    {
      hypothetical:
        "Customer privacy might be preserved by the security team during migration.",
      asserted:
        "Customer privacy was preserved by the security team during migration.",
    },
    {
      hypothetical:
        "The privacy regulation must be complied with by the security team before launch.",
      asserted:
        "The privacy regulation was complied with by the security team before launch.",
    },
  ] as const;

  for (const { hypothetical, asserted } of cases) {
    const mismatch = validResponse();
    mismatch.scores.insight = 8;
    mismatch.strengths[0].observation = asserted;
    mismatch.strengths[0].evidence[0].quote = hypothetical;
    assert.throws(
      () =>
        parseFeedbackV2(mismatch, {
          transcript: [{ ...transcript[0], text: hypothetical }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      hypothetical
    );

    for (const source of [hypothetical, asserted]) {
      const matching = validResponse();
      matching.scores.insight = 8;
      matching.strengths[0].observation = source;
      matching.strengths[0].evidence[0].quote = source;
      assert.doesNotThrow(
        () =>
          parseFeedbackV2(matching, {
            transcript: [{ ...transcript[0], text: source }, transcript[1]],
            evaluationState: "full",
            modelVersion: "gpt-test-1",
          }),
        source
      );
    }
  }

  const boundedParaphrase = validResponse();
  boundedParaphrase.scores.insight = 8;
  boundedParaphrase.strengths[0].observation =
    "The team encrypted customer records before migration.";
  boundedParaphrase.strengths[0].evidence[0].quote =
    "The enterprise data security team encrypted customer records before migration.";
  assert.doesNotThrow(() =>
    parseFeedbackV2(boundedParaphrase, {
      transcript: [
        {
          ...transcript[0],
          text: "The enterprise data security team encrypted customer records before migration.",
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    })
  );

  const longBoundedParaphrase = validResponse();
  longBoundedParaphrase.scores.insight = 8;
  longBoundedParaphrase.strengths[0].observation =
    "The team encrypted customer records before migration.";
  longBoundedParaphrase.strengths[0].evidence[0].quote =
    "The cross functional customer data governance privacy security compliance architecture platform engineering team encrypted customer records before migration.";
  assert.doesNotThrow(() =>
    parseFeedbackV2(longBoundedParaphrase, {
      transcript: [
        {
          ...transcript[0],
          text: "The cross functional customer data governance privacy security compliance architecture platform engineering team encrypted customer records before migration.",
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    })
  );

  const longNarrative =
    "The answer discussed the enterprise customer identity data governance privacy security compliance architecture plan while mentioning encrypted customer records.";
  const longNarrativeMismatch = validResponse();
  longNarrativeMismatch.scores.insight = 8;
  longNarrativeMismatch.strengths[0].observation =
    "The organization encrypted customer records before migration.";
  longNarrativeMismatch.strengths[0].evidence[0].quote = longNarrative;
  assert.throws(
    () =>
      parseFeedbackV2(longNarrativeMismatch, {
        transcript: [{ ...transcript[0], text: longNarrative }, transcript[1]],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /material claim absent/
  );

  for (const source of [
    "I establish encrypted records as the source of truth and measure weekly retention.",
    "I select secure customer records for migration and measure weekly retention.",
    "The answer mentioned encrypted customer records while comparing migration options.",
    "Encrypting the archive helps secure customer records before migration.",
  ]) {
    const control = validResponse();
    control.scores.insight = 8;
    control.strengths[0].observation = source;
    control.strengths[0].evidence[0].quote = source;
    assert.doesNotThrow(
      () =>
        parseFeedbackV2(control, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      source
    );
  }
});

test("keeps common adverse security nouns negative in double negations", () => {
  for (const adverseNoun of [
    "concerns",
    "threats",
    "holes",
    "deficiencies",
    "exposures",
    "hazards",
  ]) {
    const source = `The system isn't without security ${adverseNoun} in the launch design.`;
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = `The system is secure despite the launch design ${adverseNoun}.`;
    response.strengths[0].evidence[0].quote = source;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /material claim absent/,
      adverseNoun
    );
  }

  const positiveControl = validResponse();
  positiveControl.scores.insight = 8;
  positiveControl.strengths[0].observation =
    "The answer presents a detailed security plan addressing risks before launch.";
  positiveControl.strengths[0].evidence[0].quote =
    "The answer is not without a detailed security plan addressing risks before launch.";
  assert.doesNotThrow(() =>
    parseFeedbackV2(positiveControl, {
      transcript: [
        {
          ...transcript[0],
          text: "The answer is not without a detailed security plan addressing risks before launch.",
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    })
  );
});

test("rejects got, picked, and ended-up-with candidate outcomes", () => {
  const source =
    "In my prior interview, the product manager job ended up with me after the panel picked finalists.";
  for (const summary of [
    "The candidate got the product manager job.",
    "The candidate was picked for the product manager role.",
    "The product manager job ended up with the candidate.",
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation =
      "The answer discusses a prior product manager job outcome.";
    response.strengths[0].evidence[0].quote =
      "product manager job ended up with me";
    response.summary = summary;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /hiring, readiness, pass\/fail, or hiring-bar claims/,
      summary
    );
  }

  const productSelection = validResponse();
  productSelection.scores.insight = 8;
  productSelection.strengths[0].observation =
    "The answer picked the working-parent product segment.";
  productSelection.strengths[0].evidence[0].quote =
    "picked the working-parent product segment and measured weekly plans";
  productSelection.summary =
    "The candidate picked the working-parent product segment.";
  assert.doesNotThrow(() =>
    parseFeedbackV2(productSelection, {
      transcript: [
        {
          ...transcript[0],
          text: "I picked the working-parent product segment and measured weekly plans.",
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    })
  );

  for (const { source, summary } of [
    {
      source:
        "In my prior interview, the candidate landed the product manager job after the panel review.",
      summary: "The candidate landed the product manager job.",
    },
    {
      source:
        "In my prior interview, the candidate landed a PM role after the panel review.",
      summary: "The candidate landed a PM role.",
    },
    {
      source:
        "In my prior interview, the candidate secured the product manager role after the panel review.",
      summary: "The candidate secured the product manager role.",
    },
    {
      source:
        "In my prior interview, the candidate accepted the PM offer after the panel review.",
      summary: "The candidate accepted the PM offer.",
    },
    {
      source:
        "In my prior interview, the candidate landed an offer after the panel review.",
      summary: "The candidate landed an offer.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = summary;
    response.strengths[0].evidence[0].quote = source;
    response.summary = summary;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /hiring, readiness, pass\/fail, or hiring-bar claims/,
      summary
    );
  }

  for (const { source, summary } of [
    {
      source:
        "The candidate secured the enterprise segment and measured weekly retention.",
      summary: "The candidate secured the enterprise segment.",
    },
    {
      source:
        "The candidate accepted the pricing offer structure for the experiment.",
      summary: "The candidate accepted the pricing offer structure.",
    },
    {
      source:
        "The candidate secured the cross-functional team for the product launch.",
      summary: "The candidate secured the cross-functional team.",
    },
    {
      source:
        "The candidate accepted the discounted pricing offer for the experiment.",
      summary: "The candidate accepted the discounted pricing offer.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = summary;
    response.strengths[0].evidence[0].quote = source;
    response.summary = summary;
    assert.doesNotThrow(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      summary
    );
  }
});

test("rejects common employment and advancement outcome paraphrases", () => {
  for (const summary of [
    "The candidate got hired.",
    "The candidate was offered the product manager role.",
    "The candidate won the product manager role.",
    "The candidate clinched the product manager role.",
    "The candidate took the PM offer.",
    "The candidate signed the PM offer.",
    "The candidate joined the company as product manager.",
    "The candidate starts next month as product manager.",
    "The candidate made it to the next round.",
    "The candidate has advanced to the next round.",
    "The candidate was advanced to the next round.",
    "The candidate is moving to the next interview stage.",
    "The candidate is through to the next round.",
    "The candidate became a product manager at Acme.",
    "The candidate is now a product manager at Acme.",
    "The candidate received the PM position.",
    "The candidate received an employment offer.",
    "The candidate will join the company as product manager.",
    "The candidate is joining the company as product manager.",
    "The candidate moved on to the final round.",
    "The candidate progressed to the next round.",
    "The candidate cleared the final interview.",
    "The candidate received the PM position at Acme.",
    "The candidate received an employment offer from Acme.",
    "The candidate joined Acme as PM.",
    "The candidate will start as PM at Acme.",
    "The candidate advanced to the final round at Acme.",
    "The candidate progressed to the final interview round at Acme.",
    "The candidate reached the final round at Acme.",
    "The candidate qualified for the final round at Acme.",
  ]) {
    const source = `In the prior interview debrief, ${summary
      .replace(/^The /u, "the ")
      .replace(
        /\.$/u,
        ""
      )} after the panel reviewed customer insight and product judgment.`;
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = summary;
    response.strengths[0].evidence[0].quote = source;
    response.summary = summary;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /hiring, readiness, pass\/fail, or hiring-bar claims/,
      summary
    );
  }

  for (const { source, summary } of [
    {
      source:
        "The candidate signed the discounted pricing offer after comparing annual plan tradeoffs.",
      summary: "The candidate signed the discounted pricing offer.",
    },
    {
      source:
        "The candidate took the pricing offer structure into the product experiment.",
      summary: "The candidate took the pricing offer structure.",
    },
    {
      source:
        "The candidate joined the cross-functional team for the product launch.",
      summary: "The candidate joined the cross-functional team.",
    },
    {
      source:
        "The candidate will join the cross-functional team for the product launch.",
      summary:
        "The candidate will join the cross-functional team for the product launch.",
    },
    {
      source:
        "The candidate received the PM position requirements from the recruiter.",
      summary:
        "The candidate received the PM position requirements from the recruiter.",
    },
    {
      source:
        "The candidate progressed the product rollout to the next milestone.",
      summary:
        "The candidate progressed the product rollout to the next milestone.",
    },
    {
      source:
        "The candidate cleared the final product review blocker before launch.",
      summary:
        "The candidate cleared the final product review blocker before launch.",
    },
    {
      source:
        "The candidate reached the final product milestone before launch.",
      summary:
        "The candidate reached the final product milestone before launch.",
    },
    {
      source:
        "The candidate qualified the final research cohort before recruitment.",
      summary:
        "The candidate qualified the final research cohort before recruitment.",
    },
    {
      source:
        "The candidate will start the product manager onboarding experiment at Acme.",
      summary:
        "The candidate will start the product manager onboarding experiment at Acme.",
    },
  ]) {
    const response = validResponse();
    response.scores.insight = 8;
    response.strengths[0].observation = summary;
    response.strengths[0].evidence[0].quote = source;
    response.summary = summary;
    assert.doesNotThrow(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      summary
    );
  }
});

test("does not let bounded devoid-of absence language unlock exceptional scores", () => {
  for (const absentTarget of [
    "a decision threshold",
    "decision thresholds",
    "analysis",
    "a framework",
    "metrics",
    "explanations",
  ]) {
    const source = `My plan is devoid of ${absentTarget} before launch prioritization.`;
    const response = validResponse();
    response.scores = {
      structure: 9,
      clarity: 8,
      insight: 8,
      communication: 8,
      leadership: 8,
    };
    response.strengths[0].dimension = "structure";
    response.strengths[0].observation = `The answer is devoid of ${absentTarget} before launch prioritization.`;
    response.strengths[0].evidence[0].quote = `devoid of ${absentTarget} before launch prioritization`;
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript: [{ ...transcript[0], text: source }, transcript[1]],
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /exceptional structure score requires a same-dimension grounded strength/,
      absentTarget
    );
  }

  const positiveControl = validResponse();
  positiveControl.scores = {
    structure: 9,
    clarity: 8,
    insight: 8,
    communication: 8,
    leadership: 8,
  };
  positiveControl.strengths[0].dimension = "structure";
  positiveControl.strengths[0].observation =
    "The answer is devoid of flaws and explains the customer problem.";
  positiveControl.strengths[0].evidence[0].quote =
    "devoid of flaws and explains the customer problem";
  assert.doesNotThrow(() =>
    parseFeedbackV2(positiveControl, {
      transcript: [
        {
          ...transcript[0],
          text: "The answer is devoid of flaws and explains the customer problem.",
        },
        transcript[1],
      ],
      evaluationState: "full",
      modelVersion: "gpt-test-1",
    })
  );
});
