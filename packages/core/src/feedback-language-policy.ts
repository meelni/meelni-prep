const EVIDENCE_STOP_WORDS = new Set([
  "a",
  "abc",
  "ага",
  "ah",
  "am",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "blah",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "er",
  "erm",
  "example",
  "foo",
  "for",
  "from",
  "has",
  "have",
  "hmm",
  "huh",
  "i",
  "in",
  "is",
  "it",
  "lol",
  "lorem",
  "may",
  "me",
  "mhm",
  "might",
  "mmm",
  "my",
  "no",
  "not",
  "of",
  "okay",
  "on",
  "or",
  "our",
  "placeholder",
  "right",
  "sample",
  "should",
  "sure",
  "thanks",
  "that",
  "the",
  "these",
  "this",
  "those",
  "to",
  "testing",
  "uh",
  "uhh",
  "um",
  "umm",
  "was",
  "we",
  "well",
  "were",
  "will",
  "with",
  "would",
  "xyz",
  "yeah",
  "yep",
  "yes",
  "you",
  "unknown",
  "да",
  "нет",
  "نعم",
  "はい",
  "好的",
  "嗯嗯",
]);

const EVIDENCE_DOMAIN_TERMS = new Set([
  "brand",
  "cohort",
  "cohorts",
  "compare",
  "completion",
  "conversion",
  "churn",
  "cost",
  "customer",
  "customers",
  "data",
  "decision",
  "decisions",
  "define",
  "defined",
  "discover",
  "discovery",
  "enterprise",
  "experiment",
  "experiments",
  "feature",
  "features",
  "focus",
  "frequency",
  "flow",
  "flows",
  "goal",
  "goals",
  "jobs",
  "launch",
  "market",
  "measure",
  "measured",
  "metric",
  "metrics",
  "need",
  "needs",
  "pain",
  "price",
  "parent",
  "parents",
  "problem",
  "problems",
  "prioritize",
  "priority",
  "優先順位",
  "product",
  "reach",
  "retained",
  "retention",
  "risk",
  "risks",
  "sales",
  "segment",
  "segments",
  "severity",
  "scope",
  "shipped",
  "speed",
  "task",
  "tasks",
  "team",
  "teams",
  "threshold",
  "thresholds",
  "trust",
  "usage",
  "user",
  "users",
  "value",
  "workflow",
  "workflows",
  "وازنت",
  "creator",
  "creators",
  "客户",
  "企業",
  "产品",
  "市场",
  "指标",
  "增长",
  "增长率",
  "数据",
  "用户",
  "风险",
]);

const EVIDENCE_DOMAIN_ACRONYMS = new Set([
  "AI",
  "API",
  "ARR",
  "B2B",
  "B2C",
  "CAC",
  "DAU",
  "GMV",
  "ICP",
  "KPI",
  "LTV",
  "MAU",
  "ML",
  "MRR",
  "MVP",
  "NPS",
  "OKR",
  "PM",
  "SQL",
  "TAM",
  "UI",
  "UX",
  "WAU",
]);

const EVIDENCE_REASONING_TERMS = new Set([
  "align",
  "aligned",
  "alignment",
  "analyze",
  "analyzed",
  "approach",
  "assess",
  "assessed",
  "build",
  "built",
  "choose",
  "chose",
  "collaborate",
  "collaborated",
  "coach",
  "coached",
  "compare",
  "compared",
  "consider",
  "considered",
  "create",
  "created",
  "decide",
  "decided",
  "define",
  "defined",
  "design",
  "designed",
  "discuss",
  "document",
  "documented",
  "evaluate",
  "evaluated",
  "explain",
  "explained",
  "identify",
  "identified",
  "improve",
  "improved",
  "interview",
  "interviewed",
  "learn",
  "learned",
  "narrow",
  "narrowed",
  "measure",
  "measured",
  "prioritize",
  "prioritized",
  "persuade",
  "persuaded",
  "research",
  "researched",
  "ship",
  "shipped",
  "start",
  "started",
  "synthesize",
  "synthesized",
  "synthesizing",
  "test",
  "tested",
  "tradeoff",
  "tradeoffs",
  "understand",
  "understood",
  "use",
  "used",
  "validate",
  "validated",
  "وازنت",
]);

const EVIDENCE_LOW_SIGNAL_TERMS = new Set([
  "asdfgh",
  "baz",
  "blargle",
  "echo",
  "foobar",
  "garbage",
  "plugh",
  "plonk",
  "qwerty",
  "quux",
  "random",
  "snorf",
  "trundle",
  "wibble",
  "wobble",
  "xyzzy",
  "zibble",
  "占位",
  "ああ",
  "哈哈",
  "呵呵",
  "呃呃",
  "测试",
  "مم",
  "дада",
  "ええ",
]);

const EVIDENCE_QUANTIFIED_UNITS = new Set([
  "account",
  "accounts",
  "bps",
  "customer",
  "customers",
  "day",
  "days",
  "dollar",
  "dollars",
  "eur",
  "gbp",
  "hour",
  "hours",
  "interview",
  "interviews",
  "minute",
  "minutes",
  "month",
  "months",
  "order",
  "orders",
  "people",
  "point",
  "points",
  "response",
  "responses",
  "second",
  "seconds",
  "session",
  "sessions",
  "team",
  "teams",
  "usd",
  "user",
  "users",
  "week",
  "weeks",
  "year",
  "years",
  "人",
  "天",
  "年",
  "月",
  "用户",
  "小时",
  "周",
]);

const SURFACE_WORD_SEGMENTER = new Intl.Segmenter(undefined, {
  granularity: "word",
});
const SURFACE_GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

interface SurfaceScaffoldFamily {
  markers: ReadonlySet<string>;
  relationshipMarkers: ReadonlySet<string>;
  predicateMarkers?: ReadonlySet<string>;
  complementDirection?: "after" | "before";
  grammarTokenPatterns?: readonly RegExp[];
  predicateLicenseMarkers?: ReadonlySet<string>;
  predicateRequiringLicense?: ReadonlySet<string>;
  predicateLicenseMayCrossPredicates?: boolean;
  multilingual: boolean;
}

const SURFACE_SCAFFOLD_FAMILIES: readonly SurfaceScaffoldFamily[] = [
  {
    markers: new Set([
      "a",
      "after",
      "an",
      "and",
      "because",
      "before",
      "can",
      "could",
      "first",
      "i",
      "if",
      "my",
      "next",
      "our",
      "should",
      "since",
      "so",
      "the",
      "then",
      "therefore",
      "until",
      "we",
      "when",
      "while",
      "will",
      "would",
    ]),
    relationshipMarkers: new Set([
      "after",
      "because",
      "before",
      "first",
      "if",
      "next",
      "since",
      "so",
      "then",
      "therefore",
      "until",
      "when",
      "while",
    ]),
    multilingual: false,
  },
  {
    markers: new Set([
      "a",
      "antes",
      "cuando",
      "de",
      "del",
      "después",
      "e",
      "el",
      "ella",
      "entonces",
      "esta",
      "este",
      "haría",
      "la",
      "las",
      "lo",
      "los",
      "luego",
      "mi",
      "nosotros",
      "nuestro",
      "para",
      "porque",
      "primero",
      "que",
      "si",
      "sus",
      "un",
      "una",
      "y",
      "yo",
    ]),
    relationshipMarkers: new Set([
      "antes",
      "cuando",
      "después",
      "entonces",
      "luego",
      "para",
      "porque",
      "primero",
      "si",
    ]),
    predicateMarkers: new Set([
      "alineé",
      "comparar",
      "compararía",
      "elegir",
      "entender",
      "entrevistaría",
      "identificar",
      "identificaría",
      "medir",
      "mediría",
      "necesito",
      "priorizar",
      "priorizaría",
      "probaría",
      "proponer",
    ]),
    predicateLicenseMarkers: new Set(["de", "haría", "para"]),
    predicateRequiringLicense: new Set([
      "comparar",
      "elegir",
      "entender",
      "identificar",
      "medir",
      "priorizar",
      "proponer",
    ]),
    multilingual: true,
  },
  {
    markers: new Set([
      "aber",
      "bevor",
      "danach",
      "dann",
      "das",
      "dem",
      "den",
      "der",
      "deshalb",
      "die",
      "ein",
      "eine",
      "einem",
      "einen",
      "einer",
      "eines",
      "ihre",
      "ich",
      "ist",
      "mein",
      "mit",
      "sie",
      "unser",
      "und",
      "weil",
      "wenn",
      "wir",
      "würde",
      "würden",
      "zuerst",
    ]),
    relationshipMarkers: new Set([
      "bevor",
      "danach",
      "dann",
      "deshalb",
      "weil",
      "wenn",
      "zuerst",
    ]),
    predicateMarkers: new Set([
      "definieren",
      "messen",
      "priorisieren",
      "testen",
      "vergleichen",
      "verstehen",
    ]),
    complementDirection: "before",
    predicateLicenseMarkers: new Set(["würde", "würden"]),
    predicateRequiringLicense: new Set([
      "definieren",
      "messen",
      "priorisieren",
      "testen",
      "vergleichen",
      "verstehen",
    ]),
    predicateLicenseMayCrossPredicates: true,
    multilingual: true,
  },
  {
    markers: new Set([
      "afin",
      "après",
      "avant",
      "ce",
      "cette",
      "de",
      "des",
      "donc",
      "du",
      "d’abord",
      "ensuite",
      "et",
      "je",
      "la",
      "le",
      "les",
      "leur",
      "leurs",
      "mon",
      "notre",
      "nous",
      "parce",
      "pour",
      "puis",
      "quand",
      "que",
      "sa",
      "ses",
      "si",
      "son",
      "un",
      "une",
    ]),
    relationshipMarkers: new Set([
      "afin",
      "après",
      "avant",
      "donc",
      "d’abord",
      "ensuite",
      "parce",
      "pour",
      "puis",
      "quand",
      "si",
    ]),
    predicateMarkers: new Set([
      "comparer",
      "comparerais",
      "comprendre",
      "définir",
      "définirais",
      "identifier",
      "mesurer",
      "prioriser",
      "proposer",
      "tester",
      "testerait",
    ]),
    predicateLicenseMarkers: new Set(["afin", "avant", "de", "pour"]),
    predicateRequiringLicense: new Set([
      "comparer",
      "comprendre",
      "définir",
      "identifier",
      "mesurer",
      "prioriser",
      "proposer",
      "tester",
    ]),
    multilingual: true,
  },
  {
    markers: new Set([
      "أنا",
      "إذا",
      "بعد",
      "بين",
      "ثم",
      "سوف",
      "على",
      "عندما",
      "قبل",
      "لأن",
      "لذلك",
      "مع",
      "نحن",
    ]),
    relationshipMarkers: new Set([
      "إذا",
      "بعد",
      "ثم",
      "عندما",
      "قبل",
      "لأن",
      "لذلك",
    ]),
    predicateMarkers: new Set([
      "أختبر",
      "أحدد",
      "أفهم",
      "أقارن",
      "أقيس",
      "أقيّم",
      "وأقيس",
      "نختبر",
      "نحدد",
      "نفهم",
      "نقارن",
      "نقيس",
      "ونقيس",
    ]),
    grammarTokenPatterns: [
      /^(?:ال|بال|فال|كال|لل|وال)\p{L}{2,}$/u,
      /^\p{L}{2,}(?:ه|ها|هم|هن|هما|نا|كم|كن)$/u,
    ],
    multilingual: true,
  },
];

const COMPACT_SCRIPT_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const COMPACT_REASONING_SCAFFOLDS =
  /(?:因为|所以|由于|然后|首先|接着|根据|之前|之后|最初に|その後|ため|ので|から|まず|次に|先|再|按)/gu;
const COMPACT_REASONING_PREDICATES =
  /(?:分析|比较|衡量|理解|了解|评估|识别|定义|验证|测试|选择|确定|排序|丢失|优先|询问|观察|梳理|发现|比較|測定|評価|識別|定義|検証|テスト|選択|優先|調査|説明|整理|観察|質問|聞き|決め)/gu;
const COMPACT_GRAMMAR_SIGNALS =
  /(?:我们|他们|她们|需要|可以|期间|容易|根据|その後|します|ました|我|会|的|并|把|让|和|再|按|を|に|の|が|は|で|して|ます)/gu;
const COMPACT_REASONING_BOUNDARY =
  /(?:因为|所以|由于|然后|首先|接着|根据|之前|之后|最初に|その後|ため|ので|から|まず|次に|先|再|按|[，,、;；])/u;
const SPACED_CONTENT_PREDICATES = new Set([
  "causes",
  "compare",
  "compares",
  "consume",
  "consumes",
  "create",
  "creates",
  "define",
  "defines",
  "face",
  "faces",
  "identify",
  "identifies",
  "interview",
  "interviews",
  "measure",
  "measures",
  "observe",
  "observes",
  "prioritize",
  "prioritizes",
  "speak",
  "speaks",
  "start",
  "starts",
  "understand",
  "understands",
]);
const SPACED_SUBJECT_MARKERS = new Set(["i", "we"]);
const SPACED_MODAL_MARKERS = new Set([
  "can",
  "could",
  "should",
  "will",
  "would",
]);
const SPACED_CONTENT_CONNECTORS = new Set([
  "across",
  "and",
  "because",
  "before",
  "by",
  "for",
  "from",
  "over",
  "to",
  "with",
]);
const ENGLISH_RELATIONSHIP_MARKERS = new Set([
  "after",
  "because",
  "before",
  "if",
  "since",
  "so",
  "that",
  "then",
  "therefore",
  "until",
  "when",
  "while",
  "which",
  "who",
]);
const ENGLISH_RELATIVE_MARKERS = new Set(["that", "which", "who"]);
const ENGLISH_FINITE_AUXILIARIES = new Set([
  "am",
  "are",
  "can",
  "could",
  "did",
  "does",
  "has",
  "have",
  "is",
  "may",
  "might",
  "must",
  "should",
  "was",
  "were",
  "will",
  "would",
]);
const ENGLISH_CLAUSE_ADVERBS = new Set([
  "also",
  "first",
  "manually",
  "often",
  "still",
  "then",
  "usually",
]);
const ENGLISH_BOUNDED_INTRANSITIVE_GERUNDS = new Set(["prioritizing"]);
const ENGLISH_BOUNDED_INTRANSITIVE_PREDICATES = new Set([
  "changed",
  "holds",
  "matters",
]);
const ENGLISH_OBJECT_GROUNDING_CONNECTORS = new Set([
  "across",
  "by",
  "over",
  "to",
  "with",
]);
const ENGLISH_FRONTED_CONTEXT_CONNECTORS = new Set(["across", "for", "with"]);
const ENGLISH_SURFACE_FUNCTION_WORDS = new Set([
  "a",
  "across",
  "after",
  "an",
  "and",
  "around",
  "as",
  "at",
  "because",
  "before",
  "by",
  "during",
  "each",
  "every",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "our",
  "over",
  "per",
  "that",
  "the",
  "their",
  "through",
  "to",
  "until",
  "we",
  "when",
  "while",
  "with",
]);
const ENGLISH_DETERMINERS = new Set([
  "a",
  "an",
  "her",
  "his",
  "its",
  "my",
  "our",
  "that",
  "the",
  "their",
  "these",
  "this",
  "those",
  "your",
]);
const ENGLISH_COORDINATING_CONJUNCTIONS = new Set([
  "and",
  "but",
  "nor",
  "or",
  "so",
  "yet",
]);
const ENGLISH_PREPOSITIONS = new Set([
  "about",
  "across",
  "after",
  "around",
  "at",
  "before",
  "between",
  "by",
  "during",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "over",
  "per",
  "through",
  "to",
  "under",
  "until",
  "upon",
  "with",
  "within",
  "without",
]);
const ENGLISH_EXPLICIT_PLURAL_SUBJECT_HEADS = new Set([
  "children",
  "data",
  "men",
  "people",
  "staff",
  "they",
  "we",
  "women",
  "you",
]);
const ENGLISH_BASE_AGREEMENT_SUBJECT_HEADS = new Set([
  ...ENGLISH_EXPLICIT_PLURAL_SUBJECT_HEADS,
  "i",
]);
const ENGLISH_BASE_AGREEMENT_SUBJECT_PRONOUNS = new Set(["they", "we", "you"]);
const ENGLISH_SYNTACTIC_SUBJECT_PRONOUNS = new Set([
  ...ENGLISH_BASE_AGREEMENT_SUBJECT_PRONOUNS,
  "he",
  "i",
  "it",
  "she",
]);
const ENGLISH_SINGULAR_AUXILIARIES = new Set(["does", "has", "is", "was"]);
const ENGLISH_BASE_AGREEMENT_AUXILIARIES = new Set([
  "are",
  "do",
  "have",
  "were",
]);
const ENGLISH_COMMON_IRREGULAR_PAST_PREDICATES = new Set([
  "became",
  "brought",
  "chose",
  "drove",
  "found",
  "gave",
  "kept",
  "ran",
  "said",
  "told",
  "took",
  "wrote",
]);
const ENGLISH_NUMBER_NEUTRAL_PREDICATES = new Set([
  "built",
  "bought",
  "could",
  "did",
  "felt",
  "got",
  "had",
  "laid",
  "led",
  "lost",
  "made",
  "may",
  "might",
  "must",
  "sent",
  "should",
  "spoke",
  "understood",
  "will",
  "would",
  ...ENGLISH_COMMON_IRREGULAR_PAST_PREDICATES,
]);
const ENGLISH_BASE_FORMS_ENDING_IN_S = new Set([
  "address",
  "assess",
  "discuss",
  "focus",
  "pass",
  "process",
]);
const ENGLISH_BASE_FORMS_ENDING_IN_NEUTRAL_SUFFIX = new Set([
  "bed",
  "begin",
  "bleed",
  "breed",
  "bring",
  "cling",
  "ding",
  "embed",
  "exceed",
  "feed",
  "fling",
  "heed",
  "need",
  "ping",
  "proceed",
  "ring",
  "seed",
  "shed",
  "sing",
  "speed",
  "spring",
  "sting",
  "string",
  "succeed",
  "swing",
  "wed",
  "wing",
  "wring",
]);
const ENGLISH_POSTNOMINAL_ADJECTIVES = new Set([
  "better",
  "broken",
  "clearer",
  "confusing",
  "cross",
  "faster",
  "higher",
  "lower",
  "next",
  "simpler",
  "slower",
  "unfinished",
  "uncertain",
  "worse",
]);
const ENGLISH_ADJECTIVE_SUFFIX_NOUN_EXCEPTIONS = new Set([
  "category",
  "goal",
  "inventory",
  "segment",
]);
const ENGLISH_POSTNOMINAL_ADJECTIVE_SUFFIX =
  /(?:able|al|ant|ary|ent|ful|ible|ic|ive|less|ly|ory|ous)$/u;
const ENGLISH_CONTENT_PREDICATE =
  /^(?:align(?:ed|ing)?|analy[sz](?:e|ed|ing)|ask(?:ed|ing|s)?|assess(?:ed|ing|es)?|build(?:ing|s)?|built|caus(?:e|ed|es|ing)|cho(?:ose|oses|osing|se)|commit(?:s|ted|ting)?|compar(?:e|ed|es|ing)|consider(?:ed|ing|s)?|consum(?:e|ed|es|ing)|creat(?:e|ed|es|ing)|defin(?:e|ed|es|ing)|delay(?:ed|ing|s)?|design(?:ed|ing|s)?|destroy(?:ed|ing|s)?|discover(?:ed|ing|s)?|disrupt(?:ed|ing|s)?|evaluat(?:e|ed|es|ing)|fac(?:e|ed|es|ing)|find|finds|finding|focus(?:ed|es|ing)?|get|gets|got|happen(?:ed|ing|s)?|identif(?:y|ied|ies|ying)|investigat(?:e|ed|es|ing)|interview(?:ed|ing|s)?|learn(?:ed|ing|s|t)?|los(?:e|es|ing)|lost|measur(?:e|ed|es|ing)|mov(?:e|ed|es|ing)|notif(?:y|ied|ies|ying)|observ(?:e|ed|es|ing)|prevent(?:ed|ing|s)?|prioriti[sz](?:e|ed|es|ing)|prov(?:e|ed|es|ing)|rank(?:ed|ing|s)?|receiv(?:e|ed|es|ing)|reconcil(?:e|ed|es|ing)|research(?:ed|ing|es)?|sequenc(?:e|ed|es|ing)|ship(?:ped|ping|s)?|speak(?:ing|s)?|spoke|start(?:ed|ing|s)?|take|takes|taking|talk(?:ed|ing|s)?|test(?:ed|ing|s)?|uncover(?:ed|ing|s)?|understand(?:ing|s)?|understood|us(?:e|ed|es|ing)|validat(?:e|ed|es|ing)|wait(?:ed|ing|s)?|wast(?:e|ed|es|ing))$/u;
const ENGLISH_DECLARATIVE_PREDICATE =
  /^(?:abandon(?:ed|ing|s)?|approv(?:e|ed|es|ing)|belong(?:ed|ing|s)?|block(?:ed|ing|s)?|bought|buy|buying|buys|confus(?:e|ed|es|ing)|consist(?:ed|ing|s)?|contain(?:ed|ing|s)?|depend(?:ed|ing|s)?|discourag(?:e|ed|es|ing)|disagree(?:d|ing|s)?|drive|drives|driven|driving|enable(?:d|s)?|extend(?:ed|ing|s)?|feel|feels|felt|frustrat(?:e|ed|es|ing)|generate(?:d|s)?|handl(?:e|ed|es|ing)|have|has|had|help(?:ed|ing|s)?|improv(?:e|ed|es|ing)|includ(?:e|ed|es|ing)|increas(?:e|ed|es|ing)|juggl(?:e|ed|es|ing)|lead|leads|led|leading|leave|leaves|left|leaving|lie|lies|lay|lain|lying|make|makes|made|making|need(?:ed|ing|s)?|prefer(?:red|ring|s)?|preserv(?:e|ed|es|ing)|reduc(?:e|ed|es|ing)|remain(?:ed|ing|s)?|requir(?:e|ed|es|ing)|result(?:ed|ing|s)?|review(?:ed|ing|s)?|send|sends|sending|sent|show(?:ed|ing|s|n)?|solv(?:e|ed|es|ing)|stem(?:med|ming|s)?|struggl(?:e|ed|es|ing)|support(?:ed|ing|s)?|surpris(?:e|ed|es|ing)|upload(?:ed|ing|s)?|visit(?:ed|ing|s)?|want(?:ed|ing|s)?|work(?:ed|ing|s)?)$/u;
const ENGLISH_DECLARATIVE_RELATIONSHIP_PREDICATE =
  /^(?:abandon(?:ed|ing|s)?|approv(?:e|ed|es|ing)|block(?:ed|ing|s)?|bought|buy|buying|buys|confus(?:e|ed|es|ing)|depend(?:ed|ing|s)?|discourag(?:e|ed|es|ing)|drive|drives|driven|driving|enable(?:d|s)?|extend(?:ed|ing|s)?|frustrat(?:e|ed|es|ing)|handl(?:e|ed|es|ing)|help(?:ed|ing|s)?|improv(?:e|ed|es|ing)|increas(?:e|ed|es|ing)|juggl(?:e|ed|es|ing)|lead|leads|led|leading|leave|leaves|left|leaving|lie|lies|lay|lain|lying|make|makes|made|making|need(?:ed|ing|s)?|prefer(?:red|ring|s)?|preserv(?:e|ed|es|ing)|reduc(?:e|ed|es|ing)|requir(?:e|ed|es|ing)|result(?:ed|ing|s)?|review(?:ed|ing|s)?|send|sends|sending|sent|solv(?:e|ed|es|ing)|stem(?:med|ming|s)?|struggl(?:e|ed|es|ing)|surpris(?:e|ed|es|ing)|upload(?:ed|ing|s)?|visit(?:ed|ing|s)?|want(?:ed|ing|s)?|work(?:ed|ing|s)?)$/u;
const ENGLISH_BEHAVIORAL_PREPOSITIONAL_PREDICATE =
  /^(?:collaborat(?:e|ed|es|ing)|communicat(?:e|ed|es|ing)|listen(?:ed|ing|s)?|negotiat(?:e|ed|es|ing)|partner(?:ed|ing|s)?|respond(?:ed|ing|s)?)$/u;
const ENGLISH_ADDITIONAL_CONTENT_PREDICATES = new Set([
  "complete",
  "completed",
  "completes",
  "completing",
  "own",
  "owned",
  "owning",
  "owns",
]);

interface SurfaceCoherenceAnalysis {
  normalized: string;
  words: string[];
  alphabeticGraphemes: string[];
  knownLowSignalCount: number;
  hasRepeatedDominance: boolean;
  hasCompactScript: boolean;
}

function analyzeSurfaceCoherence(text: string): SurfaceCoherenceAnalysis {
  const normalized = text
    .normalize("NFKC")
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .toLocaleLowerCase("en-US");
  const words = [...SURFACE_WORD_SEGMENTER.segment(normalized)]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment);
  const alphabeticGraphemes = [
    ...SURFACE_GRAPHEME_SEGMENTER.segment(normalized),
  ]
    .map((segment) => segment.segment)
    .filter((grapheme) => /\p{L}/u.test(grapheme));
  const normalizedWords = words.map((word) => word.toLocaleLowerCase("en-US"));
  const knownLowSignalCount = normalizedWords.filter((word) =>
    EVIDENCE_LOW_SIGNAL_TERMS.has(word)
  ).length;
  const wordCounts = new Map<string, number>();
  for (const word of normalizedWords) {
    wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
  }
  const graphemeCounts = new Map<string, number>();
  for (const grapheme of alphabeticGraphemes) {
    graphemeCounts.set(grapheme, (graphemeCounts.get(grapheme) ?? 0) + 1);
  }
  const largestWordCount = Math.max(0, ...wordCounts.values());
  const largestGraphemeCount = Math.max(0, ...graphemeCounts.values());
  const hasRepeatedDominance =
    (normalizedWords.length >= 6 &&
      largestWordCount / normalizedWords.length > 0.45) ||
    (alphabeticGraphemes.length >= 8 &&
      largestGraphemeCount / alphabeticGraphemes.length > 0.45);

  return {
    normalized,
    words: normalizedWords,
    alphabeticGraphemes,
    knownLowSignalCount,
    hasRepeatedDominance,
    hasCompactScript: COMPACT_SCRIPT_PATTERN.test(normalized),
  };
}

function hasPlausibleSurfaceDiversity(
  analysis: SurfaceCoherenceAnalysis
): boolean {
  if (analysis.hasRepeatedDominance || analysis.knownLowSignalCount >= 2) {
    return false;
  }
  const uniqueWords = new Set(analysis.words).size;
  return (
    analysis.words.length >= 8 &&
    uniqueWords >= 6 &&
    uniqueWords / analysis.words.length >= 0.5 &&
    analysis.alphabeticGraphemes.length >= 28
  );
}

function getBestSurfaceScaffold(analysis: SurfaceCoherenceAnalysis): {
  markerCount: number;
  hasRelationship: boolean;
  hasPredicate: boolean;
  multilingual: boolean;
  family: SurfaceScaffoldFamily | null;
} {
  let best = {
    markerCount: 0,
    hasRelationship: false,
    hasPredicate: false,
    multilingual: false,
    family: null as SurfaceScaffoldFamily | null,
  };
  for (const family of SURFACE_SCAFFOLD_FAMILIES) {
    const matchedMarkers = new Set(
      analysis.words.filter((word) => family.markers.has(word))
    );
    const match = {
      markerCount: matchedMarkers.size,
      hasRelationship: [...matchedMarkers].some((word) =>
        family.relationshipMarkers.has(word)
      ),
      hasPredicate: analysis.words.some((word) =>
        family.predicateMarkers?.has(word)
      ),
      multilingual: family.multilingual,
      family,
    };
    if (
      match.markerCount > best.markerCount ||
      (match.markerCount === best.markerCount &&
        match.hasRelationship &&
        !best.hasRelationship) ||
      (match.markerCount === best.markerCount &&
        match.hasRelationship === best.hasRelationship &&
        match.hasPredicate &&
        !best.hasPredicate)
    ) {
      best = match;
    }
  }
  return best;
}

const MIN_MULTILINGUAL_RECOGNIZED_COVERAGE = 0.4;

function hasMultiscriptNarrativeEvidence(
  analysis: SurfaceCoherenceAnalysis
): boolean {
  const scriptFamilies = [
    /\p{Script=Latin}/u,
    /\p{Script=Arabic}/u,
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  ].filter((pattern) => pattern.test(analysis.normalized)).length;
  const sentenceCount = analysis.normalized
    .split(/[.!?。！？]+/u)
    .filter((sentence) => sentence.trim()).length;
  return (
    scriptFamilies >= 3 &&
    sentenceCount >= 3 &&
    countRecognizedCandidateEvidenceSignals(analysis.normalized) >= 2
  );
}

function hasMultilingualPredicateComplement(
  words: readonly string[],
  predicateIndex: number,
  family: SurfaceScaffoldFamily
): boolean {
  const predicates = family.predicateMarkers ?? new Set<string>();
  const direction = family.complementDirection === "before" ? -1 : 1;
  const terminalIndex = predicateIndex + direction * 5;
  for (
    let index = predicateIndex + direction;
    direction > 0
      ? index < words.length && index < terminalIndex
      : index >= 0 && index > terminalIndex;
    index += direction
  ) {
    const word = words[index];
    if (predicates.has(word) || family.relationshipMarkers.has(word)) break;
    if (!family.markers.has(word) && /\p{L}{2,}/u.test(word)) return true;
  }
  return false;
}

function isMultilingualGrammarToken(
  word: string,
  family: SurfaceScaffoldFamily
): boolean {
  return (
    (family.markers.has(word) && !family.relationshipMarkers.has(word)) ||
    Boolean(family.grammarTokenPatterns?.some((pattern) => pattern.test(word)))
  );
}

function hasMultilingualPredicateGrammarCoverage(
  words: readonly string[],
  predicateIndex: number,
  family: SurfaceScaffoldFamily
): boolean {
  const predicates = family.predicateMarkers ?? new Set<string>();
  let grammarTokenCount = 0;
  let lexicalTokenCount = 0;

  for (const direction of [-1, 1] as const) {
    const terminalIndex = predicateIndex + direction * 5;
    for (
      let index = predicateIndex + direction;
      direction > 0
        ? index < words.length && index < terminalIndex
        : index >= 0 && index > terminalIndex;
      index += direction
    ) {
      const word = words[index];
      if (predicates.has(word) || family.relationshipMarkers.has(word)) break;
      if (isMultilingualGrammarToken(word, family)) {
        grammarTokenCount += 1;
      } else if (/\p{L}{2,}/u.test(word)) {
        lexicalTokenCount += 1;
      }
    }
  }

  return (
    grammarTokenCount >= 1 &&
    grammarTokenCount / (grammarTokenCount + lexicalTokenCount) >= 0.25
  );
}

function hasMultilingualPredicateLicense(
  words: readonly string[],
  predicateIndex: number,
  family: SurfaceScaffoldFamily
): { licensed: boolean; hasExplicitLicense: boolean } {
  const predicate = words[predicateIndex];
  const requiringLicense = family.predicateRequiringLicense ?? new Set();
  if (!requiringLicense.has(predicate)) {
    return { licensed: true, hasExplicitLicense: false };
  }

  const predicates = family.predicateMarkers ?? new Set<string>();
  const licenses = family.predicateLicenseMarkers ?? new Set<string>();
  const lowerBound = Math.max(0, predicateIndex - 9);
  for (let index = predicateIndex - 1; index >= lowerBound; index -= 1) {
    const word = words[index];
    if (licenses.has(word)) {
      return { licensed: true, hasExplicitLicense: true };
    }
    if (family.relationshipMarkers.has(word)) break;
    if (predicates.has(word)) {
      if (!requiringLicense.has(word)) {
        return { licensed: true, hasExplicitLicense: true };
      }
      if (!family.predicateLicenseMayCrossPredicates) break;
    }
  }
  return { licensed: false, hasExplicitLicense: false };
}

function hasMultilingualStructuralCoherence(
  analysis: SurfaceCoherenceAnalysis,
  family: SurfaceScaffoldFamily
): boolean {
  const predicates = family.predicateMarkers ?? new Set<string>();
  const predicateIndexes = analysis.words.flatMap((word, index) =>
    predicates.has(word) ? [index] : []
  );
  const relationshipIndexes = analysis.words.flatMap((word, index) =>
    family.relationshipMarkers.has(word) ? [index] : []
  );
  const recognizedTokenCount = analysis.words.filter(
    (word) => family.markers.has(word) || predicates.has(word)
  ).length;
  const hasOrderedClauseBoundary = relationshipIndexes.some(
    (relationshipIndex) =>
      predicateIndexes.some((index) => index < relationshipIndex) &&
      predicateIndexes.some((index) => index > relationshipIndex)
  );
  const structurallyGroundedPredicates = predicateIndexes.filter((index) => {
    const license = hasMultilingualPredicateLicense(
      analysis.words,
      index,
      family
    );
    return (
      license.licensed &&
      hasMultilingualPredicateComplement(analysis.words, index, family) &&
      (license.hasExplicitLicense ||
        hasMultilingualPredicateGrammarCoverage(analysis.words, index, family))
    );
  }).length;

  return (
    predicateIndexes.length >= 2 &&
    structurallyGroundedPredicates >= 2 &&
    hasOrderedClauseBoundary &&
    recognizedTokenCount / analysis.words.length >=
      MIN_MULTILINGUAL_RECOGNIZED_COVERAGE
  );
}

function hasCompactSurfaceCoherence(
  analysis: SurfaceCoherenceAnalysis
): boolean {
  if (!analysis.hasCompactScript || analysis.hasRepeatedDominance) return false;
  const uniqueGraphemes = new Set(analysis.alphabeticGraphemes).size;
  const predicateCount = new Set(
    analysis.normalized.match(COMPACT_REASONING_PREDICATES) ?? []
  ).size;
  const scaffoldCount = new Set(
    analysis.normalized.match(COMPACT_REASONING_SCAFFOLDS) ?? []
  ).size;
  const grammarSignalCount = new Set(
    analysis.normalized.match(COMPACT_GRAMMAR_SIGNALS) ?? []
  ).size;
  const predicateBearingSegmentCount = analysis.normalized
    .split(COMPACT_REASONING_BOUNDARY)
    .filter(
      (segment) =>
        segment.length > 0 &&
        (segment.match(COMPACT_REASONING_PREDICATES) ?? []).length > 0
    ).length;
  const compactChunks = analysis.normalized
    .split(/\s+/u)
    .filter((chunk) => COMPACT_SCRIPT_PATTERN.test(chunk));
  const recognizedCompactChunks = compactChunks.filter(
    (chunk) =>
      (chunk.match(COMPACT_REASONING_SCAFFOLDS) ?? []).length > 0 ||
      (chunk.match(COMPACT_REASONING_PREDICATES) ?? []).length > 0 ||
      (chunk.match(COMPACT_GRAMMAR_SIGNALS) ?? []).length > 0
  ).length;
  const hasSuspiciousCompactSpacing =
    compactChunks.length >= 6 &&
    recognizedCompactChunks / compactChunks.length < 0.5;
  return (
    analysis.alphabeticGraphemes.length >= 12 &&
    uniqueGraphemes >= 8 &&
    uniqueGraphemes / analysis.alphabeticGraphemes.length >= 0.45 &&
    analysis.knownLowSignalCount === 0 &&
    !hasSuspiciousCompactSpacing &&
    predicateCount >= 2 &&
    predicateBearingSegmentCount >= 2 &&
    (scaffoldCount >= 2 ||
      (scaffoldCount >= 1 && /[，,、;；]/u.test(analysis.normalized))) &&
    grammarSignalCount >= 2
  );
}

function isEnglishContentPredicate(word: string): boolean {
  return (
    SPACED_CONTENT_PREDICATES.has(word) ||
    EVIDENCE_REASONING_TERMS.has(word) ||
    ENGLISH_ADDITIONAL_CONTENT_PREDICATES.has(word) ||
    ENGLISH_CONTENT_PREDICATE.test(word)
  );
}

function isPotentialEnglishContentWord(word: string): boolean {
  return (
    /^[a-z]+$/u.test(word) &&
    !EVIDENCE_STOP_WORDS.has(word) &&
    !EVIDENCE_LOW_SIGNAL_TERMS.has(word) &&
    !ENGLISH_CLAUSE_ADVERBS.has(word) &&
    !SPACED_CONTENT_CONNECTORS.has(word) &&
    !ENGLISH_RELATIONSHIP_MARKERS.has(word)
  );
}

function isLikelyEnglishFinitePredicate(word: string): boolean {
  return (
    ENGLISH_FINITE_AUXILIARIES.has(word) ||
    isEnglishContentPredicate(word) ||
    /^[a-z]{4,}(?:ed|ing|s)$/u.test(word)
  );
}

function isEnglishDeclarativePredicate(word: string): boolean {
  return (
    ENGLISH_FINITE_AUXILIARIES.has(word) ||
    ENGLISH_COMMON_IRREGULAR_PAST_PREDICATES.has(word) ||
    ENGLISH_BEHAVIORAL_PREPOSITIONAL_PREDICATE.test(word) ||
    isEnglishContentPredicate(word) ||
    ENGLISH_DECLARATIVE_PREDICATE.test(word)
  );
}

function isEnglishDeclarativeRelationshipPredicate(word: string): boolean {
  return (
    ENGLISH_COMMON_IRREGULAR_PAST_PREDICATES.has(word) ||
    ENGLISH_BEHAVIORAL_PREPOSITIONAL_PREDICATE.test(word) ||
    isEnglishContentPredicate(word) ||
    ENGLISH_DECLARATIVE_RELATIONSHIP_PREDICATE.test(word)
  );
}

function hasPlausibleEnglishDeclarativePredicateUse(
  words: readonly string[],
  predicateIndex: number
): boolean {
  const predicate = words[predicateIndex];
  if (
    predicate.endsWith("ing") &&
    !ENGLISH_BASE_FORMS_ENDING_IN_NEUTRAL_SUFFIX.has(predicate)
  ) {
    return false;
  }
  const following = words[predicateIndex + 1];
  const subjectWords = words.slice(0, predicateIndex);
  const hasLexicalSubject = subjectWords.some(isPotentialEnglishContentWord);
  const hasPronounSubject = subjectWords.some((word) =>
    ENGLISH_SYNTACTIC_SUBJECT_PRONOUNS.has(word)
  );
  if ((!hasLexicalSubject && !hasPronounSubject) || following === undefined) {
    return false;
  }

  if (/^belong(?:ed|ing|s)?$/u.test(predicate)) {
    return following === "to" || following === "with";
  }
  if (/^consist(?:ed|ing|s)?$/u.test(predicate)) {
    return following === "of" || following === "in";
  }
  if (/^depend(?:ed|ing|s)?$/u.test(predicate)) {
    return following === "on" || following === "upon";
  }
  if (/^(?:lie|lies|lay|lain|lying)$/u.test(predicate)) {
    return ["at", "between", "in", "within", "with"].includes(following);
  }
  if (/^result(?:ed|ing|s)?$/u.test(predicate)) {
    return following === "from" || following === "in";
  }
  if (/^stem(?:med|ming|s)?$/u.test(predicate)) {
    return following === "from";
  }
  if (/^struggl(?:e|ed|es|ing)$/u.test(predicate)) {
    return ["against", "for", "to", "with"].includes(following);
  }

  return words.slice(predicateIndex + 1).some(isPotentialEnglishContentWord);
}

function findEnglishPredicateIndex(
  words: readonly string[],
  start: number,
  end: number
): number {
  for (let index = start; index < end; index += 1) {
    if (isLikelyEnglishFinitePredicate(words[index])) return index;
  }
  return -1;
}

function hasEnglishMainClause(words: readonly string[]): boolean {
  const explicitSubjectIndex = words.findIndex((word) =>
    SPACED_SUBJECT_MARKERS.has(word)
  );
  const absoluteModalIndex = words.findIndex((word) =>
    SPACED_MODAL_MARKERS.has(word)
  );
  const inferredModalSubjectIndex =
    absoluteModalIndex > 0
      ? words
          .slice(Math.max(0, absoluteModalIndex - 4), absoluteModalIndex)
          .findLastIndex(isPotentialEnglishContentWord)
      : -1;
  const inferredModalSubjectOffset = Math.max(0, absoluteModalIndex - 4);
  const declarativePredicateIndex = getEnglishSentencePredicateIndex(words);
  if (
    explicitSubjectIndex < 0 &&
    absoluteModalIndex < 0 &&
    declarativePredicateIndex > 0 &&
    hasCompleteEnglishPredicateComplement(words, declarativePredicateIndex)
  ) {
    return true;
  }
  const subjectIndex =
    explicitSubjectIndex >= 0
      ? explicitSubjectIndex
      : inferredModalSubjectIndex >= 0
        ? inferredModalSubjectOffset + inferredModalSubjectIndex
        : words.findIndex(
            (word, index) => index <= 1 && isPotentialEnglishContentWord(word)
          );
  if (subjectIndex < 0) return false;

  const modalOffset = words
    .slice(subjectIndex + 1, subjectIndex + 4)
    .findIndex((word) => SPACED_MODAL_MARKERS.has(word));
  if (modalOffset >= 0) {
    const clauseModalIndex = subjectIndex + 1 + modalOffset;
    return words
      .slice(clauseModalIndex + 1, clauseModalIndex + 4)
      .some(isPotentialEnglishContentWord);
  }

  const predicateIndex = findEnglishPredicateIndex(
    words,
    subjectIndex + 1,
    Math.min(words.length, subjectIndex + 5)
  );
  if (predicateIndex < 0) return false;
  const predicate = words[predicateIndex];
  if (
    !SPACED_SUBJECT_MARKERS.has(words[subjectIndex]) &&
    !ENGLISH_FINITE_AUXILIARIES.has(predicate) &&
    !/(?:ed|ing|s)$/u.test(predicate) &&
    !words[subjectIndex].endsWith("s") &&
    words[subjectIndex] !== "data" &&
    words[subjectIndex] !== "people"
  ) {
    return false;
  }
  return true;
}

function splitEnglishCoordinatedClauses(
  words: readonly string[]
): readonly string[][] {
  const clauses: string[][] = [[]];
  for (const word of words) {
    if (word === "and" || word === "but") {
      clauses.push([]);
    } else {
      clauses[clauses.length - 1].push(word);
    }
  }
  return clauses.filter((clause) => clause.length > 0);
}

function isBoundedCoordinatedNominalComplement(
  words: readonly string[]
): boolean {
  return (
    words.length >= 2 &&
    words.length <= 3 &&
    isEnglishAdjectiveShaped(words[0]) &&
    !isEnglishAdjectiveShaped(words[words.length - 1]) &&
    words.slice(1).every(isPotentialEnglishContentWord)
  );
}

function hasEnglishDependentClause(
  words: readonly string[],
  marker: string
): boolean {
  if (words.length === 0) return false;
  if (
    ENGLISH_RELATIVE_MARKERS.has(marker) &&
    (isLikelyEnglishFinitePredicate(words[0]) ||
      isEnglishDeclarativePredicate(words[0]))
  ) {
    return words.slice(1).filter(isPotentialEnglishContentWord).length >= 1;
  }
  if (
    ENGLISH_RELATIVE_MARKERS.has(marker) &&
    words.length === 2 &&
    isPotentialEnglishContentWord(words[0]) &&
    ENGLISH_BOUNDED_INTRANSITIVE_PREDICATES.has(words[1])
  ) {
    return true;
  }
  if (
    (marker === "if" || marker === "when") &&
    words.length === 1 &&
    isEnglishAdjectiveShaped(words[0])
  ) {
    return true;
  }
  if (marker === "then") {
    return words.slice(0, 3).some(isEnglishContentPredicate);
  }
  if (
    (marker === "before" || marker === "after" || marker === "while") &&
    /^[a-z]{4,}ing$/u.test(words[0])
  ) {
    if (
      words.length === 1 &&
      ENGLISH_BOUNDED_INTRANSITIVE_GERUNDS.has(words[0])
    ) {
      return true;
    }
    const coordinatorIndex = words.indexOf("and", 1);
    if (coordinatorIndex > 0) {
      const coordinatedComplement = words.slice(coordinatorIndex + 1);
      if (
        isEnglishAdjectiveShaped(coordinatedComplement[0]) &&
        !isBoundedCoordinatedNominalComplement(coordinatedComplement)
      ) {
        return false;
      }
    }
    const firstComplement = words[1];
    if (ENGLISH_PREPOSITIONS.has(firstComplement)) {
      const acceptsGerundPreposition =
        acceptsEnglishPrepositionalComplement(words[0], firstComplement) ||
        (/^committing$/u.test(words[0]) && firstComplement === "to") ||
        (/^investing$/u.test(words[0]) && firstComplement === "in");
      return (
        acceptsGerundPreposition &&
        words.slice(2).some(isPotentialEnglishContentWord)
      );
    }
    // Marker-led gerunds own their subject implicitly. Requiring a substantive
    // complement keeps bare forms such as `while preserving` closed without
    // forcing ordinary gerunds through finite-predicate agreement heuristics.
    return words.slice(1).some(isPotentialEnglishContentWord);
  }

  const embeddedWhileIndex = words.indexOf("while");
  if (embeddedWhileIndex > 0) {
    const mainWords = words.slice(0, embeddedWhileIndex);
    const predicateIndex = getEnglishSentencePredicateIndex(mainWords);
    return (
      predicateIndex > 0 &&
      hasCompleteEnglishPredicateComplement(mainWords, predicateIndex) &&
      hasEnglishDependentClause(words.slice(embeddedWhileIndex + 1), "while")
    );
  }

  const coordinatorIndexes = words.flatMap((word, index) =>
    word === "and" || word === "but" ? [index] : []
  );
  const recognizedPredicateIndex = words.findIndex((word, index) => {
    const hasBoundedCompoundSubject =
      coordinatorIndexes.length === 1 &&
      coordinatorIndexes[0] > 0 &&
      coordinatorIndexes[0] < index - 1 &&
      !words
        .slice(0, coordinatorIndexes[0])
        .some(isEnglishDeclarativePredicate) &&
      !isEnglishAdjectiveShaped(words[index - 1]);
    return (
      index > 0 &&
      isEnglishDeclarativePredicate(word) &&
      hasPlausibleEnglishDeclarativePredicateUse(words, index) &&
      hasEnglishSubjectPredicateAgreement(words, index) &&
      (coordinatorIndexes.length === 0 || hasBoundedCompoundSubject) &&
      hasCompleteEnglishPredicateComplement(words, index)
    );
  });
  if (recognizedPredicateIndex > 0) {
    return true;
  }

  const clauses = splitEnglishCoordinatedClauses(words);
  let establishedPredicate = false;
  for (const clause of clauses) {
    const trimmed = clause.filter(
      (word, index) =>
        !(index === 0 && (word === "a" || word === "an" || word === "the"))
    );
    if (trimmed.length === 0) return false;

    if (
      establishedPredicate &&
      isBoundedCoordinatedNominalComplement(trimmed)
    ) {
      continue;
    }
    if (
      establishedPredicate &&
      isLikelyEnglishFinitePredicate(trimmed[0]) &&
      !isEnglishAdjectiveShaped(trimmed[0]) &&
      trimmed.slice(1).some(isPotentialEnglishContentWord)
    ) {
      continue;
    }
    const modalIndex = trimmed.findIndex((word) =>
      SPACED_MODAL_MARKERS.has(word)
    );
    if (
      modalIndex > 0 &&
      trimmed
        .slice(modalIndex + 1, modalIndex + 4)
        .some(isPotentialEnglishContentWord)
    ) {
      establishedPredicate = true;
      continue;
    }

    let predicateIndex = findEnglishPredicateIndex(trimmed, 1, trimmed.length);
    if (
      predicateIndex > 0 &&
      ((!isEnglishDeclarativePredicate(trimmed[predicateIndex]) &&
        isEnglishAdjectiveShaped(trimmed[predicateIndex])) ||
        (trimmed[predicateIndex].endsWith("ing") &&
          !/^[a-z]{4,}ing$/u.test(trimmed[0])))
    ) {
      const laterFinitePredicateOffset = trimmed
        .slice(predicateIndex + 1)
        .findIndex(
          (word) => !word.endsWith("ing") && isEnglishDeclarativePredicate(word)
        );
      if (laterFinitePredicateOffset >= 0) {
        predicateIndex += laterFinitePredicateOffset + 1;
      }
    }
    if (predicateIndex < 0) {
      const declarativePredicateIndex =
        getEnglishSentencePredicateIndex(trimmed);
      if (
        declarativePredicateIndex > 0 &&
        isEnglishDeclarativePredicate(trimmed[declarativePredicateIndex])
      ) {
        predicateIndex = declarativePredicateIndex;
      }
    }
    if (predicateIndex < 0) return false;
    const predicate = trimmed[predicateIndex];
    const subjectWords = trimmed
      .slice(0, predicateIndex)
      .filter((word) => !ENGLISH_CLAUSE_ADVERBS.has(word));
    if (subjectWords.length === 0) return false;
    const subjectHead = subjectWords[subjectWords.length - 1];
    const hasGerundSubject = /^[a-z]{4,}ing$/u.test(subjectWords[0]);
    const hasPluralSubject =
      subjectHead.endsWith("s") ||
      subjectHead === "data" ||
      subjectHead === "people";
    const hasPronounSubject =
      SPACED_SUBJECT_MARKERS.has(subjectWords[0]) ||
      ENGLISH_BASE_AGREEMENT_SUBJECT_PRONOUNS.has(subjectWords[0]);
    const predicateNeedsPluralSubject =
      !ENGLISH_FINITE_AUXILIARIES.has(predicate) &&
      !/(?:ed|ing|s)$/u.test(predicate);
    const hasSingularPredicate =
      getEnglishPredicateAgreement(predicate) === "singular";
    if (
      (predicate.endsWith("ing") && !hasGerundSubject) ||
      (!isEnglishDeclarativePredicate(predicate) &&
        (isEnglishAdjectiveShaped(predicate) ||
          (!hasGerundSubject &&
            looksLikeEnglishPluralHead(predicate) &&
            isEnglishAdjectiveShaped(trimmed[predicateIndex + 1])))) ||
      !trimmed.slice(predicateIndex + 1).some(isPotentialEnglishContentWord) ||
      (hasPronounSubject && hasSingularPredicate) ||
      (predicateNeedsPluralSubject &&
        !hasGerundSubject &&
        !hasPluralSubject &&
        !hasPronounSubject)
    ) {
      return false;
    }
    establishedPredicate = true;
  }
  return establishedPredicate;
}

function hasEnglishStructuredObject(
  words: readonly string[],
  normalized: string
): boolean {
  const modalIndex = words.findIndex((word) => SPACED_MODAL_MARKERS.has(word));
  if (modalIndex < 1) return false;
  const predicateOffset = words
    .slice(modalIndex + 1, modalIndex + 4)
    .findIndex(isPotentialEnglishContentWord);
  if (predicateOffset < 0) return false;
  const predicateIndex = modalIndex + 1 + predicateOffset;
  const objectWords = words.slice(predicateIndex + 1);
  if (objectWords.filter(isPotentialEnglishContentWord).length < 3) {
    return false;
  }

  const hasCoordinatedList = words.includes("and") && /[,;:]/u.test(normalized);
  const hasGroundedCompound =
    words.includes("and") &&
    words.some((word) => ENGLISH_OBJECT_GROUNDING_CONNECTORS.has(word));
  const hasFrontedContext =
    ENGLISH_FRONTED_CONTEXT_CONNECTORS.has(words[0]) &&
    modalIndex >= 5 &&
    words.slice(0, modalIndex).includes("the");
  return hasCoordinatedList || hasGroundedCompound || hasFrontedContext;
}

function hasGroundedEnglishCoordinatedDeclarativeObject(
  words: readonly string[]
): boolean {
  const predicateIndex = getEnglishSentencePredicateIndex(words);
  if (
    predicateIndex < 1 ||
    !hasCompleteEnglishPredicateComplement(words, predicateIndex)
  ) {
    return false;
  }

  const complement = words.slice(predicateIndex + 1);
  return (
    complement.includes("and") &&
    complement.filter(isPotentialEnglishContentWord).length >= 4 &&
    complement.some((word) => ENGLISH_OBJECT_GROUNDING_CONNECTORS.has(word))
  );
}

function getEnglishComplementPredicateIndex(
  words: readonly string[],
  predicateIndex: number
): number {
  if (!SPACED_MODAL_MARKERS.has(words[predicateIndex])) {
    return predicateIndex;
  }
  const lexicalPredicateOffset = words
    .slice(predicateIndex + 1, predicateIndex + 4)
    .findIndex(isPotentialEnglishContentWord);
  return lexicalPredicateOffset < 0
    ? predicateIndex
    : predicateIndex + 1 + lexicalPredicateOffset;
}

function hasGroundedEnglishOrdinaryClause(words: readonly string[]): boolean {
  const predicateIndex = getEnglishSentencePredicateIndex(words);
  const complementPredicateIndex = getEnglishComplementPredicateIndex(
    words,
    predicateIndex
  );
  if (
    predicateIndex < 1 ||
    !hasEnglishMainClause(words) ||
    !hasEnglishSubjectPredicateAgreement(words, predicateIndex) ||
    !hasCompleteEnglishPredicateComplement(words, complementPredicateIndex)
  ) {
    return false;
  }

  const complement = words.slice(complementPredicateIndex + 1);
  const hasComplementGrammar = complement.some(
    (word) =>
      ENGLISH_SURFACE_FUNCTION_WORDS.has(word) ||
      ENGLISH_DETERMINERS.has(word) ||
      ENGLISH_COORDINATING_CONJUNCTIONS.has(word) ||
      ENGLISH_PREPOSITIONS.has(word)
  );
  return (
    hasComplementGrammar &&
    complement.filter(isPotentialEnglishContentWord).length >= 2
  );
}

function hasEnglishSingleSentenceCoherence(
  analysis: SurfaceCoherenceAnalysis
): boolean {
  const sentences = getEnglishSentenceWords(analysis);
  if (sentences.length !== 1) return false;
  const frontedContext = analysis.normalized.match(
    /^(?:during|in)\b[^.!?]{3,100}?,\s*(.+)$/u
  )?.[1];
  const words = frontedContext
    ? (frontedContext.match(/[a-z]+/gu) ?? [])
    : sentences[0];
  const relationshipIndexes = words.flatMap((word, index) =>
    ENGLISH_RELATIONSHIP_MARKERS.has(word) ? [index] : []
  );
  const trailingRelationshipIndex = relationshipIndexes[0];
  const hasBoundedTrailingEllipsis =
    relationshipIndexes.length === 1 &&
    trailingRelationshipIndex === words.length - 2 &&
    (words[trailingRelationshipIndex] === "if" ||
      words[trailingRelationshipIndex] === "when") &&
    isEnglishAdjectiveShaped(words[words.length - 1]);
  if (
    (relationshipIndexes.length > 0 && !hasBoundedTrailingEllipsis) ||
    words.length < 8
  ) {
    return false;
  }
  return hasGroundedEnglishOrdinaryClause(words);
}

function acceptsEnglishPrepositionalComplement(
  predicate: string,
  preposition: string
): boolean {
  if (/^collaborat(?:e|ed|es|ing)$/u.test(predicate)) {
    return ["across", "on", "with"].includes(preposition);
  }
  if (/^communicat(?:e|ed|es|ing)$/u.test(predicate)) {
    return ["about", "to", "with"].includes(preposition);
  }
  if (predicate === "come") {
    return preposition === "from";
  }
  if (/^mov(?:e|ed|es|ing)$/u.test(predicate)) {
    return preposition === "on" || preposition === "to";
  }
  if (/^disagree(?:d|ing|s)?$/u.test(predicate)) {
    return preposition === "about" || preposition === "with";
  }
  if (/^listen(?:ed|ing|s)?$/u.test(predicate)) {
    return preposition === "to";
  }
  if (/^learn(?:ed|ing|s|t)?$/u.test(predicate)) {
    return preposition === "from" || preposition === "to";
  }
  if (/^negotiat(?:e|ed|es|ing)$/u.test(predicate)) {
    return ["for", "on", "over", "with"].includes(preposition);
  }
  if (/^partner(?:ed|ing|s)?$/u.test(predicate)) {
    return preposition === "with";
  }
  if (/^respond(?:ed|ing|s)?$/u.test(predicate)) {
    return preposition === "to" || preposition === "with";
  }
  if (/^belong(?:ed|ing|s)?$/u.test(predicate)) {
    return preposition === "to" || preposition === "with";
  }
  if (/^consist(?:ed|ing|s)?$/u.test(predicate)) {
    return preposition === "of" || preposition === "in";
  }
  if (/^depend(?:ed|ing|s)?$/u.test(predicate)) {
    return preposition === "on" || preposition === "upon";
  }
  if (/^(?:lie|lies|lay|lain|lying)$/u.test(predicate)) {
    return ["at", "between", "in", "within", "with"].includes(preposition);
  }
  if (/^result(?:ed|ing|s)?$/u.test(predicate)) {
    return preposition === "from" || preposition === "in";
  }
  if (/^stem(?:med|ming|s)?$/u.test(predicate)) {
    return preposition === "from";
  }
  if (/^struggl(?:e|ed|es|ing)$/u.test(predicate)) {
    return ["against", "for", "to", "with"].includes(preposition);
  }
  if (/^(?:focus(?:ed|es|ing)?|start(?:ed|ing|s)?)$/u.test(predicate)) {
    return ["by", "from", "on", "with"].includes(preposition);
  }
  if (/^(?:speak(?:ing|s)?|spoke|talk(?:ed|ing|s)?)$/u.test(predicate)) {
    return ["about", "to", "with"].includes(preposition);
  }
  if (/^wait(?:ed|ing|s)?$/u.test(predicate)) {
    return ["at", "for", "in"].includes(preposition);
  }
  if (/^work(?:ed|ing|s)?$/u.test(predicate)) {
    return ["across", "at", "for", "in", "on", "with"].includes(preposition);
  }
  return false;
}

type EnglishAgreement = "base" | "singular" | "neutral";

function looksLikeEnglishPluralHead(word: string): boolean {
  return (
    ENGLISH_EXPLICIT_PLURAL_SUBJECT_HEADS.has(word) ||
    (word.endsWith("s") &&
      !/(?:is|ss|us)$/u.test(word) &&
      !ENGLISH_BASE_FORMS_ENDING_IN_S.has(word))
  );
}

function getEnglishSubjectAgreement(
  subjectWords: readonly string[]
): EnglishAgreement | null {
  if (ENGLISH_BASE_AGREEMENT_SUBJECT_PRONOUNS.has(subjectWords[0])) {
    return "base";
  }
  const ofComplementIndex = subjectWords.indexOf("of");
  const headWords =
    ofComplementIndex > 0
      ? subjectWords.slice(0, ofComplementIndex)
      : subjectWords;
  if (headWords.includes("and")) return "base";
  const contentWords = headWords.filter(
    (word) => !ENGLISH_DETERMINERS.has(word)
  );
  const head = contentWords[contentWords.length - 1];
  if (!head) return null;
  if (subjectWords[0] === "a" || subjectWords[0] === "an") {
    return "singular";
  }
  if (ENGLISH_BASE_AGREEMENT_SUBJECT_HEADS.has(head)) return "base";
  if (["he", "it", "she"].includes(head)) return "singular";
  return looksLikeEnglishPluralHead(head) ? "base" : "singular";
}

function getEnglishPredicateAgreement(word: string): EnglishAgreement {
  if (
    ENGLISH_BASE_FORMS_ENDING_IN_NEUTRAL_SUFFIX.has(word) ||
    /(?:ss|us)$/u.test(word)
  ) {
    return "base";
  }
  if (
    ENGLISH_NUMBER_NEUTRAL_PREDICATES.has(word) ||
    /(?:ed|ing)$/u.test(word)
  ) {
    return "neutral";
  }
  if (ENGLISH_SINGULAR_AUXILIARIES.has(word)) return "singular";
  if (ENGLISH_BASE_AGREEMENT_AUXILIARIES.has(word)) return "base";
  if (
    !ENGLISH_BASE_FORMS_ENDING_IN_S.has(word) &&
    /(?:ies|es|s)$/u.test(word)
  ) {
    return "singular";
  }
  return "base";
}

function hasEnglishSubjectPredicateAgreement(
  words: readonly string[],
  predicateIndex: number
): boolean {
  const subjectAgreement = getEnglishSubjectAgreement(
    words
      .slice(0, predicateIndex)
      .filter((word) => !ENGLISH_CLAUSE_ADVERBS.has(word))
  );
  if (!subjectAgreement) return false;
  const predicateAgreement = getEnglishPredicateAgreement(
    words[predicateIndex]
  );
  return (
    predicateAgreement === "neutral" || predicateAgreement === subjectAgreement
  );
}

function isEnglishAdjectiveShaped(word: string): boolean {
  if (!word) return false;
  if (word.endsWith("ly")) return false;
  return (
    ENGLISH_POSTNOMINAL_ADJECTIVES.has(word) ||
    (!ENGLISH_ADJECTIVE_SUFFIX_NOUN_EXCEPTIONS.has(word) &&
      ENGLISH_POSTNOMINAL_ADJECTIVE_SUFFIX.test(word))
  );
}

function isBoundedOrdinaryDirectObjectPredicate(
  words: readonly string[],
  predicateIndex: number
): boolean {
  const predicate = words[predicateIndex];
  const complement = words[predicateIndex + 1];
  return (
    predicateIndex <= 3 &&
    predicate.length >= 3 &&
    isPotentialEnglishContentWord(predicate) &&
    (!predicate.endsWith("ing") ||
      ENGLISH_BASE_FORMS_ENDING_IN_NEUTRAL_SUFFIX.has(predicate)) &&
    !isEnglishAdjectiveShaped(predicate) &&
    complement !== undefined &&
    !ENGLISH_COORDINATING_CONJUNCTIONS.has(complement) &&
    !ENGLISH_PREPOSITIONS.has(complement)
  );
}

function shouldTreatAsExtendedSubject(
  words: readonly string[],
  predicateIndex: number,
  recognizedPredicate: boolean
): boolean {
  if (recognizedPredicate) return false;
  const next = words[predicateIndex + 1];
  const afterNext = words[predicateIndex + 2];
  return Boolean(
    next &&
      afterNext &&
      ((isLikelyEnglishFinitePredicate(next) &&
        !hasEnglishSubjectPredicateAgreement(words, predicateIndex)) ||
        (getEnglishSubjectAgreement(words.slice(0, predicateIndex)) === null &&
          isPotentialEnglishContentWord(next) &&
          isLikelyEnglishFinitePredicate(afterNext)) ||
        (looksLikeEnglishPluralHead(words[predicateIndex]) &&
          isBoundedOrdinaryDirectObjectPredicate(words, predicateIndex + 1)))
  );
}

function hasCompleteEnglishPredicateComplement(
  words: readonly string[],
  predicateIndex: number
): boolean {
  const terminal = words[words.length - 1];
  if (
    ENGLISH_COORDINATING_CONJUNCTIONS.has(terminal) ||
    ENGLISH_DETERMINERS.has(terminal) ||
    ENGLISH_PREPOSITIONS.has(terminal)
  ) {
    return false;
  }

  for (let index = 0; index < words.length; index += 1) {
    if (!ENGLISH_DETERMINERS.has(words[index])) continue;
    const following = words[index + 1];
    if (
      following === undefined ||
      ENGLISH_DETERMINERS.has(following) ||
      ENGLISH_COORDINATING_CONJUNCTIONS.has(following) ||
      ENGLISH_PREPOSITIONS.has(following)
    ) {
      return false;
    }
  }

  for (let index = predicateIndex + 1; index < words.length - 1; index += 1) {
    if (
      ENGLISH_COORDINATING_CONJUNCTIONS.has(words[index]) &&
      ENGLISH_PREPOSITIONS.has(words[index + 1])
    ) {
      return false;
    }
    if (
      isEnglishAdjectiveShaped(words[index]) &&
      ENGLISH_COORDINATING_CONJUNCTIONS.has(words[index + 1])
    ) {
      return false;
    }
  }

  for (let index = predicateIndex + 1; index < words.length - 2; index += 1) {
    if (
      ENGLISH_DETERMINERS.has(words[index]) &&
      isPotentialEnglishContentWord(words[index + 1]) &&
      !isEnglishAdjectiveShaped(words[index + 1]) &&
      isEnglishAdjectiveShaped(words[index + 2])
    ) {
      return false;
    }
  }

  const predicate = words[predicateIndex];
  const complement = words.slice(predicateIndex + 1);
  if (complement.length === 0) return false;
  const firstComplement = complement[0];
  if (ENGLISH_COORDINATING_CONJUNCTIONS.has(firstComplement)) return false;
  if (
    ENGLISH_PREPOSITIONS.has(firstComplement) &&
    !acceptsEnglishPrepositionalComplement(predicate, firstComplement)
  ) {
    return false;
  }
  return complement.some(isPotentialEnglishContentWord);
}

function getEnglishSentencePredicateIndex(words: readonly string[]): number {
  const upperBound = Math.min(words.length - 1, 5);
  let recognizedAgreementMismatch = false;

  // Prefer the bounded predicate vocabulary before the open direct-object
  // fallback. Otherwise a noun or adjective inside a multi-word subject (for
  // example, "target audience" or "strongest opportunity") can be mistaken
  // for the predicate before we reach an unambiguous finite verb such as
  // "consists" or "lies".
  for (let index = 1; index < upperBound; index += 1) {
    if (!isEnglishDeclarativePredicate(words[index])) continue;
    if (!hasPlausibleEnglishDeclarativePredicateUse(words, index)) continue;
    if (hasEnglishSubjectPredicateAgreement(words, index)) return index;
    recognizedAgreementMismatch = true;
  }

  if (recognizedAgreementMismatch) return -1;

  for (let index = 1; index < upperBound; index += 1) {
    if (!isBoundedOrdinaryDirectObjectPredicate(words, index)) continue;
    if (
      shouldTreatAsExtendedSubject(words, index, false) ||
      !hasPlausibleEnglishDeclarativePredicateUse(words, index)
    ) {
      continue;
    }
    if (!hasEnglishSubjectPredicateAgreement(words, index)) return -1;
    return index;
  }
  return -1;
}

function hasSpacedStructuralCoherence(
  analysis: SurfaceCoherenceAnalysis,
  scaffold: ReturnType<typeof getBestSurfaceScaffold>
): boolean {
  if (
    scaffold.multilingual &&
    scaffold.hasRelationship &&
    scaffold.hasPredicate &&
    scaffold.markerCount >= 3
  ) {
    return Boolean(
      (scaffold.family &&
        hasMultilingualStructuralCoherence(analysis, scaffold.family)) ||
        hasMultiscriptNarrativeEvidence(analysis)
    );
  }

  const englishWords = analysis.words.filter((word) => /^[a-z]+$/u.test(word));
  if (englishWords.length < 8) return false;
  for (let index = 1; index < englishWords.length; index += 1) {
    if (
      ENGLISH_RELATIONSHIP_MARKERS.has(englishWords[index]) &&
      ENGLISH_RELATIONSHIP_MARKERS.has(englishWords[index - 1])
    ) {
      return false;
    }
  }

  const predicateCount = new Set(
    englishWords.filter((word) => isEnglishContentPredicate(word))
  ).size;
  const hasContentConnector = englishWords.some((word) =>
    SPACED_CONTENT_CONNECTORS.has(word)
  );
  const relationshipIndex = englishWords.findIndex((word, index) => {
    if (index === 0 || !ENGLISH_RELATIONSHIP_MARKERS.has(word)) return false;
    if (
      (word === "after" || word === "before") &&
      ENGLISH_DETERMINERS.has(englishWords[index + 1]) &&
      getEnglishSentencePredicateIndex(englishWords.slice(index + 1)) < 0
    ) {
      return false;
    }
    return true;
  });
  if (relationshipIndex > 0) {
    const marker = englishWords[relationshipIndex];
    const mainWords = englishWords.slice(0, relationshipIndex);
    const boundedFrontedSubjectIndex = ENGLISH_FRONTED_CONTEXT_CONNECTORS.has(
      mainWords[0]
    )
      ? mainWords.findIndex((word, index) => index > 0 && word === "the")
      : -1;
    const predicateWords =
      boundedFrontedSubjectIndex > 0
        ? mainWords.slice(boundedFrontedSubjectIndex)
        : mainWords;
    const mainPredicateIndex = getEnglishSentencePredicateIndex(predicateWords);
    const mainModalIndex = predicateWords.findIndex((word) =>
      SPACED_MODAL_MARKERS.has(word)
    );
    const hasCompleteFrontedModalMainClause =
      boundedFrontedSubjectIndex > 0 &&
      mainModalIndex > 0 &&
      hasEnglishMainClause(predicateWords) &&
      predicateWords
        .slice(mainModalIndex + 1)
        .filter(isPotentialEnglishContentWord).length >= 3;
    const hasCompleteMainClauseBeforeWhile =
      marker !== "while" ||
      hasCompleteFrontedModalMainClause ||
      (mainPredicateIndex > 0 &&
        hasCompleteEnglishPredicateComplement(
          predicateWords,
          mainPredicateIndex
        ));
    return (
      hasCompleteMainClauseBeforeWhile &&
      hasEnglishMainClause(predicateWords) &&
      hasEnglishDependentClause(
        englishWords.slice(relationshipIndex + 1),
        marker
      )
    );
  }

  return (
    hasEnglishMainClause(englishWords) &&
    ((predicateCount >= 2 &&
      (hasContentConnector || /[,;:]/u.test(analysis.normalized))) ||
      hasEnglishStructuredObject(englishWords, analysis.normalized) ||
      hasGroundedEnglishCoordinatedDeclarativeObject(englishWords))
  );
}

/**
 * Multi-sentence answers provide stronger surface evidence than one clause:
 * each sentence must retain lexical diversity, ordinary function-word
 * structure, and a common finite predicate. This path intentionally avoids PM
 * noun allowlists; it remains a bounded surface guard, not semantic
 * understanding.
 */
function hasEnglishMultiSentenceCoherence(
  analysis: SurfaceCoherenceAnalysis
): boolean {
  const sentences = getEnglishSentenceWords(analysis);
  if (sentences.length < 2 || sentences.length > 6) return false;

  let totalPredicateSignals = 0;
  let relationshipPredicateSignals = 0;
  for (const words of sentences) {
    if (words.length < 5) return false;
    const uniqueWords = new Set(words);
    if (uniqueWords.size < 4 || uniqueWords.size / words.length < 0.6) {
      return false;
    }
    if (words.filter(isPotentialEnglishContentWord).length < 3) return false;

    const functionSignals = words.filter((word) =>
      ENGLISH_SURFACE_FUNCTION_WORDS.has(word)
    ).length;
    const predicateIndex = getEnglishSentencePredicateIndex(words);
    const complementPredicateIndex = getEnglishComplementPredicateIndex(
      words,
      predicateIndex
    );
    const hasRelationshipPredicate =
      predicateIndex >= 0 &&
      (isEnglishDeclarativeRelationshipPredicate(words[predicateIndex]) ||
        (SPACED_MODAL_MARKERS.has(words[predicateIndex]) &&
          words
            .slice(predicateIndex + 1, predicateIndex + 4)
            .some(isEnglishContentPredicate)) ||
        (!isEnglishDeclarativePredicate(words[predicateIndex]) &&
          isBoundedOrdinaryDirectObjectPredicate(words, predicateIndex)));
    if (
      predicateIndex < 0 ||
      (functionSignals < 1 && !hasRelationshipPredicate) ||
      !hasCompleteEnglishPredicateComplement(words, complementPredicateIndex)
    ) {
      return false;
    }
    totalPredicateSignals += 1;
    if (hasRelationshipPredicate) {
      relationshipPredicateSignals += 1;
    }
  }

  return (
    totalPredicateSignals >= sentences.length &&
    relationshipPredicateSignals >= 1
  );
}

function getSurfaceSentenceWords(
  analysis: SurfaceCoherenceAnalysis
): readonly string[][] {
  return analysis.normalized
    .split(/[.!?]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) => sentence.match(/\p{L}+/gu) ?? []);
}

function getEnglishSentenceWords(
  analysis: SurfaceCoherenceAnalysis
): readonly string[][] {
  return getSurfaceSentenceWords(analysis).map((words) =>
    words.filter((word) => /^[a-z]+$/u.test(word))
  );
}

function isEnglishMultiSentenceCandidate(
  analysis: SurfaceCoherenceAnalysis
): boolean {
  const sentences = getEnglishSentenceWords(analysis);
  return (
    sentences.length >= 2 &&
    sentences.length <= 6 &&
    sentences.every(
      (words) =>
        words.length >= 5 &&
        (words.some((word) => ENGLISH_SURFACE_FUNCTION_WORDS.has(word)) ||
          getEnglishSentencePredicateIndex(words) >= 0)
    )
  );
}

const ENGLISH_UNAMBIGUOUS_SENTENCE_HEADS = new Set([
  "an",
  "each",
  "every",
  "he",
  "her",
  "his",
  "i",
  "it",
  "its",
  "many",
  "my",
  "our",
  "some",
  "she",
  "that",
  "the",
  "their",
  "these",
  "they",
  "this",
  "those",
  "we",
  "you",
  "your",
]);

const MULTILINGUAL_SENTENCE_HEAD_MARKERS = new Set([
  "a",
  "à",
  ...SURFACE_SCAFFOLD_FAMILIES.filter((family) => family.multilingual).flatMap(
    (family) => [...family.markers]
  ),
]);

function isEnglishOwnedSentence(words: readonly string[]): boolean {
  const first = words[0];
  if (ENGLISH_UNAMBIGUOUS_SENTENCE_HEADS.has(first)) return true;

  const upperBound = Math.min(words.length - 1, 5);
  const recognizedPredicateIndex = words
    .slice(1, upperBound)
    .findIndex(isEnglishDeclarativePredicate);
  if (recognizedPredicateIndex < 0) return false;

  // Spanish commonly uses `a` as a preposition. Treat it as an English article
  // only when the same bounded clause also contains a recognized English
  // predicate; bare English noun heads use that predicate as their ownership
  // signal without relying on suffixes that also occur in other languages.
  if (
    first === "a" ||
    words
      .slice(0, recognizedPredicateIndex + 1)
      .some(isPotentialEnglishContentWord)
  ) {
    return true;
  }

  return false;
}

function hasLeadingMultilingualScaffold(words: readonly string[]): boolean {
  const leadingWords = new Set(words.slice(0, 3));
  return SURFACE_SCAFFOLD_FAMILIES.filter((family) => family.multilingual).some(
    (family) => [...leadingWords].some((word) => family.markers.has(word))
  );
}

function getEnglishWordsAfterMultilingualPrefix(
  surfaceWords: readonly string[]
): readonly string[] | null {
  const prefixLimit = Math.min(3, surfaceWords.length - 1);
  for (let prefixLength = 1; prefixLength <= prefixLimit; prefixLength += 1) {
    const prefix = surfaceWords.slice(0, prefixLength);
    if (!prefix.every((word) => MULTILINGUAL_SENTENCE_HEAD_MARKERS.has(word))) {
      break;
    }

    const remainder = surfaceWords.slice(prefixLength);
    if (!ENGLISH_UNAMBIGUOUS_SENTENCE_HEADS.has(remainder[0])) continue;
    return remainder.filter((word) => /^[a-z]+$/u.test(word));
  }
  return null;
}

function hasMalformedOwnedEnglishSentence(
  analysis: SurfaceCoherenceAnalysis
): boolean {
  return getSurfaceSentenceWords(analysis).some((surfaceWords) => {
    const unprefixedEnglishWords =
      getEnglishWordsAfterMultilingualPrefix(surfaceWords);
    const words =
      unprefixedEnglishWords ??
      surfaceWords.filter((word) => /^[a-z]+$/u.test(word));
    const firstSurfaceWord = surfaceWords[0];
    const bareEnglishHead =
      /^[a-z]+$/u.test(firstSurfaceWord) &&
      !MULTILINGUAL_SENTENCE_HEAD_MARKERS.has(firstSurfaceWord) &&
      !hasLeadingMultilingualScaffold(surfaceWords) &&
      words.length >= 3 &&
      isPotentialEnglishContentWord(words[0]) &&
      isPotentialEnglishContentWord(words[1]);
    if (!isEnglishOwnedSentence(words) && !bareEnglishHead) {
      return false;
    }

    const predicateIndex = getEnglishSentencePredicateIndex(words);
    return (
      predicateIndex < 0 ||
      !hasCompleteEnglishPredicateComplement(words, predicateIndex)
    );
  });
}

function getEvidenceContentTokens(quote: string): string[] {
  const tokens = quote.match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.filter(
    (token) =>
      /\p{L}/u.test(token) &&
      !EVIDENCE_STOP_WORDS.has(token.toLocaleLowerCase("en-US")) &&
      !/(\p{L})\1{2,}/iu.test(token)
  );
}

function getRecognizedCandidateEvidenceSignals(quote: string): Set<string> {
  const contentTokens = getEvidenceContentTokens(quote);
  const recognizedTerms = new Set(
    contentTokens.flatMap((token) => {
      const signals: string[] = [];
      const domainTerm = token.toLocaleLowerCase("en-US");
      if (EVIDENCE_DOMAIN_TERMS.has(domainTerm)) {
        signals.push(`term:${domainTerm}`);
      }
      if (EVIDENCE_REASONING_TERMS.has(domainTerm)) {
        signals.push(`reasoning:${domainTerm}`);
      }
      const acronym = token.toLocaleUpperCase("en-US");
      if (EVIDENCE_DOMAIN_ACRONYMS.has(acronym)) {
        signals.push(`acronym:${acronym}`);
      }
      return signals;
    })
  );
  const hasQualifiedSymbol =
    /(?:\p{Sc}\s*\p{N}|\p{N}+(?:[.,]\p{N}+)?\s*(?:\p{Sc}|%|٪|‰|؉|‱|؊|x|×)(?=$|[^\p{L}\p{N}_]))/u.test(
      quote
    );
  const quantifiedUnit = quote.match(
    /\p{N}+(?:[.,]\p{N}+)?\s*([\p{L}]{1,8})(?=$|[^\p{L}\p{N}_])/u
  )?.[1];
  const hasQualifiedUnit =
    quantifiedUnit !== undefined &&
    EVIDENCE_QUANTIFIED_UNITS.has(quantifiedUnit.toLocaleLowerCase("en-US"));
  if (hasQualifiedSymbol) recognizedTerms.add("quantified:symbol");
  if (hasQualifiedUnit) recognizedTerms.add("quantified:unit");
  return recognizedTerms;
}

function countRecognizedCandidateEvidenceSignals(quote: string): number {
  return getRecognizedCandidateEvidenceSignals(quote).size;
}

export function hasRecognizedCandidateEvidenceSignal(quote: string): boolean {
  return countRecognizedCandidateEvidenceSignals(quote) > 0;
}

/**
 * Qualitative-only feedback accepts long recognized evidence across multiple
 * segments without pretending another deterministic grammar parser proves
 * meaning. Canonical security and quantitative gates are enforced by the
 * caller; closed provider selections remain the semantic coaching boundary.
 */
export interface EvidenceLimitedCandidateResponseAnalysis {
  lexicalTokenCount: number;
  recognizedEvidenceSignalCount: number;
  signalBearingSegmentCount: number;
  qualifies: boolean;
}

export function analyzeEvidenceLimitedCandidateResponseSignal(
  text: string
): EvidenceLimitedCandidateResponseAnalysis {
  const analysis = analyzeSurfaceCoherence(text);
  const recognizedEvidenceSignalCount =
    countRecognizedCandidateEvidenceSignals(text);
  const lexicalTokenCount = analysis.words.length;
  const signalBearingSegmentCount = text
    .split(/[.!?;:\n]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter(
      (segment) => countRecognizedCandidateEvidenceSignals(segment) > 0
    ).length;
  return {
    lexicalTokenCount,
    recognizedEvidenceSignalCount,
    signalBearingSegmentCount,
    qualifies:
      lexicalTokenCount >= 40 &&
      recognizedEvidenceSignalCount >= 2 &&
      signalBearingSegmentCount >= 2,
  };
}

export function hasEvidenceLimitedCandidateResponseSignal(
  text: string
): boolean {
  return analyzeEvidenceLimitedCandidateResponseSignal(text).qualifies;
}

/** A scoreable response needs both PM/reasoning signal and coherent language. */
export function hasSubstantiveCandidateResponseSignal(text: string): boolean {
  const analysis = analyzeSurfaceCoherence(text);
  if (hasCompactSurfaceCoherence(analysis)) return true;
  if (!hasPlausibleSurfaceDiversity(analysis)) return false;
  const scaffold = getBestSurfaceScaffold(analysis);
  if (scaffold.multilingual && hasMalformedOwnedEnglishSentence(analysis)) {
    return false;
  }
  if (!scaffold.multilingual && isEnglishMultiSentenceCandidate(analysis)) {
    return hasEnglishMultiSentenceCoherence(analysis);
  }

  return (
    hasSpacedStructuralCoherence(analysis, scaffold) ||
    (!scaffold.multilingual && hasEnglishSingleSentenceCoherence(analysis))
  );
}

export function isMinimallySubstantiveEvidenceQuote(
  quote: string,
  sourceCandidateTurn: string
): boolean {
  const contentTokens = getEvidenceContentTokens(quote);
  const isBareReasoningVerb =
    contentTokens.length === 1 &&
    EVIDENCE_REASONING_TERMS.has(contentTokens[0].toLocaleLowerCase("en-US")) &&
    !EVIDENCE_DOMAIN_TERMS.has(contentTokens[0].toLocaleLowerCase("en-US")) &&
    !EVIDENCE_DOMAIN_ACRONYMS.has(contentTokens[0].toLocaleUpperCase("en-US"));
  if (isBareReasoningVerb) return false;
  if (hasRecognizedCandidateEvidenceSignal(quote)) return true;

  const normalizedTokens = contentTokens.map((token) =>
    token.toLocaleLowerCase("en-US")
  );
  const containsKnownLowSignal = normalizedTokens.some((token) =>
    EVIDENCE_LOW_SIGNAL_TERMS.has(token)
  );
  if (containsKnownLowSignal) return false;

  if (!hasSubstantiveCandidateResponseSignal(sourceCandidateTurn)) return false;

  const analysis = analyzeSurfaceCoherence(quote);
  const hasMultiwordEvidence =
    analysis.words.length >= 3 &&
    new Set(analysis.words).size >= 3 &&
    analysis.alphabeticGraphemes.length >= 16 &&
    !analysis.hasRepeatedDominance;
  return hasMultiwordEvidence;
}
