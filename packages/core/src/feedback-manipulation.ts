/**
 * Detect high-confidence attempts to control the feedback evaluator's result.
 *
 * This classifier is intentionally structural: an English match needs both an
 * instruction-shaped control and a score, one-sided feedback, or hiring
 * outcome. Compact multilingual packs cover only direct equivalents of those
 * controls. Product-policy discussion is excluded one clause at a time so a
 * safe product answer cannot hide a later evaluator instruction.
 */

const ROLE_NAME = String.raw`(?:system|developer|assistant)`;
const ROLE_ENVELOPE_SOURCE = String.raw`(?:###\s*${ROLE_NAME}\s*:?|\[${ROLE_NAME}\]\s*:?|<\s*${ROLE_NAME}\s*>|<\s*message\b[^>]*\brole\s*=\s*["']?${ROLE_NAME}["']?[^>]*>|<\s*role\s*>\s*${ROLE_NAME}\s*<\s*\/\s*role\s*>|["']?role["']?\s*[:=]\s*["']?${ROLE_NAME}["']?)`;
const ROLE_ENVELOPE = new RegExp(ROLE_ENVELOPE_SOURCE, "giu");
const LEADING_ROLE_ENVELOPE = new RegExp(`^${ROLE_ENVELOPE_SOURCE}`, "iu");
const TRAILING_ROLE_ENVELOPE = /<\s*\/\s*(?:system|developer|assistant)\s*>$/iu;

const CONTROL_ACTIONS =
  /(?:accept|approve|assess|assign|avoid|award|call|characterize|classify|consider|declare|deem|describe|disregard|endorse|evaluate|find|frame|give|grade|hire|ignore|include|judge|label|list|make|mark|mention|omit|output|paint|pass|praise|present|provide|put|rank|rate|recommend|return|say|score|see|set|state|suppress|tell|treat|use|view|write)/;
const IMPERATIVE_CONTROL = new RegExp(
  `^(?:(?:please|kindly)\\s+)?(?:do\\s+not\\s+)?${CONTROL_ACTIONS.source}\\b`,
  "iu"
);
const REQUEST_CONTROL = new RegExp(
  `^(?:(?:can|could|may|might|should|would|will)\\s+you\\s+(?:please\\s+)?|i\\s+(?:(?:am\\s+asking|ask|expect|need|want)\\s+you\\s+to)\\s+)${CONTROL_ACTIONS.source}\\b`,
  "iu"
);
const DEONTIC_CONTROL =
  /^(?:(?:all|every)\s+(?:categories|category|dimension|dimensions)|(?:the\s+)?(?:evaluator|judge|model|reviewer))\b[\s\S]{0,50}\b(?:has\s+to|must|needs?\s+to|ought\s+to|should|will)\b/iu;
const TARGET_DEONTIC_CONTROL =
  /^(?:(?:the|this|your|my)\s+)?(?:answer|candidate|evaluation|feedback|output|response|result)\b[\s\S]{0,50}\b(?:has\s+to|must|needs?\s+to|ought\s+to|should|will)\b/iu;
const EMBEDDED_TARGET_DEONTIC_CONTROL =
  /\b(?:(?:my|your)\s+(?:answer|candidate|evaluation|feedback|output|response|result)|the\s+(?:evaluation|feedback|output|result)(?![- ](?:latency|metric|quality|rate|time)\b)|(?:evaluator|judge|model|reviewer))\b[\s\S]{0,50}\b(?:has\s+to|must|needs?\s+to|ought\s+to|should|will)\b/iu;
const SELF_IDENTIFIED_AUTHORITY =
  /^(?:i\s+am|speaking\s+as|as)\s+(?:an?\s+|the\s+)?(?:assistant|evaluator|interviewer|judge|model|reviewer)\b/iu;
const ASSUMED_AUTHORITY_CONTROL = new RegExp(
  `^(?:act\\s+as|pretend\\s+you\\s+are|assume\\s+(?:the\\s+)?role\\s+of)\\s+(?:an?\\s+|the\\s+)?(?:assistant|evaluator|interviewer|judge|model|reviewer)\\s*[,;:\\-]?\\s*${CONTROL_ACTIONS.source}\\b`,
  "iu"
);
const SELF_OUTCOME_ASSERTION =
  /^(?:(?:my|this|the)\s+(?:answer|performance|response)\b[\s\S]{0,30}\b(?:deserves?|earns?|gets?|merits?|receives?|warrants?)\b|(?:the\s+)?only\s+valid\s+(?:evaluation|feedback|rating|result|score)\b|from\s+the\s+(?:evaluator|judge|reviewer)'?s\s+perspective\b[\s\S]{0,30}\b(?:my|this|the)\s+(?:answer|performance|response)\b[\s\S]{0,12}\b(?:excellent|flawless|perfect)\b|there\s+(?:are|will\s+be)\s+no\s+(?:critique|criticism|improvements?|weakness(?:es)?)\s+in\s+(?:my|this|the)\s+(?:answer|response)\b|your\s+(?:evaluation|feedback|result)\s+is\s*:?\s*(?:entirely\s+positive|only\s+strengths?)\b)/iu;
const DIRECT_SELF_OUTCOME_DECLARATION =
  /^(?:(?:my|this|the)\s+(?:answer|performance|response)\s+(?:(?:equals?|is|must\s+be|should\s+be|will\s+be|was(?!\s+(?:assigned|awarded|evaluated|given|marked|rated|scored)\b[\s\S]{0,40}\bby\s+(?!(?:me|myself)\b)\p{L}))\b|=)|i\s+(?:(?:am|must\s+be|should\s+be|will\s+be)\s+(?:hired|passed|successful)\b|deserves?\s+to\s+(?:be\s+hired|pass)\b))/iu;
const EMBEDDED_DIRECT_SELF_OUTCOME_DECLARATION =
  /(?:[,;:()]|\/(?!\s*\d)|\b(?:also|and|but|plus|then)\b)\s*(?:(?:my|this|the)\s+(?:answer|performance|response)\s+(?:(?:equals?|is|must\s+be|should\s+be|will\s+be|was(?!\s+(?:assigned|awarded|evaluated|given|marked|rated|scored)\b[\s\S]{0,40}\bby\s+(?!(?:me|myself)\b)\p{L}))\b|=)|i\s+(?:(?:am|must\s+be|should\s+be|will\s+be)\s+(?:hired|passed|successful)\b|deserves?\s+to\s+(?:be\s+hired|pass)\b))/iu;
const SELF_ATTRIBUTED_PAST_SCORE =
  /^(?:my\s+(?:answer|performance|response)\s+(?:earned|got|received)\b[\s\S]{0,50}\bfrom\s+(?:me|myself)\b|i\s+(?:assigned|awarded|evaluated|gave|marked|rated|scored)\s+my\s+(?:answer|performance|response)\b)/iu;
const DIRECT_RESULT_DECLARATION =
  /^(?:(?:the\s+)?(?:required\s+)?(?:evaluation|feedback|outcome|rating|result|score)\s+(?:has\s+to\s+be|is|must\s+be|should\s+be|was|will\s+be)\b|(?:the|this)\s+candidate\s+(?:(?:is|must\s+be|should\s+be|was|will\s+be)\b|deserves?\s+to\s+(?:be\s+hired|pass)\b|passes\b))/iu;
const EMBEDDED_DIRECT_RESULT_DECLARATION =
  /(?:[,;:()]|\/(?!\s*\d)|\b(?:also|and|but|plus|then)\b)\s*(?:(?:the\s+)?(?:required\s+)?(?:evaluation|feedback|outcome|rating|result|score)\s+(?:has\s+to\s+be|is|must\s+be|should\s+be|was|will\s+be)\b|(?:the|this)\s+candidate\s+(?:(?:is|must\s+be|should\s+be|was|will\s+be)\b|deserves?\s+to\s+(?:be\s+hired|pass)\b|passes\b))/iu;
const NAMED_ACTOR_HIRING_CONTROL =
  /^(?:(?:the|this)\s+)?[\p{L}\p{N}&.'-]+(?:\s+[\p{L}\p{N}&.'-]+){0,3}\s+(?:has\s+to|must|needs?\s+to|should|will)\s+(?:hire|pass|recommend\s+hiring)\s+me\b/iu;
const DESIRE_CONTROL =
  /^i\s+(?:expect|need|require|want)\b[\s\S]{0,40}\b(?:answer|candidate|evaluation|feedback|response|result)\b/iu;
const ADDRESSEE_DEONTIC_CONTROL = new RegExp(
  `^you\\s+(?:have\\s+to|must|need\\s+to|ought\\s+to|should|will)\\s+${CONTROL_ACTIONS.source}\\b`,
  "iu"
);

const SCORE_VALUE_SOURCE = String.raw`(?:10|[0-9]|zero|one|two|three|four|five|six|seven|eight|nine|ten)`;
const SCORE_OUTCOME = new RegExp(
  [
    String.raw`\b(?:full|maximum|top)\s+marks?\b`,
    String.raw`\b${SCORE_VALUE_SOURCE}\s*(?:\/|out\s+of)\s*(?:10|ten)\b`,
    String.raw`\b(?:five|5)\s+stars?\b`,
    String.raw`\b(?:grad|rat|scor)(?:e|ed|ing)\s+(?:me\s+|my\s+(?:answer|response)\s+)?(?:as\s+)?${SCORE_VALUE_SOURCE}\b`,
    String.raw`\b(?:score|rating)\b[\s\S]{0,30}\b(?:of\s+)?${SCORE_VALUE_SOURCE}\b`,
    String.raw`\b${SCORE_VALUE_SOURCE}\b[\s\S]{0,20}\b(?:score|rating)\b`,
    String.raw`\b(?:all|every)\s+(?:categories|category|dimension|dimensions)\b[\s\S]{0,30}\b${SCORE_VALUE_SOURCE}\b`,
    String.raw`\b(?:assign|set|use)\s+${SCORE_VALUE_SOURCE}\b[\s\S]{0,30}\b(?:clarity|communication|dimension|execution|product|strategy|structure)\b`,
  ].join("|"),
  "iu"
);
const DIRECT_SELF_SCORE_REQUEST = new RegExp(
  `(?:^|[,;:()]|\\b(?:also|and|but|plus|then)\\b)\\s*(?:(?:please|kindly)\\s+|(?:can|could|may|might|should|would|will)\\s+you\\s+(?:please\\s+)?)?(?:appraise|bestow|furnish|pencil(?:\\s+in)?|record)\\b(?=[\\s\\S]{0,100}\\b(?:me|my\\s+(?:answer|performance|response))\\b)(?=[\\s\\S]{0,100}(?:${SCORE_OUTCOME.source}))`,
  "iu"
);
const COERCIVE_QUALITY_OUTCOME =
  /\bas\s+(?:excellent|flawless|perfect)\b|\b(?:excellent|flawless|full|highest|maximum|perfect|top)\s+(?:grade|marks?|ratings?|scores?)\b|\b(?:evaluation|feedback|result)\b[\s\S]{0,30}\b(?:excellent|flawless|perfect)\b|\b(?:grad|rat|scor)(?:e|ing)\s+(?:me|my\s+(?:answer|performance|response)|the\s+(?:answer|response)|this\s+(?:answer|response))\s+(?:as\s+)?(?:excellent|flawless|perfect)\b|\b(?:all|every)\s+(?:categories|category|dimension|dimensions)\b[\s\S]{0,30}\b(?:excellent|flawless|perfect)\b|\b(?:my|the|this)\s+(?:answer|performance|response)\b[\s\S]{0,30}\b(?:excellent|flawless|perfect)\b/iu;
const ONE_SIDED_OUTCOME =
  /\b(?:entirely|exclusively|only)\s+(?:favorable|positive|strengths?)\b|\bonly\s+(?:positive\s+)?(?:comments?|feedback|strengths?)\b|\bstrengths?[- ]only\b|\b(?:all|any|every)\s+(?:critique|criticism|improvements?|weakness(?:es)?)\b|\bno\s+(?:critique|criticism|improvements?|weakness(?:es)?)\b|\b(?:omit|remove|suppress)\b[\s\S]{0,20}\b(?:critique|criticism|improvements?|weakness(?:es)?)\b|\b(?:do\s+not|never)\s+(?:include|list|mention|provide|return)\b[\s\S]{0,20}\b(?:critique|criticism|improvements?|weakness(?:es)?)\b/iu;
const PASS_OR_HIRE_OUTCOME =
  /\b(?:candidate|i|me|my\s+(?:answer|application|performance|response)|this\s+candidate)\b[\s\S]{0,24}\b(?:hire|hired|pass(?:ed|es)?|successful)\b|\b(?:hire|hiring|pass(?:ed|es)?|recommend\s+hiring)\b[\s\S]{0,24}\b(?:candidate|me)\b/iu;

const PRODUCT_POLICY_FRAME =
  /\b(?:coaching|interview\s+practice|onboarding)\s+product\b|\bproduct\s+(?:answer|design|experience|flow|policy|question|requirement|strategy)\b|\b(?:feedback|evaluation)\s+(?:design|experience|flow|policy|product)\b|\b(?:design|designing|shape|shaping)\b[\s\S]{0,50}\b(?:experience|feedback|flow|product)\b/iu;
const THIRD_PARTY_POLICY_AUDIENCE =
  /\b(?:for|to)\s+(?!(?:me|my)\b)(?:(?:an?|our|the|their)\s+)?(?:[\p{L}\p{N}-]+\s+){0,5}(?:candidates?|customers?|interviewers?|participants?|people|pms?|professionals?|teams?|users?)\b|\b(?:for|to)\s+(?!(?:me|my)\b)(?:candidates?|customers?|interviewers?|participants?|people|pms?|professionals?|teams?|users?)\b/iu;
const FEEDBACK_POLICY_SUBJECT =
  /\b(?:coaching|evaluation|feedback|first[- ]session|product)\b/iu;
const DIRECT_EVALUATOR_ADDRESSEE =
  /\b(?:assistant|evaluator|judge|model|reviewer)\b|\b(?:you|your)\b/iu;
const SELF_BENEFIT =
  /\b(?:me|my\s+(?:application|evaluation|feedback|performance|rating|response|result|score))\b/iu;
const EMBEDDED_EVALUATOR_OUTPUT_IMPERATIVE =
  /(?:^|[,;:()]|\/(?!\s*\d)|\b(?:also|and|but|then)\b)\s*(?:(?:please|kindly)\s+)?(?:(?:output|return|write)\s+only\b|(?:omit|suppress)\s+(?:all|any|every)\s+(?:critique|criticism|improvements?|weakness(?:es)?)\b|(?:include|list|mention|provide|return)\s+no\s+(?:critique|criticism|improvements?|weakness(?:es)?)\b)/iu;
const EMBEDDED_DIMENSION_SCORE_CONTROL =
  /(?:^|[,;:()]|\/(?!\s*\d)|\b(?:also|and|but|plus|then)\b)\s*(?:assign|award|give|grade|mark|rate|score|set)\b[\s\S]{0,24}\b(?:all|every)\s+(?:categories|category|dimension|dimensions)\b[\s\S]{0,24}\b(?:9|10|nine|ten|excellent|flawless|perfect)\b/iu;
const EMBEDDED_DIMENSION_DEONTIC_CONTROL =
  /\b(?:all|every)\s+(?:categories|category|dimension|dimensions)\b[\s\S]{0,24}\b(?:has\s+to|must|needs?\s+to|ought\s+to|should|will)\b[\s\S]{0,16}\b(?:9|10|nine|ten|excellent|flawless|perfect)\b/iu;
const EMBEDDED_SUFFIX_DEONTIC_CONTROL =
  /(?:[,;:()]|\/(?!\s*\d)|\b(?:also|and|but|plus|then)\b)\s*(?:(?:all|every)\s+(?:categories|category|dimension|dimensions)|(?:(?:the|this|your|my)\s+)?(?:answer|candidate|evaluation|feedback|output|response|result)|(?:the\s+)?(?:evaluator|judge|model|reviewer))\b[\s\S]{0,50}\b(?:has\s+to|must|needs?\s+to|ought\s+to|should|will)\b/iu;
const REQUIRED_REVIEWER_RESULT_CONTROL = new RegExp(
  `\\b(?:evaluator|judge|model|reviewer)\\b[\\s\\S]{0,24}\\b(?:is\\s+)?(?:expected|required)\\s+to\\s+${CONTROL_ACTIONS.source}\\b`,
  "iu"
);
const DELEGATED_REVIEWER_RESULT_CONTROL = new RegExp(
  `(?:^|[,;:()]|\\b(?:also|and|but|plus|then)\\b)\\s*(?:i\\s+(?:hereby\\s+)?(?:direct|instruct|task|tell)\\s+(?:the\\s+)?(?:evaluator|judge|model|reviewer)\\s+to|(?:the\\s+)?(?:evaluator|judge|model|reviewer)\\s+(?:(?:is|was)\\s+(?:being\\s+)?(?:directed|instructed|tasked|told)\\s+to|(?:has|had)\\s+been\\s+(?:directed|instructed|tasked|told)\\s+to|is\\s+to|shall))\\s+${CONTROL_ACTIONS.source}\\b(?=[\\s\\S]{0,80}(?:\\b(?:me|my\\s+(?:answer|performance|response)|the\\s+(?:answer|candidate|evaluation|feedback|output|response|result)|this\\s+(?:answer|candidate|response)|(?:all|every)\\s+(?:categories|category|dimension|dimensions))\\b|${SCORE_OUTCOME.source}|${ONE_SIDED_OUTCOME.source}))`,
  "iu"
);
const PASSIVE_SCORE_RESULT_CONTROL =
  /(?:^|[,;:()]|\b(?:also|and|but|plus|then)\b)\s*(?:(?:all|each|every|five|5)\s+)?(?:dimension\s+)?(?:ratings?|scores?)\b[\s\S]{0,32}\b(?:are|is)\s+to\s+be\s+(?:assigned|awarded|given|graded|marked|rated|returned|scored|set)\b/iu;
const ADDITIONAL_DELEGATED_REVIEWER_RESULT_CONTROL =
  /(?:^|[,;:()]|\b(?:also|and|but|plus|then)\b)\s*(?:i\s+(?:asked|told)\s+(?:the\s+)?(?:evaluator|judge|model|reviewer)\s+to|(?:the\s+)?(?:evaluator|judge|model|reviewer)\s+(?:is|was)\s+(?:being\s+)?asked\s+to|require\s+(?:the\s+)?(?:evaluator|judge|model|reviewer)\s+to)\s+(?:assign|award|give|grade|mark|rate|score|set)\b(?=[\s\S]{0,60}\b(?:me|my\s+(?:answer|performance|response)|the\s+(?:answer|candidate|evaluation|feedback|output|response|result)|this\s+(?:answer|candidate|response)|(?:all|every)\s+(?:categories|category|dimension|dimensions))\b)/iu;
const OUTCOME_NEUTRAL_QUALITY_METRIC =
  /\b(?:answer|response)\s+(?:quality|rate|rates|time|times|latency|latencies|metric|metrics)\b|\b(?:evaluation|evaluator|feedback|model(?:\s+output)?|reviewer)\s+(?:latency|quality|reliability|satisfaction)\s+(?:metric|rating|score|target)\b/iu;
const OUTCOME_NEUTRAL_PRODUCT_TARGET =
  /\b(?:customer|product|workflow)\s+(?:experience|flow|quality|state)\b/iu;
const OUTCOME_NEUTRAL_CALIBRATION_TARGET =
  /\b(?:evaluator|model|reviewer)\s+(?:agreement|calibration|quality|reliability)\s+(?:benchmark|target|test|testing)\b/iu;
const EVALUATOR_VOCATIVE =
  /^(?:assistant|evaluator|judge|model|reviewer)\s*[,;:\-]\s*/iu;
const VOCATIVE_SELF_OUTCOME_TARGET =
  /^(?:(?:my|the|this)\s+(?:answer|performance|response)|me)\b/iu;
const EMBEDDED_SELF_OUTCOME_CONTROL = new RegExp(
  `(?:[,;:()]|\\/(?!\\s*\\d)|\\b(?:also|and|but|plus|then)\\b)\\s*(?:(?:please|kindly)\\s+)?${CONTROL_ACTIONS.source}\\b[\\s\\S]{0,30}\\b(?:me|my\\s+(?:answer|performance|response)|the\\s+(?:answer|response)|this\\s+(?:answer|response))\\b`,
  "iu"
);
const EMBEDDED_SELF_SCORE_CONTROL =
  /\b(?:awarding|giving|grading|rating|scoring)\s+(?:me|my\s+(?:answer|performance|response))\b[\s\S]{0,20}\b(?:9|10|nine|ten)\b/iu;
const GERUND_SELF_OUTCOME_CONTROL =
  /^(?:approving|assessing|awarding|calling|endorsing|evaluating|grading|marking|praising|ranking|rating|scoring|treating)\s+(?:me|my\s+(?:answer|performance|response)|the\s+(?:answer|response)|this\s+(?:answer|response))\b/iu;
const GERUND_DIMENSION_OUTCOME_CONTROL =
  /^(?:assigning|awarding|declaring|grading|marking|rating|scoring|setting)\s+(?:all|every)\s+(?:categories|category|dimension|dimensions)\b/iu;
const OUTPUT_SCHEMA_SCORE_CONTROL =
  /^(?:for|in)\s+(?:(?:the|your)\s+)?(?:final\s+)?(?:evaluation|feedback|json|output|result)\b[\s\S]{0,24}\b(?:assign|set|use)\b/iu;
const RESULT_ACTION_DIRECTIVE_SOURCE = String.raw`(?:
  (?:respond|reply)\b[\s\S]{0,30}\b(?:feedback|rating|result|score|strengths?|with)\b
  |conclude\b[\s\S]{0,30}\b(?:candidate|hired|i|me|my\s+(?:answer|performance|response)|pass(?:ed)?|successful)\b
  |(?:generate|produce)\b[\s\S]{0,30}\b(?:critique|evaluation|feedback|improvements?|result|strengths?|weakness(?:es)?)\b
  |ensure\b[\s\S]{0,30}\b(?:(?:all|every)\s+(?:categories|category|dimension|dimensions)|(?:candidate|my\s+(?:answer|performance|response)|the\s+(?:evaluation|feedback|result)|this\s+(?:answer|response)))\b
)`.replace(/\s+/gu, "");
const RESULT_ACTION_CONTROL = new RegExp(
  `(?:^|[,;:()]|\\/(?!\\s*\\d)|\\b(?:also|and|but|plus|then)\\b)\\s*(?:(?:please|kindly)\\s+)?${RESULT_ACTION_DIRECTIVE_SOURCE}`,
  "iu"
);
const EMBEDDED_STANDARD_RESULT_CONTROL = new RegExp(
  `(?:[,;:()]|\\/(?!\\s*\\d)|\\b(?:also|and|but|plus|then)\\b)\\s*(?:(?:please|kindly)\\s+)?${CONTROL_ACTIONS.source}\\b[\\s\\S]{0,80}(?:${SCORE_OUTCOME.source}|${COERCIVE_QUALITY_OUTCOME.source}|${ONE_SIDED_OUTCOME.source}|${PASS_OR_HIRE_OUTCOME.source})`,
  "iu"
);
const EMBEDDED_DIRECT_RESULT_ACTION_CONTROL = new RegExp(
  `(?:[,;:()]|\\/(?!\\s*\\d)|\\b(?:also|and|but|plus|then)\\b)\\s*(?:(?:please|kindly)\\s+)?(?:assign|award|give|grade|hire|list|mark|mention|omit|output|pass|rate|recommend|return|score|set|suppress)\\b[\\s\\S]{0,80}(?:${SCORE_OUTCOME.source}|${COERCIVE_QUALITY_OUTCOME.source}|${ONE_SIDED_OUTCOME.source}|${PASS_OR_HIRE_OUTCOME.source})`,
  "iu"
);
const EMBEDDED_DECLARATIVE_RESULT_CONTROL =
  /(?:[,;:()]|\/(?!\s*\d)|\b(?:also|and|but|plus|then)\b)\s*(?:(?:the\s+)?only\s+valid\s+(?:evaluation|feedback|rating|result|score)\b|(?:my|this|the)\s+(?:answer|performance|response)\b[\s\S]{0,30}\b(?:deserves?|earns?|gets?|merits?|receives?|warrants?)\b)/iu;

function hasIndependentEmbeddedResultControl(clause: string): boolean {
  return (
    RESULT_ACTION_CONTROL.test(clause) ||
    EMBEDDED_DIRECT_RESULT_ACTION_CONTROL.test(clause) ||
    EMBEDDED_DECLARATIVE_RESULT_CONTROL.test(clause) ||
    EMBEDDED_EVALUATOR_OUTPUT_IMPERATIVE.test(clause) ||
    EMBEDDED_DIMENSION_SCORE_CONTROL.test(clause) ||
    EMBEDDED_SUFFIX_DEONTIC_CONTROL.test(clause) ||
    EMBEDDED_SELF_OUTCOME_CONTROL.test(clause) ||
    EMBEDDED_SELF_SCORE_CONTROL.test(clause) ||
    hasUnattributedDirectSelfOutcomeDeclaration(clause) ||
    EMBEDDED_DIRECT_RESULT_DECLARATION.test(clause) ||
    REQUIRED_REVIEWER_RESULT_CONTROL.test(clause) ||
    DELEGATED_REVIEWER_RESULT_CONTROL.test(clause) ||
    ADDITIONAL_DELEGATED_REVIEWER_RESULT_CONTROL.test(clause) ||
    PASSIVE_SCORE_RESULT_CONTROL.test(clause)
  );
}

function hasEmbeddedResultControl(clause: string): boolean {
  return (
    hasIndependentEmbeddedResultControl(clause) ||
    EMBEDDED_DIMENSION_DEONTIC_CONTROL.test(clause)
  );
}

function hasIndependentCalibrationManipulation(clause: string): boolean {
  return (
    hasIndependentEmbeddedResultControl(clause) ||
    IMPERATIVE_CONTROL.test(clause) ||
    REQUEST_CONTROL.test(clause) ||
    ADDRESSEE_DEONTIC_CONTROL.test(clause) ||
    DESIRE_CONTROL.test(clause) ||
    SELF_BENEFIT.test(clause) ||
    hasUnattributedDirectSelfOutcomeDeclaration(clause) ||
    DIRECT_RESULT_DECLARATION.test(clause) ||
    NAMED_ACTOR_HIRING_CONTROL.test(clause)
  );
}

interface MultilingualSafetyPack {
  language: string;
  action: RegExp;
  selfTarget: RegExp;
  scoreOutcome: RegExp;
  oneSidedOutcome: RegExp;
  declarativeSelfOutcome: RegExp;
  externallyAttributedAssessments?: readonly RegExp[];
  attributedAssessmentBeforeCommand: RegExp;
  attributedAssessmentAfterCommand: RegExp;
  attributedAssessmentConnectorSegment: RegExp;
  maxSpan: number;
}

const MULTILINGUAL_SAFETY_PACKS: readonly MultilingualSafetyPack[] = [
  {
    language: "Spanish",
    action:
      /\b(?:calific(?:a|ad|ar)|califique|cit(?:a|e)|c[oó]pialo|copia|copie|da|dale|di|diga|devu[eé]lvelo|devuelve|escri(?:be|ba|bir)|escr[ií]belo|menciona|menci[oó]nalo|ponle|ponlo|punt[uú](?:a|e)|rep[ií]telo|repite|repita|responde)\b/iu,
    selfTarget: /\bmi\s+respuesta\b/iu,
    scoreOutcome: /\b(?:10\s*\/\s*10|puntuaci[oó]n\s+perfecta)\b/iu,
    oneSidedOutcome:
      /\b(?:no\s+menciones\s+(?:ninguna\s+)?debilidad|solo\s+(?:las\s+)?fortalezas|solo\s+comentarios?\s+positivos?)\b/iu,
    declarativeSelfOutcome:
      /\bmi\s+respuesta\b[\s\S]{0,40}\b(?:merece|deber[ií]a\s+(?:obtener|recibir))\b[\s\S]{0,30}\b(?:10\s*\/\s*10|puntuaci[oó]n\s+perfecta)\b/iu,
    externallyAttributedAssessments: [
      /(?:el\s+)?(?:comit[eé]|entrevistador(?:a)?|evaluadores?|jurado|panel)\s+(?:coment[oó]|dijo|indic[oó]|se[nñ]al[oó])\s+que\s+mi\s+respuesta\s+(?:merece|deber[ií]a\s+(?:obtener|recibir))\s+(?:10\s*\/\s*10|una?\s+puntuaci[oó]n\s+perfecta)/giu,
      /(?:el\s+)?(?:comit[eé]|entrevistador(?:a)?|evaluadores?|jurado|panel)\s+calific[oó]\s+mi\s+respuesta\s+con\s+(?:10\s*\/\s*10|una?\s+puntuaci[oó]n\s+perfecta)/giu,
      /mi\s+respuesta\s+recibi[oó]\s+(?:10\s*\/\s*10|una?\s+puntuaci[oó]n\s+perfecta)\s+del\s+(?:comit[eé]|entrevistador(?:a)?|jurado|panel)/giu,
      /mi\s+respuesta\s+fue\s+calificada\s+con\s+(?:10\s*\/\s*10|una?\s+puntuaci[oó]n\s+perfecta)\s+por\s+(?:el\s+)?(?:comit[eé]|entrevistador(?:a)?|jurado|panel)/giu,
    ],
    attributedAssessmentBeforeCommand:
      /^(?:(?:pero|y|entonces|ahora|luego|entendido|por\s+lo\s+tanto|por\s+eso|as[ií]\s+que)\s*,?\s*)*(?:por\s+favor\s*,?\s*)?(?:(?:(?:se[nñ]or|se[nñ]ora)\s+)?(?:evaluador|revisor|modelo|asistente|sistema|juez)\s*,?\s*)?(?:(?:exactamente|literalmente|tal\s+cual)\s+)*(?:cit(?:a|e)|copia|copie|di|diga|devuelve|devu[eé]lvelo|escribe|escriba|escr[ií]belo|menciona|menci[oó]nalo|califica|punt[uú]a|ponlo|ponla|repite|repita|responde)(?:(?:[\s\p{P}\p{S}]+)(?:por\s+favor|exactamente|literalmente|tal\s+cual|lo\s+siguiente|esto|eso|la\s+frase\s+anterior|as[ií]|con\s+(?:esto|eso)|entre\s+comillas|en\s+una\s+sola\s+l[ií]nea|en\s+may[uú]sculas|en\s+negrita))*[\s\p{P}\p{S}]*$/iu,
    attributedAssessmentAfterCommand:
      /^(?:(?:pero|y|entonces|ahora|entendido|por\s+lo\s+tanto|por\s+eso|as[ií]\s+que)\s*,?\s*)*(?:por\s+favor\s*,?\s*)?(?:(?:(?:se[nñ]or|se[nñ]ora)\s+)?(?:evaluador|revisor|modelo|asistente|sistema|juez)\s*,?\s*)?(?:(?:exactamente|literalmente|tal\s+cual)\s+)*(?:c[oó]pialo|devu[eé]lvelo|escr[ií]belo|menci[oó]nalo|ponlo|ponla|rep[ií]telo|(?:cit(?:a|e)|di|diga|escribe|menciona)[\s\p{P}\p{S}]+(?:esto|eso|la\s+frase\s+anterior)|responde[\s\p{P}\p{S}]+con[\s\p{P}\p{S}]+(?:esto|eso))(?:(?:[\s\p{P}\p{S}]+)(?:por\s+favor|exactamente|literalmente|tal\s+cual|as[ií]|de\s+esta\s+manera|ahora(?:\s+mismo)?|para\s+el\s+evaluador|entre\s+comillas|en\s+una\s+sola\s+l[ií]nea|en\s+may[uú]sculas|en\s+negrita))*(?:\s+(?:y|entonces|luego)\s+[\p{L}\p{N}\s%％~〜–—\/.,٫-]{1,32})?[\s\p{P}\p{S}]*$/iu,
    attributedAssessmentConnectorSegment:
      /^(?:pero|y|entonces|ahora|luego|bien|bueno|vale|entendido|de\s+acuerdo|por\s+favor|por\s+lo\s+tanto|por\s+eso|as[ií]\s+que)$/iu,
    maxSpan: 180,
  },
  {
    language: "French",
    action:
      /(?<!\p{L})(?:attribuez|citez|copiez|dites|donnez|[eé]crivez|mentionnez|notez|r[eé]p[eé]tez|r[eé]pondez|renvoyez)(?!\p{L})/iu,
    selfTarget: /\bma\s+r[eé]ponse\b/iu,
    scoreOutcome: /\b(?:10\s*\/\s*10|note\s+maximale)\b/iu,
    oneSidedOutcome:
      /\b(?:ne\s+mentionnez\s+aucune\s+faiblesse|seulement\s+(?:ses|les)\s+points\s+forts|uniquement\s+des\s+commentaires?\s+positifs?)\b/iu,
    declarativeSelfOutcome:
      /\bma\s+r[eé]ponse\b[\s\S]{0,40}\b(?:m[eé]rite|devrait\s+(?:obtenir|recevoir))\b[\s\S]{0,30}\b(?:10\s*\/\s*10|note\s+maximale)\b/iu,
    externallyAttributedAssessments: [
      /(?:le\s+)?(?:comit[eé]|intervieweur|jury|panel|[eé]valuateurs?)\s+a\s+(?:d[eé]clar[eé]|dit|indiqu[eé])\s+que\s+ma\s+r[eé]ponse\s+(?:m[eé]rite|devrait\s+(?:obtenir|recevoir))\s+(?:10\s*\/\s*10|la\s+note\s+maximale)/giu,
      /(?:le\s+)?(?:comit[eé]|intervieweur|jury|panel|[eé]valuateurs?)\s+a\s+attribu[eé]\s+(?:10\s*\/\s*10|la\s+note\s+maximale)\s+[aà]\s+ma\s+r[eé]ponse/giu,
      /ma\s+r[eé]ponse\s+a\s+re[cç]u\s+(?:10\s*\/\s*10|la\s+note\s+maximale)\s+du\s+(?:comit[eé]|jury|panel)/giu,
      /ma\s+r[eé]ponse\s+a\s+[eé]t[eé]\s+not[eé]e\s+(?:10\s*\/\s*10|la\s+note\s+maximale)\s+par\s+(?:le\s+)?(?:comit[eé]|jury|panel)/giu,
    ],
    attributedAssessmentBeforeCommand:
      /^(?:(?:mais|et|puis|maintenant|ensuite|compris|donc|par\s+cons[eé]quent)\s*,?\s*)*(?:s['’]il\s+vous\s+pla[iî]t\s*,?\s*)?(?:(?:(?:cher|ch[eè]re)\s+)?(?:[eé]valuateur|relecteur|mod[eè]le|assistant|syst[eè]me|juge)\s*,?\s*)?(?:(?:exactement|litt[eé]ralement|mot\s+pour\s+mot)\s+)*(?:citez|copiez|dites|[eé]crivez(?:-le)?|mentionnez(?:-le)?|r[eé]p[eé]tez|r[eé]pondez|renvoyez(?:-le)?|notez|donnez)(?:(?:[\s\p{P}\p{S}]+)(?:s['’]il\s+vous\s+pla[iî]t|exactement|litt[eé]ralement|mot\s+pour\s+mot|ceci|cela|la\s+phrase\s+pr[eé]c[eé]dente|ainsi|avec\s+(?:ceci|cela)|entre\s+guillemets|sur\s+une\s+seule\s+ligne|en\s+majuscules|en\s+gras))*[\s\p{P}\p{S}]*$/iu,
    attributedAssessmentAfterCommand:
      /^(?:(?:mais|et|puis|maintenant|compris|donc|par\s+cons[eé]quent)\s*,?\s*)*(?:s['’]il\s+vous\s+pla[iî]t\s*,?\s*)?(?:(?:(?:cher|ch[eè]re)\s+)?(?:[eé]valuateur|relecteur|mod[eè]le|assistant|syst[eè]me|juge)\s*,?\s*)?(?:(?:exactement|litt[eé]ralement|mot\s+pour\s+mot)\s+)*(?:copiez-le|r[eé]p[eé]tez-le|renvoyez-le|notez-le|donnez-le|(?:citez|dites|[eé]crivez|mentionnez)[\s\p{P}\p{S}]+(?:ceci|cela|la\s+phrase\s+pr[eé]c[eé]dente)|r[eé]pondez[\s\p{P}\p{S}]+avec[\s\p{P}\p{S}]+(?:ceci|cela)|(?:[eé]crivez|mentionnez)-le)(?:(?:[\s\p{P}\p{S}]+)(?:s['’]il\s+vous\s+pla[iî]t|exactement|litt[eé]ralement|mot\s+pour\s+mot|ainsi|maintenant|entre\s+guillemets|sur\s+une\s+seule\s+ligne|en\s+majuscules|en\s+gras))*(?:\s+(?:et|puis|ensuite)\s+[\p{L}\p{N}\s%％~〜–—\/.,٫-]{1,32})?[\s\p{P}\p{S}]*$/iu,
    attributedAssessmentConnectorSegment:
      /^(?:mais|et|puis|maintenant|ensuite|bien|bon|compris|donc|d['’]accord|par\s+cons[eé]quent|s['’]il\s+vous\s+pla[iî]t)$/iu,
    maxSpan: 180,
  },
  {
    language: "German",
    action:
      /\b(?:antworte|bewerte|bewerten\s+sie|geben\s+sie|gib|kopiere|nenne|sag|sage|sagen\s+sie|schreibe|vergeben\s+sie|wiederhole|zitiere)\b/iu,
    selfTarget: /\bmein(?:e|er)\s+antwort\b/iu,
    scoreOutcome: /\b(?:10\s*\/\s*10|h[oö]chstpunktzahl)\b/iu,
    oneSidedOutcome:
      /\b(?:keine\s+schw[aä]chen|nur\s+positives\s+feedback|nur\s+st[aä]rken)\b/iu,
    declarativeSelfOutcome:
      /\bmeine\s+antwort\b[\s\S]{0,40}\b(?:verdient|sollte\s+(?:bekommen|erhalten))\b[\s\S]{0,30}\b(?:10\s*\/\s*10|h[oö]chstpunktzahl)\b/iu,
    externallyAttributedAssessments: [
      /(?:das\s+)?(?:gremium|komitee|panel)\s+(?:erkl[aä]rte|sagte)[,:]?\s+(?:dass\s+)?meine\s+antwort\s+(?:(?:verdient|sollte\s+(?:bekommen|erhalten))\s+(?:10\s*\/\s*10|die\s+h[oö]chstpunktzahl)|(?:10\s*\/\s*10|die\s+h[oö]chstpunktzahl)\s+(?:verdient|(?:bekommen|erhalten)\s+sollte))/giu,
      /(?:erkl[aä]rte|sagte)\s+(?:das\s+)?(?:gremium|komitee|panel)[,:]?\s+(?:dass\s+)?meine\s+antwort\s+(?:(?:verdient|sollte\s+(?:bekommen|erhalten))\s+(?:10\s*\/\s*10|die\s+h[oö]chstpunktzahl)|(?:10\s*\/\s*10|die\s+h[oö]chstpunktzahl)\s+(?:verdient|(?:bekommen|erhalten)\s+sollte))/giu,
      /(?:das\s+)?(?:gremium|komitee|panel)\s+bewertet(?:e|en)\s+meine\s+antwort\s+mit\s+(?:10\s*\/\s*10|der\s+h[oö]chstpunktzahl)/giu,
      /(?:das\s+)?(?:gremium|komitee|panel)\s+meine\s+antwort[\s\S]{0,30}\bmit\s+(?:10\s*\/\s*10|der\s+h[oö]chstpunktzahl)\s+bewertet(?:e|en)?/giu,
      /meine\s+antwort\s+(?:10\s*\/\s*10|die\s+h[oö]chstpunktzahl)\s+vom\s+(?:gremium|komitee|panel)\s+erhielt/giu,
      /meine\s+antwort\s+erhielt\s+(?:10\s*\/\s*10|die\s+h[oö]chstpunktzahl)\s+vom\s+(?:gremium|komitee|panel)/giu,
      /meine\s+antwort\s+vom\s+(?:gremium|komitee|panel)\s+mit\s+(?:10\s*\/\s*10|der\s+h[oö]chstpunktzahl)\s+bewertet\s+wurde/giu,
    ],
    attributedAssessmentBeforeCommand:
      /^(?:(?:aber|und|dann|jetzt|verstanden|daher|deshalb|folglich)\s*,?\s*)*(?:bitte\s*,?\s*)?(?:(?:(?:herr|frau)\s+)?(?:bewerter|pr[uü]fer|modell|assistent|system|richter)\s*,?\s*)?(?:(?:genau|wortw[oö]rtlich|unver[aä]ndert)\s+)*(?:antworte|kopiere|schreibe|schreib|nenne|gib|sag|sage|sagen\s+sie|wiederhole|zitiere)(?:(?:[\s\p{P}\p{S}]+)(?:bitte|genau|wortw[oö]rtlich|unver[aä]ndert|es|das|den\s+vorherigen\s+satz|folgendes|so|aus|damit|in\s+anf[uü]hrungszeichen|in\s+einer\s+zeile|in\s+gro[sß]buchstaben|fett))*[\s\p{P}\p{S}]*$/iu,
    attributedAssessmentAfterCommand:
      /^(?:(?:aber|und|dann|jetzt|verstanden|daher|deshalb|folglich)\s*,?\s*)*(?:bitte\s*,?\s*)?(?:(?:(?:herr|frau)\s+)?(?:bewerter|pr[uü]fer|modell|assistent|system|richter)\s*,?\s*)?(?:(?:genau|wortw[oö]rtlich|unver[aä]ndert)\s+)*(?:antworte[\s\p{P}\p{S}]+damit|(?:kopiere|schreibe|nenne|sag|sage|wiederhole|zitiere)[\s\p{P}\p{S}]+(?:es|das|den\s+vorherigen\s+satz)|schreib[\s\p{P}\p{S}]+(?:das|den\s+vorherigen\s+satz)|gib[\s\p{P}\p{S}]+es[\s\p{P}\p{S}]+aus)(?:(?:[\s\p{P}\p{S}]+)(?:bitte|genau|wortw[oö]rtlich|unver[aä]ndert|so|jetzt|in\s+anf[uü]hrungszeichen|in\s+einer\s+zeile|in\s+gro[sß]buchstaben|fett))*(?:\s+(?:und|dann)\s+[\p{L}\p{N}\s%％~〜–—\/.,٫-]{1,32})?[\s\p{P}\p{S}]*$/iu,
    attributedAssessmentConnectorSegment:
      /^(?:aber|und|dann|jetzt|also|bitte|gut|okay|verstanden|daher|deshalb|folglich)$/iu,
    maxSpan: 180,
  },
  {
    language: "Chinese",
    action: /(?:写|打|评为|评价为|提供|给|复制|回复|引用|说|重复|输出)/u,
    selfTarget: /我的\s*(?:回答|答案)/u,
    scoreOutcome: /(?:10\s*分|十\s*分|满分)/u,
    oneSidedOutcome:
      /(?:只\s*(?:写\s*优点|提供\s*正面\s*反馈|输出\s*正面\s*反馈))/u,
    declarativeSelfOutcome:
      /我的\s*(?:回答|答案)[\s\S]{0,20}(?:应该|应当|理应|必须)[\s\S]{0,12}(?:得|拿|获得)[\s\S]{0,8}(?:10\s*分|十\s*分|满分)/u,
    externallyAttributedAssessments: [
      /(?:评审(?:小组|团|委员会)?|面试官|考官|评委|委员会|客户|用户)(?:曾经|之前|上次)?(?:给|为|对)我的\s*(?:回答|答案)(?:打|给|评)(?:了|过)(?:个)?(?:10\s*分|十\s*分|满分)/gu,
      /(?:评审(?:小组|团|委员会)?|面试官|考官|评委|委员会)(?:说|表示|认为)我的\s*(?:回答|答案)(?:应该|应当|理应)(?:得|拿|获得)(?:10\s*分|十\s*分|满分)/gu,
      /(?:评审(?:小组|团|委员会)?|面试官|考官|评委|委员会)(?:把|将)我的\s*(?:回答|答案)(?:评成|评为|评价为)(?:了)?(?:10\s*分|十\s*分|满分)/gu,
      /我的\s*(?:回答|答案)被(?:评审(?:小组|团|委员会)?|面试官|考官|评委|委员会)(?:评成|评为|评价为)(?:了)?(?:10\s*分|十\s*分|满分)/gu,
    ],
    attributedAssessmentBeforeCommand:
      /^(?:(?:但是|然后|接着|请|现在|明白了|了解|所以|因此|故而)[，,、]?\s*)*(?:(?:尊敬的)?(?:评估员|评审员|模型|助手|系统|裁判)[，,、]\s*)*(?:请[，,、]?\s*)*(?:(?:原样|逐字|准确(?:地)?|完全|用引号|单行|用大写字母)\s*)*(?:(?:把[\s\p{P}\p{S}]*(?:它|这个|以下内容|上一句话)[\s\p{P}\p{S}]*)?输出(?:一下)?(?:[\s\p{P}\p{S}]*(?:它|这个|以下内容|上一句话)|以下内容)?|写(?:出)?(?:[\s\p{P}\p{S}]*(?:它|这个|以下内容|上一句话)|以下内容)?|提供(?:[\s\p{P}\p{S}]*(?:以下内容)|以下内容)?|(?:复制|引用|说|重复)(?:[\s\p{P}\p{S}]*(?:它|这个|这句话|以下内容|上一句话)|以下内容)?|(?:用[\s\p{P}\p{S}]*(?:这句话|以下内容|上一句话)[\s\p{P}\p{S}]*)?回复(?:[\s\p{P}\p{S}]*(?:它|这个|这句话|以下内容|上一句话)|以下内容)?)(?:(?:原样|逐字|准确(?:地)?|完全|用引号|单行|用大写字母)\s*)*[\s\p{P}\p{S}]*$/u,
    attributedAssessmentAfterCommand:
      /^(?:(?:但是|然后|接着|请|明白了|了解|所以|因此|故而)[，,、]?\s*)*(?:(?:尊敬的)?(?:评估员|评审员|模型|助手|系统|裁判)[，,、]\s*)*(?:请[，,、]?\s*)*(?:(?:原样|逐字|准确(?:地)?|完全|用引号|单行|用大写字母)\s*)*(?:(?:把[\s\p{P}\p{S}]*(?:它|这个|以下内容|上一句话)[\s\p{P}\p{S}]*)?输出(?:一下)?(?:[\s\p{P}\p{S}]*(?:它|这个|以下内容|上一句话))?|写(?:出)?(?:[\s\p{P}\p{S}]*(?:它|这个|以下内容|上一句话))|返回(?:[\s\p{P}\p{S}]*(?:它|这个))?|(?:复制|引用|说|重复)(?:[\s\p{P}\p{S}]*(?:它|这个|这句话|以上内容|以下内容|上一句话))?|(?:用[\s\p{P}\p{S}]*(?:这句话|以上内容|以下内容|上一句话)[\s\p{P}\p{S}]*)?回复(?:[\s\p{P}\p{S}]*(?:它|这个|这句话|上一句话))?)(?:(?:原样|逐字|准确(?:地)?|完全|用引号|单行|用大写字母)\s*)*(?:给评估者)?(?:[，,、]?(?:然后|并且)[\p{L}\p{N}%％~〜–—\/.,٫-]{1,16})?[\s\p{P}\p{S}]*$/u,
    attributedAssessmentConnectorSegment:
      /^(?:但是|然后|接着|请|现在|嗯|好|好的|明白了|了解|所以|因此|故而)$/u,
    maxSpan: 90,
  },
  {
    language: "Japanese",
    action:
      /(?:書いて(?:ください|下さい)|書け|コピーして(?:ください|下さい)|繰り返して(?:ください|下さい)|回答して(?:ください|下さい)|返信して(?:ください|下さい)|言って(?:ください|下さい)|引用して(?:ください|下さい)|出力して(?:ください|下さい)|(?:10\s*点|満点)にして(?:ください|下さい|[、,]|$)|(?:つけて|付けて|評価して|採点して)(?:ください|下さい))/u,
    selfTarget: /私の\s*(?:回答|答え)/u,
    scoreOutcome: /(?:10\s*点|十\s*点|満点)/u,
    oneSidedOutcome:
      /(?:改善点\s*は\s*書かない|肯定的な\s*フィードバック\s*だけ|長所\s*だけ)/u,
    declarativeSelfOutcome:
      /私の\s*(?:回答|答え)[\s\S]{0,12}(?:10\s*点|十\s*点|満点)[\s\S]{0,12}(?:で\s*ある\s*べき|であるべき|の\s*はず)/u,
    externallyAttributedAssessments: [
      /(?:審査員|面接官|評価者)(?:は|が)私の\s*(?:回答|答え)(?:は|が)?(?:10\s*点|十\s*点|満点)(?:で\s*ある\s*べき|であるべき|の\s*はず)(?:だ|です)?と(?:言いました|述べました)/gu,
      /(?:審査員|面接官|評価者)(?:は|が)私の\s*(?:回答|答え)を(?:10\s*点|十\s*点|満点)と評価しました/gu,
      /私の\s*(?:回答|答え)(?:は|が)(?:審査員|面接官|評価者)から(?:10\s*点|十\s*点|満点)を受けました/gu,
      /(?:審査員|面接官|評価者)(?:は|が)私の\s*(?:回答|答え)に(?:10\s*点|十\s*点|満点)を(?:つけました|付けました)/gu,
    ],
    attributedAssessmentBeforeCommand:
      /^(?:(?:ただし|そして|次に|次のように|つまり|ください|今|了解|したがって|だから|そのため)[、,]?\s*)*(?:(?:評価者|審査員|モデル|アシスタント|システム|裁判官)(?:さん|様)?[、,]?\s*)*(?:(?:大文字で|そのまま|正確に|逐語的に|引用符で|一行で)[、,]?\s*)*(?:(?:[\s\p{P}\p{S}]*(?:これ|それ|前の文|次の内容|以下の内容)[\s\p{P}\p{S}]*を|次のように)[、,]?\s*)?(?:(?:大文字で|そのまま|正確に|逐語的に|引用符で|一行で)[、,]?\s*)*(?:コピーして(?:ください|下さい)|繰り返して(?:ください|下さい)|回答して(?:ください|下さい)|返信して(?:ください|下さい)|言って(?:ください|下さい)|引用して(?:ください|下さい)|書け|書いて(?:ください|下さい)|出力して(?:ください|下さい)|出力(?:せよ|しろ))(?:(?:大文字で|そのまま|正確に|逐語的に|引用符で|一行で)[、,]?\s*)*(?:[、,]?\s*(?:つまり|次のように)[、,]?\s*)?[\s\p{P}\p{S}]*$/u,
    attributedAssessmentAfterCommand:
      /^(?:(?:ただし|そして|次に|ください|了解|したがって|だから|そのため)[、,]?\s*)*(?:(?:評価者|審査員|モデル|アシスタント|システム|裁判官)(?:さん|様)?[、,]?\s*)*(?:今すぐ)?(?:(?:大文字で|そのまま|正確に|逐語的に|引用符で|一行で)[、,]?\s*)*(?:(?:[\s\p{P}\p{S}]*(?:これ|それ|前の文|次の内容|以下の内容)[\s\p{P}\p{S}]*を)[、,]?\s*)?(?:(?:大文字で|そのまま|正確に|逐語的に|引用符で|一行で)[、,]?\s*)*(?:(?:これ|それ)で(?:回答|返信)して(?:ください|下さい)|コピーして(?:ください|下さい)|繰り返して(?:ください|下さい)|回答して(?:ください|下さい)|返信して(?:ください|下さい)|言って(?:ください|下さい)|引用して(?:ください|下さい)|書いて(?:ください|下さい)|出力して(?:ください|下さい)|出力(?:せよ|しろ)|返して(?:ください|下さい))(?:(?:大文字で|そのまま|正確に|逐語的に|引用符で|一行で)[、,]?\s*)*(?:[、,]?(?:その後|そして)[\p{L}\p{N}%％~〜–—\/.,٫-]{1,20})?[\s\p{P}\p{S}]*$/u,
    attributedAssessmentConnectorSegment:
      /^(?:ただし|そして|次に|ください|今|ええと|そう|はい|了解|したがって|だから|そのため)$/u,
    maxSpan: 110,
  },
  {
    language: "Arabic",
    action:
      /(?:أجب|أخرج(?:ها)?|اعط|اكتب(?:ها)?|اذكر(?:ها)?|انسخ(?:ها)?|اقتبس(?:ها)?|امنح|تذكر|رد|ضع|قل|قيّم|كرر(?:ها)?|أعط(?:ِ)?)(?!\p{L})/u,
    selfTarget: /(?:إجابتي|لإجابتي)/u,
    scoreOutcome: /(?:10\s+من\s+10|الدرجة\s+الكاملة)/u,
    oneSidedOutcome:
      /(?:ملاحظات\s+إيجابية\s+فقط|نقاط\s+القوة\s+فقط|ولا\s+تذكر\s+أي\s+نقاط\s+ضعف)/u,
    declarativeSelfOutcome:
      /(?:إجابتي|لإجابتي)[\s\S]{0,40}(?:تستحق|ينبغي\s+أن\s+تحصل\s+على)[\s\S]{0,30}(?:10\s+من\s+10|الدرجة\s+الكاملة)/u,
    externallyAttributedAssessments: [
      /(?:و\s*)?(?:قال|قالت|ذكرت)\s+(?:اللجنة|المقابلة|هيئة\s+التحكيم)\s+(?:إن|أن)\s+إجابتي\s+(?:تستحق|ينبغي\s+أن\s+تحصل\s+على)\s+(?:10\s+من\s+10|الدرجة\s+الكاملة)/gu,
      /(?:و\s*)?(?:قيّمت|قيمت)\s+(?:اللجنة|المقابلة|هيئة\s+التحكيم)\s+إجابتي\s+(?:10\s+من\s+10|الدرجة\s+الكاملة)/gu,
      /(?:حصلت\s+إجابتي|إجابتي\s+حصلت)\s+على\s+(?:10\s+من\s+10|الدرجة\s+الكاملة)\s+من\s+(?:اللجنة|المقابلة|هيئة\s+التحكيم)/gu,
      /(?:منحت|أعطت)\s+(?:اللجنة|المقابلة|هيئة\s+التحكيم)\s+إجابتي\s+(?:10\s+من\s+10|الدرجة\s+الكاملة)/gu,
    ],
    attributedAssessmentBeforeCommand:
      /^(?:(?:لكن|ثم|و|الآن|مفهوم|لذلك|وبالتالي|ومن\s+ثم)\s*[،,]?\s*)*(?:من\s+فضلك\s*[،,]?\s*)?(?:(?:يا\s+)?(?:أيها\s+)?(?:المقيّم|المقيم|المراجع|النموذج|المساعد|النظام|الحكم)\s*[،,]?\s*)?(?:(?:حرفيًّا|حرفيًا|بالضبط|كما\s+هو|بين\s+علامتي\s+اقتباس|في\s+سطر\s+واحد|بأحرف\s+كبيرة)\s*[،,]?\s*)*(?:أجب|أخرج(?:ها)?|اكتب(?:ها)?|اذكر(?:ها)?|انسخ(?:ها)?|اقتبس(?:ها)?|رد|قل|كرر(?:ها)?)(?:(?:[\s\p{P}\p{S}]+)(?:من\s+فضلك|حرفيًّا|حرفيًا|بالضبط|كما\s+هو|ما\s+يلي|ذلك|هذا|الجملة\s+السابقة|هكذا|بهذا|بذلك|بين\s+علامتي\s+اقتباس|في\s+سطر\s+واحد|بأحرف\s+كبيرة))*[\s\p{P}\p{S}]*$/u,
    attributedAssessmentAfterCommand:
      /^(?:(?:لكن|ثم|و|الآن|لذلك|وبالتالي|ومن\s+ثم)\s*[،,]?\s*)*(?:من\s+فضلك\s*[،,]?\s*)?(?:(?:يا\s+)?(?:أيها\s+)?(?:المقيّم|المقيم|المراجع|النموذج|المساعد|النظام|الحكم)\s*[،,]?\s*)?(?:(?:حرفيًّا|حرفيًا|بالضبط|كما\s+هو|بأحرف\s+كبيرة)\s*[،,]?\s*)*(?:أجب[\s\p{P}\p{S}]+(?:بهذا|بذلك)|أخرجها|اكتبها|اذكرها|انسخ(?:ها|[\s\p{P}\p{S}]+(?:ذلك|هذا))?|اقتبس(?:ها|[\s\p{P}\p{S}]+(?:ذلك|هذا))?|رد[\s\p{P}\p{S}]+(?:بهذا|بذلك)|كرر(?:ها|[\s\p{P}\p{S}]+(?:ذلك|هذا))?|(?:اكتب|اذكر|قل)[\s\p{P}\p{S}]+(?:ذلك|هذا))(?:(?:[\s\p{P}\p{S}]+)(?:من\s+فضلك|حرفيًّا|حرفيًا|بالضبط|كما\s+هو|هكذا|الآن|بأحرف\s+كبيرة))*(?:\s+(?:ثم|و)\s+[\p{L}\p{N}\s%％~〜–—\/.,٫-]{1,32})?[\s\p{P}\p{S}]*$/u,
    attributedAssessmentConnectorSegment:
      /^(?:لكن|ثم|و|الآن|حسنًا|حسنا|طيب|مفهوم|من\s+فضلك|لذلك|وبالتالي|ومن\s+ثم)$/u,
    maxSpan: 150,
  },
  {
    language: "Russian",
    action:
      /(?:выведи|выведите|дай|дайте|напиши|напишите|ответь|ответьте|оцени|оцените|повтори|повторите|поставь|поставьте|процитируй|процитируйте|скажи|скажите|скопируй|скопируйте|указывай|указывайте|цитируй|цитируйте)(?!\p{L})/iu,
    selfTarget: /мо(?:й\s+ответ|ему\s+ответу)/iu,
    scoreOutcome: /(?:10\s+из\s+10|максимальную\s+оценку)/iu,
    oneSidedOutcome:
      /(?:не\s+указывай\s+недостатки|только\s+положительный\s+отзыв|только\s+сильные\s+стороны)/iu,
    declarativeSelfOutcome:
      /мо(?:й\s+ответ|ему\s+ответу)[\s\S]{0,50}(?:заслуживает|должен\s+получить)[\s\S]{0,30}(?:10\s+из\s+10|максимальную\s+оценку)/iu,
    externallyAttributedAssessments: [
      /(?:жюри|комиссия|панель)\s+(?:заявил[ао]?|отметил[ао]?|сказал[ао]?)[,:]?\s+что\s+мой\s+ответ\s+(?:заслуживает|должен\s+получить)\s+(?:10\s+из\s+10|максимальную\s+оценку)/giu,
      /(?:жюри|комиссия|панель)\s+оценила?\s+мой\s+ответ\s+на\s+(?:10\s+из\s+10|максимальную\s+оценку)/giu,
      /мой\s+ответ\s+получил\s+(?:10\s+из\s+10|максимальную\s+оценку)\s+от\s+(?:жюри|комиссии|панели)/giu,
      /моему\s+ответу\s+поставил[ао]?\s+(?:10\s+из\s+10|максимальную\s+оценку)\s+(?:жюри|комиссия|панель)/giu,
    ],
    attributedAssessmentBeforeCommand:
      /^(?:(?:но|и|затем|теперь|понятно|поэтому|следовательно|таким\s+образом)\s*,?\s*)*(?:пожалуйста\s*,?\s*)?(?:(?:(?:уважаем(?:ый|ая))\s+)?(?:оценщик|рецензент|модель|ассистент|система|судья)\s*,?\s*)?(?:(?:точно|дословно|без\s+изменений|в\s+кавычках|одной\s+строкой|заглавными\s+буквами)\s*,?\s*)*(?:выведи(?:те)?|напиши(?:те)?|ответь(?:те)?|повтори(?:те)?|процитируй(?:те)?|скажи(?:те)?|скопируй(?:те)?|указывай(?:те)?|цитируй(?:те)?)(?:(?:[\s\p{P}\p{S}]+)(?:пожалуйста|точно|дословно|без\s+изменений|это|его|предыдущее\s+предложение|следующее|так|этим|в\s+кавычках|одной\s+строкой|заглавными\s+буквами))*[\s\p{P}\p{S}]*$/iu,
    attributedAssessmentAfterCommand:
      /^(?:(?:но|и|затем|теперь|поэтому|следовательно|таким\s+образом)\s*,?\s*)*(?:пожалуйста\s*,?\s*)?(?:(?:(?:уважаем(?:ый|ая))\s+)?(?:оценщик|рецензент|модель|ассистент|система|судья)\s*,?\s*)?(?:(?:точно|дословно|без\s+изменений|заглавными\s+буквами)\s*,?\s*)*(?:(?:выведи|напиши|повтори|процитируй|скажи|скопируй|цитируй)(?:те)?[\s\p{P}\p{S}]+(?:это|его)|ответь(?:те)?[\s\p{P}\p{S}]+(?:этим|так))(?:(?:[\s\p{P}\p{S}]+)(?:пожалуйста|точно|дословно|без\s+изменений|так|сейчас|заглавными\s+буквами))*(?:\s+(?:и|затем)\s+[\p{L}\p{N}\s%％~〜–—\/.,٫-]{1,32})?[\s\p{P}\p{S}]*$/iu,
    attributedAssessmentConnectorSegment:
      /^(?:но|и|затем|теперь|итак|ладно|хорошо|понятно|пожалуйста|поэтому|следовательно|таким\s+образом)$/iu,
    maxSpan: 180,
  },
];

const ATTRIBUTED_ASSESSMENT_PURPOSE_START = new Map<string, RegExp>([
  ["Spanish", /^(?:(?:pero|y|entonces)\s+)*(?:para\b|a\s+fin\s+de\b)/iu],
  ["French", /^(?:(?:mais|et|puis)\s+)*(?:pour\b|afin\s+d['’])/iu],
  ["German", /^(?:(?:aber|und|dann)\s+)*(?:zur\b|zum\b|um\b)/iu],
  ["Chinese", /^(?:(?:但是|然后|接着))*(?:为了|为)/u],
  ["Japanese", /(?:ため|ように)/u],
  ["Arabic", /^(?:(?:لكن|ثم|و)\s+)*(?:ل|من\s+أجل)/u],
  ["Russian", /^(?:(?:но|и|затем)\s+)*(?:для\s+|чтобы\s+|во\s+избежание\s+)/iu],
]);

const ATTRIBUTED_ASSESSMENT_NARRATION_INTERRUPT = new Map<string, RegExp>([
  ["Spanish", /(?:etiqueta|bot[oó]n|dec[ií]a|mostraba|era)\b/iu],
  [
    "French",
    /(?:[eé]tiquette|bouton|libell[eé]|disait|indiquait|[eé]tait)\b/iu,
  ],
  ["German", /(?:beschriftung|etikett|lautete|stand|war)\b/iu],
  ["Chinese", /(?:标签|按钮|写着|显示)/u],
  ["Japanese", /(?:ラベル|ボタン|表示|書かれ)/u],
  ["Arabic", /(?:نص\s+الزر|ملصق|تسمية|كان\s+نص)/u],
  ["Russian", /(?:на\s+ярлыке|текст\s+кнопки|надпись|было)/iu],
]);

const ATTRIBUTED_ASSESSMENT_EXPLICIT_ANAPHOR = new Map<string, RegExp>([
  [
    "Spanish",
    /^(?:por\s+favor\s*,?\s*)?(?:(?:exactamente|literalmente|tal\s+cual|entre\s+comillas|en\s+una\s+sola\s+l[ií]nea|en\s+may[uú]sculas|en\s+negrita)\s+)*(?:(?:escribe|escriba)\s+(?:la\s+)?(?:frase|oraci[oó]n)\s+(?:anterior|precedente|de\s+arriba)|(?:cita|cite|copia|copie|di|diga|devuelve|escribe|escriba|imprime|imprima|menciona|proporciona|proporcione)\s+(?:esa|esta|la)\s+(?:puntuaci[oó]n|nota)|responde\s+con\s+(?:esa|esta|la)\s+(?:puntuaci[oó]n|nota))(?:\s+(?:por\s+favor|exactamente|literalmente|tal\s+cual|entre\s+comillas|en\s+una\s+sola\s+l[ií]nea|en\s+may[uú]sculas|en\s+negrita))*$/iu,
  ],
  [
    "French",
    /^(?:s['’]il\s+vous\s+pla[iî]t\s*,?\s*)?(?:(?:exactement|litt[eé]ralement|mot\s+pour\s+mot|entre\s+guillemets|sur\s+une\s+seule\s+ligne|en\s+majuscules|en\s+gras)\s+)*(?:(?:[eé]crivez|mentionnez)\s+la\s+phrase\s+(?:pr[eé]c[eé]dente|ci-dessus|d['’]avant)|(?:citez|copiez|dites|donnez|[eé]crivez|fournissez|imprimez|mentionnez|renvoyez)\s+(?:cette\s+note|ce\s+score)|r[eé]pondez\s+avec\s+(?:cette\s+note|ce\s+score))(?:\s+(?:s['’]il\s+vous\s+pla[iî]t|exactement|litt[eé]ralement|mot\s+pour\s+mot|entre\s+guillemets|sur\s+une\s+seule\s+ligne|en\s+majuscules|en\s+gras))*$/iu,
  ],
  [
    "German",
    /^(?:bitte\s*,?\s*)?(?:(?:genau|wortw[oö]rtlich|unver[aä]ndert|in\s+anf[uü]hrungszeichen|in\s+einer\s+zeile|in\s+gro[sß]buchstaben|fett)\s+)*(?:(?:schreibe|schreib)\s+(?:den\s+(?:vorherigen|vorangegangenen|obigen)\s+satz|den\s+satz\s+oben)|(?:drucke|gib|kopiere|nenne|sag|sage|schreibe|schreib|zitiere)\s+(?:diese\s+punktzahl|diese\s+bewertung)|antworte\s+mit\s+(?:dieser\s+punktzahl|dieser\s+bewertung))(?:\s+(?:bitte|genau|wortw[oö]rtlich|unver[aä]ndert|in\s+anf[uü]hrungszeichen|in\s+einer\s+zeile|in\s+gro[sß]buchstaben|fett))*$/iu,
  ],
  [
    "Chinese",
    /^(?:请)?(?:(?:原样|逐字|准确(?:地)?|完全|用引号|单行|用大写字母)\s*)*(?:(?:输出|写出)(?:上一|上面那)句(?:话)?|(?:复制|打印|返回|说出|输出|写出|引用|提供|提到)(?:这个|该)(?:分数|评分)|用(?:这个|该)(?:分数|评分)回复)(?:(?:原样|逐字|准确(?:地)?|完全|用引号|单行|用大写字母)\s*)*$/u,
  ],
  [
    "Japanese",
    /^(?:(?:(?:前|上)の文|(?:その|この)点数)を(?:(?:大文字で|そのまま|正確に|逐語的に|引用符で|一行で)[、,]?\s*)*(?:コピーして|印刷して|引用して|書いて|出力して|提供して|言及して|言って)|(?:その|この)点数で(?:(?:大文字で|そのまま|正確に|逐語的に|引用符で|一行で)[、,]?\s*)*(?:回答して|返信して))(?:ください|下さい)(?:(?:大文字で|そのまま|正確に|逐語的に|引用符で|一行で)[、,]?\s*)*$/u,
  ],
  [
    "Arabic",
    /^(?:من\s+فضلك\s*[،,]?\s*)?(?:(?:حرفيًّا|حرفيًا|بالضبط|كما\s+هو|بين\s+علامتي\s+اقتباس|في\s+سطر\s+واحد|بأحرف\s+كبيرة)\s+)*(?:(?:اكتب|اذكر)\s+الجملة\s+(?:السابقة|أعلاه)|(?:أخرج|اذكر|انسخ|اكتب|اقتبس|اطبع|قدّم|قدم|قل)\s+(?:تلك|هذه)\s+الدرجة|أجب\s+(?:بهذه|بتلك)\s+الدرجة)(?:\s+(?:من\s+فضلك|حرفيًّا|حرفيًا|بالضبط|كما\s+هو|بين\s+علامتي\s+اقتباس|في\s+سطر\s+واحد|بأحرف\s+كبيرة))*$/u,
  ],
  [
    "Russian",
    /^(?:пожалуйста\s*,?\s*)?(?:(?:точно|дословно|без\s+изменений|в\s+кавычках|одной\s+строкой|заглавными\s+буквами)\s+)*(?:(?:напишите|выведите)\s+(?:предыдущее\s+предложение|предложение\s+выше)|(?:выведите|напечатайте|напишите|предоставьте|процитируйте|скажите|скопируйте|укажите)\s+(?:эту\s+оценку|этот\s+балл)|ответьте\s+(?:этой\s+оценкой|этим\s+баллом))(?:\s+(?:пожалуйста|точно|дословно|без\s+изменений|в\s+кавычках|одной\s+строкой|заглавными\s+буквами))*$/iu,
  ],
]);

const ENGLISH_THIRD_PARTY_SCORE_SOURCE = String.raw`(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)`;
const ENGLISH_SIMPLE_ATTRIBUTED_SCORE_REPORT = new RegExp(
  String.raw`\bmy\s+(?:answer|performance|response)\s+was\s+(?:a\s+)?(?:10\s*\/\s*10|ten\s+out\s+of\s+ten)\s+(?:according\s+to|per)\s+${ENGLISH_THIRD_PARTY_SCORE_SOURCE}\b`,
  "giu"
);
const ENGLISH_EXTERNALLY_ATTRIBUTED_SCORES: readonly RegExp[] = [
  ENGLISH_SIMPLE_ATTRIBUTED_SCORE_REPORT,
  /\bmy\s+(?:answer|performance|response)\s+was\s+(?:rated|scored)\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten)\s+by\s+(?!(?:me|myself)\b)(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewer|jury|panel|reviewers?)\b/giu,
  /\b(?:the\s+)?(?:committee|interviewer|jury|panel|reviewers?)\s+(?:rated|scored)\s+my\s+(?:answer|performance|response)\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten)\b/giu,
  /\bmy\s+(?:answer|performance|response)\s+(?:got|received)\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten)\s+from\s+(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)\b/giu,
  /\bmy\s+(?:answer|performance|response)\s+earned\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten)\s+(?:according\s+to|from|per)\s+(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)\b/giu,
  /\baccording\s+to\s+(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)\s*,?\s*my\s+(?:answer|performance|response)\s+earned\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten)\b/giu,
  /\b(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)\s+(?:awarded|gave)\s+my\s+(?:answer|performance|response)\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten)\b/giu,
  /\bmy\s+(?:answer|performance|response)\s+was\s+(?:awarded|given)\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten)\s+by\s+(?!(?:me|myself)\b)(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)\b/giu,
  /\bmy\s+(?:answer|performance|response)\s+(?:got|received)\s+(?:(?:a\s+)?perfect\s+score|(?:a\s+)?(?:score|rating)\s+of\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten))\s+from\s+(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)\b/giu,
  /\b(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)\s+(?:assigned|gave)\s+my\s+(?:answer|performance|response)\s+(?:(?:a\s+)?perfect\s+score|(?:a\s+)?(?:score|rating)\s+of\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten))\b/giu,
  /\b(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)\s+marked\s+my\s+(?:answer|performance|response)\s+(?:(?:10\s*\/\s*10|ten\s+out\s+of\s+ten)|(?:a\s+)?perfect\s+score|(?:a\s+)?(?:score|rating)\s+of\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten))\b/giu,
  /\b(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)\s+awarded\s+(?:(?:a\s+)?perfect\s+score|(?:a\s+)?(?:score|rating)\s+of\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten))\s+to\s+my\s+(?:answer|performance|response)\b/giu,
  /\b(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)\s+evaluated\s+my\s+(?:answer|performance|response)\s+as\s+(?:(?:10\s*\/\s*10|ten\s+out\s+of\s+ten)|(?:a\s+)?perfect\s+score|(?:a\s+)?(?:score|rating)\s+of\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten))\b/giu,
  /\bmy\s+(?:answer|performance|response)\s+was\s+(?:assigned|awarded|evaluated|given|marked)\s+(?:(?:as\s+)?(?:10\s*\/\s*10|ten\s+out\s+of\s+ten)|(?:a\s+)?perfect\s+score|(?:a\s+)?(?:score|rating)\s+of\s+(?:10\s*\/\s*10|ten\s+out\s+of\s+ten))\s+by\s+(?!(?:me|myself)\b)(?:(?:an?|our|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,4}(?:committee|interviewers?|jury|panel|reviewers?)\b/giu,
];
const ENGLISH_ATTRIBUTED_SCORE_ANAPHOR =
  /^(?:(?:but|and|then|now|understood|therefore|so)\s*,?\s*)*(?:please\s*,?\s*)?(?:(?:copy|echo|give|mention|output|print|provide|quote|repeat|reproduce|return|say|state|use|write)\s+(?:that|this|the(?:\s+same)?|same)\s+(?:rating|score)|(?:answer|reply|respond)\s+(?:using|with)\s+(?:(?:that|this|the(?:\s+same)?|same)\s+(?:rating|score)|it|that|this)|(?:copy|echo|give|output|print|provide|quote|repeat|reproduce|return|say|state|write)\s+(?:it|that|this)|use\s+(?:it|that|this)\s+as\s+(?:the\s+)?(?:rating|result|score))(?:(?:\s+)(?:exactly|in\s+bold|in\s+quotes|on\s+one\s+line|please|verbatim))*$/iu;
const ENGLISH_ATTRIBUTED_ASSESSMENT_BEFORE_COMMAND =
  /^(?:(?:but|and|then|now|understood|therefore|so)\s*,?\s*)*(?:please\s*,?\s*)?(?:(?:copy|echo|output|print|quote|repeat|reproduce|return|say|state|write)(?:\s+(?:it|that|this|the\s+following))?|use\s+(?:it|that|this)\s+as\s+(?:the\s+)?(?:rating|result|score))(?:(?:\s+)(?:exactly|in\s+bold|in\s+quotes|on\s+one\s+line|please|verbatim))*$/iu;
const ENGLISH_ATTRIBUTED_ASSESSMENT_BRIDGE =
  /^(?:and|but|now|okay|please|so|then|therefore|understood)$/iu;
const ENGLISH_ATTRIBUTED_RESULT_SETTING_ANAPHOR =
  /^(?:(?:but|and|then|now|understood|therefore|so)\s*,?\s*)*(?:please\s*,?\s*)?make\s+(?:it|that|this)\s+(?:the\s+)?(?:rating|result|score)$/iu;

const ATTRIBUTED_ASSESSMENT_FORMATTING_PREFIX = new Map<string, RegExp>([
  ["Spanish", /^(?:(?:pero|y|entonces|ahora|luego)\s+)*(?:en\s+cursiva)$/iu],
  [
    "French",
    /^(?:(?:mais|et|puis|maintenant|ensuite)\s+)*(?:en\s+italique)$/iu,
  ],
  ["German", /^(?:(?:aber|und|dann|jetzt)\s+)*(?:kursiv)$/iu],
  ["Chinese", /^(?:(?:但是|然后|接着|现在)\s*)*(?:用斜体)$/u],
  ["Japanese", /^(?:(?:ただし|そして|次に|今)\s*)*(?:斜体で)$/u],
  ["Arabic", /^(?:(?:لكن|ثم|و|الآن)\s+)*(?:بخط\s+مائل)$/u],
  ["Russian", /^(?:(?:но|и|затем|теперь)\s+)*(?:курсивом)$/iu],
]);

const OPENING_QUOTE_AT_CONTEXT_END =
  /[\u00ab\u2018\u201c\u201e\u2039\u300c\u300e\u3010"']\s*$/u;
const BALANCED_QUOTE_PAIRS = new Map<string, string>([
  ['"', '"'],
  ["\u00ab", "\u00bb"],
  ["\u2039", "\u203a"],
  ["\u201c", "\u201d"],
  ["\u201e", "\u201c"],
  ["\u2018", "\u2019"],
  ["\u201a", "\u2018"],
  ["\u300c", "\u300d"],
  ["\u300e", "\u300f"],
  ["\u3010", "\u3011"],
  ["\u301d", "\u301e"],
]);

function projectExternallyAttributedAssessments(
  text: string,
  patterns: readonly RegExp[],
  pack: MultilingualSafetyPack
): { projection: string; removedAssessment: boolean } {
  const assessments = mergeTextSpans(
    patterns.flatMap((pattern) => getPatternSpans(text, pattern))
  );
  if (assessments.length === 0) {
    return { projection: text, removedAssessment: false };
  }

  for (let index = 0; index < assessments.length; index += 1) {
    const assessment = assessments[index];
    const previousEnd = assessments[index - 1]?.end ?? 0;
    const nextStart = assessments[index + 1]?.start ?? text.length;
    if (
      isAttributedAssessmentBeforeCommand(
        text.slice(previousEnd, assessment.start),
        pack
      ) ||
      isAttributedAssessmentAfterCommand(
        text.slice(assessment.end, nextStart),
        pack
      )
    ) {
      return { projection: text, removedAssessment: false };
    }
  }

  let cursor = 0;
  let projection = "";
  for (const assessment of assessments) {
    projection += text.slice(cursor, assessment.start);
    projection += " ".repeat(assessment.end - assessment.start);
    cursor = assessment.end;
  }
  projection += text.slice(cursor);
  return { projection, removedAssessment: true };
}

interface TextSpan {
  start: number;
  end: number;
}

function getPatternSpans(text: string, pattern: RegExp): TextSpan[] {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const spans: TextSpan[] = [];
  for (const match of text.matchAll(matcher)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length });
  }
  return spans;
}

function mergeTextSpans(spans: readonly TextSpan[]): TextSpan[] {
  const ordered = [...spans].sort(
    (left, right) => left.start - right.start || left.end - right.end
  );
  const merged: TextSpan[] = [];
  for (const span of ordered) {
    const previous = merged[merged.length - 1];
    if (!previous || span.start > previous.end) {
      merged.push({ ...span });
      continue;
    }
    previous.end = Math.max(previous.end, span.end);
  }
  return merged;
}

function hasUnattributedDirectSelfOutcomeDeclaration(text: string): boolean {
  const reports = mergeTextSpans(
    ENGLISH_EXTERNALLY_ATTRIBUTED_SCORES.flatMap((pattern) =>
      getPatternSpans(text, pattern)
    )
  );
  let projection = "";
  let cursor = 0;
  for (const report of reports) {
    projection += text.slice(cursor, report.start);
    projection += " ".repeat(report.end - report.start);
    cursor = report.end;
  }
  projection += text.slice(cursor);

  return (
    DIRECT_SELF_OUTCOME_DECLARATION.test(projection) ||
    EMBEDDED_DIRECT_SELF_OUTCOME_DECLARATION.test(projection)
  );
}

function normalizeStructuralSegment(text: string): string {
  return text
    .trim()
    .replace(/^[\s\p{P}\p{S}\p{Cf}]+|[\s\p{P}\p{S}\p{Cf}]+$/gu, "")
    .trim();
}

function matchesWholeSegment(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  const matches = pattern.test(normalizeStructuralSegment(text));
  pattern.lastIndex = 0;
  return matches;
}

function maskBalancedQuotedSpans(text: string): string {
  const masked = text.split("");
  for (let index = 0; index < text.length; index += 1) {
    const closingQuote = BALANCED_QUOTE_PAIRS.get(text[index]);
    if (!closingQuote) continue;
    const closingIndex = text.indexOf(closingQuote, index + 1);
    if (closingIndex < 0) continue;
    for (
      let maskedIndex = index;
      maskedIndex <= closingIndex;
      maskedIndex += 1
    ) {
      masked[maskedIndex] = " ";
    }
    index = closingIndex;
  }
  return masked.join("");
}

function isAttributedAssessmentBeforeCommand(
  prefix: string,
  pack: MultilingualSafetyPack
): boolean {
  const normalized = normalizeStructuralSegment(prefix);
  if (!normalized) return false;
  const structuralWindow = normalized.slice(-Math.max(pack.maxSpan, 192));
  const maskedStructuralWindow = normalizeStructuralSegment(
    maskBalancedQuotedSpans(prefix)
  ).slice(-Math.max(pack.maxSpan, 192));

  const candidates = new Set<string>([structuralWindow]);
  for (const boundary of maskedStructuralWindow.matchAll(
    /[,;:，、：،؛—–-]+\s*/gu
  )) {
    const start = (boundary.index ?? 0) + boundary[0].length;
    if (start < maskedStructuralWindow.length) {
      candidates.add(maskedStructuralWindow.slice(start));
    }
  }
  const frontedContextPattern = ATTRIBUTED_ASSESSMENT_PURPOSE_START.get(
    pack.language
  );
  const narrationInterrupt = ATTRIBUTED_ASSESSMENT_NARRATION_INTERRUPT.get(
    pack.language
  );
  if (frontedContextPattern) {
    for (const structuralCandidate of [...candidates]) {
      for (const action of getPatternSpans(structuralCandidate, pack.action)) {
        const context = structuralCandidate.slice(0, action.start).trim();
        const actionStartsQuotedLabel =
          OPENING_QUOTE_AT_CONTEXT_END.test(context);
        frontedContextPattern.lastIndex = 0;
        const hasFrontedCommandContext =
          frontedContextPattern.test(context) &&
          !actionStartsQuotedLabel &&
          !(narrationInterrupt?.test(context) ?? false);
        frontedContextPattern.lastIndex = 0;
        if (action.start === 0 || hasFrontedCommandContext) {
          candidates.add(structuralCandidate.slice(action.start));
        }
      }
    }
  }

  const formattingPrefix = ATTRIBUTED_ASSESSMENT_FORMATTING_PREFIX.get(
    pack.language
  );
  return [...candidates].some(
    (candidate) =>
      matchesWholeSegment(pack.attributedAssessmentBeforeCommand, candidate) ||
      (formattingPrefix
        ? matchesWholeSegment(formattingPrefix, candidate)
        : false)
  );
}

function isAttributedAssessmentAfterCommand(
  suffix: string,
  pack: MultilingualSafetyPack
): boolean {
  const normalized = normalizeStructuralSegment(suffix);
  const maxStructuralLength = Math.max(pack.maxSpan, 192);
  if (normalized.length > maxStructuralLength) return false;
  return (
    normalized.length > 0 &&
    (matchesWholeSegment(pack.attributedAssessmentAfterCommand, normalized) ||
      matchesWholeSegment(
        ATTRIBUTED_ASSESSMENT_EXPLICIT_ANAPHOR.get(pack.language) ?? /$a/u,
        normalized
      ))
  );
}

function consumeFollowingBridgeSegments(
  segments: readonly { segment: string }[],
  start: number,
  pack: MultilingualSafetyPack
): number {
  let index = start;
  while (index < segments.length) {
    const normalized = normalizeStructuralSegment(segments[index].segment);
    const isBridge = matchesWholeSegment(
      pack.attributedAssessmentConnectorSegment,
      normalized
    );
    if (!isBridge) break;
    index += 1;
  }
  return index;
}

function consumePrecedingBridgeSegments(
  segments: readonly { segment: string }[],
  start: number,
  pack: MultilingualSafetyPack
): number {
  let index = start;
  while (index >= 0) {
    const normalized = normalizeStructuralSegment(segments[index].segment);
    const isBridge = matchesWholeSegment(
      pack.attributedAssessmentConnectorSegment,
      normalized
    );
    if (!isBridge) break;
    index -= 1;
  }
  return index;
}

function matchesAnyWholeSegment(
  patterns: readonly RegExp[],
  text: string
): boolean {
  return patterns.some((pattern) => matchesWholeSegment(pattern, text));
}

function matchesCrossLanguageAttributedAssessmentBeforeCommand(
  text: string
): boolean {
  return (
    matchesWholeSegment(ENGLISH_ATTRIBUTED_ASSESSMENT_BEFORE_COMMAND, text) ||
    MULTILINGUAL_SAFETY_PACKS.some((pack) =>
      isAttributedAssessmentBeforeCommand(text, pack)
    )
  );
}

function hasCrossLanguageAttributedAnaphorControl(text: string): boolean {
  const segments = text
    .split(/[.!?;。！？؛]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const attributedAssessmentPatterns = [
    ...ENGLISH_EXTERNALLY_ATTRIBUTED_SCORES,
    ...MULTILINGUAL_SAFETY_PACKS.flatMap(
      (pack) => pack.externallyAttributedAssessments ?? []
    ),
  ];
  const attributedAnaphorPatterns = [
    ENGLISH_ATTRIBUTED_SCORE_ANAPHOR,
    ENGLISH_ATTRIBUTED_RESULT_SETTING_ANAPHOR,
    ...MULTILINGUAL_SAFETY_PACKS.map(
      (pack) => pack.attributedAssessmentAfterCommand
    ),
    ...ATTRIBUTED_ASSESSMENT_EXPLICIT_ANAPHOR.values(),
  ];
  const bridgePatterns = [
    ENGLISH_ATTRIBUTED_ASSESSMENT_BRIDGE,
    ...MULTILINGUAL_SAFETY_PACKS.map(
      (pack) => pack.attributedAssessmentConnectorSegment
    ),
  ];
  const reportsBySegment = segments.map((segment) =>
    mergeTextSpans(
      attributedAssessmentPatterns.flatMap((pattern) =>
        getPatternSpans(segment, pattern)
      )
    )
  );

  for (let index = 0; index < segments.length; index += 1) {
    const reports = reportsBySegment[index];
    for (let reportIndex = 0; reportIndex < reports.length; reportIndex += 1) {
      const report = reports[reportIndex];
      const previousReportEnd = reports[reportIndex - 1]?.end ?? 0;
      const nextReportStart =
        reports[reportIndex + 1]?.start ?? segments[index].length;
      if (
        matchesCrossLanguageAttributedAssessmentBeforeCommand(
          segments[index].slice(previousReportEnd, report.start)
        )
      ) {
        return true;
      }
      if (
        matchesAnyWholeSegment(
          attributedAnaphorPatterns,
          segments[index].slice(report.end, nextReportStart)
        )
      ) {
        return true;
      }
    }

    if (reports.length === 0) continue;
    let precedingIndex = index - 1;
    while (
      precedingIndex >= 0 &&
      matchesAnyWholeSegment(bridgePatterns, segments[precedingIndex])
    ) {
      precedingIndex -= 1;
    }
    if (
      precedingIndex >= 0 &&
      matchesCrossLanguageAttributedAssessmentBeforeCommand(
        segments[precedingIndex]
      )
    ) {
      return true;
    }

    let followingIndex = index + 1;
    while (
      followingIndex < segments.length &&
      matchesAnyWholeSegment(bridgePatterns, segments[followingIndex])
    ) {
      followingIndex += 1;
    }
    if (
      followingIndex < segments.length &&
      matchesAnyWholeSegment(
        attributedAnaphorPatterns,
        segments[followingIndex]
      )
    ) {
      return true;
    }
  }

  return false;
}

function hasBoundedMultilingualControl(text: string): boolean {
  const segments = text
    .split(/[.!?;。！？؛]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return MULTILINGUAL_SAFETY_PACKS.some((pack) => {
    const assessments = pack.externallyAttributedAssessments ?? [];
    const projectedSegments = segments.map((segment) => ({
      segment,
      ...projectExternallyAttributedAssessments(segment, assessments, pack),
    }));

    for (let index = 0; index < projectedSegments.length - 1; index += 1) {
      if (!projectedSegments[index].removedAssessment) continue;
      const followingIndex = consumeFollowingBridgeSegments(
        projectedSegments,
        index + 1,
        pack
      );
      if (
        followingIndex < projectedSegments.length &&
        isAttributedAssessmentAfterCommand(
          projectedSegments[followingIndex].segment,
          pack
        )
      ) {
        return true;
      }
    }

    for (let index = 1; index < projectedSegments.length; index += 1) {
      if (!projectedSegments[index].removedAssessment) continue;
      const precedingIndex = consumePrecedingBridgeSegments(
        projectedSegments,
        index - 1,
        pack
      );
      if (
        precedingIndex >= 0 &&
        isAttributedAssessmentBeforeCommand(
          projectedSegments[precedingIndex].segment,
          pack
        )
      ) {
        return true;
      }
    }

    return projectedSegments.some(({ projection: controlProjection }) => {
      if (pack.declarativeSelfOutcome.test(controlProjection)) return true;

      const action = pack.action.exec(controlProjection);
      const selfTarget = pack.selfTarget.exec(controlProjection);
      const outcome =
        pack.scoreOutcome.exec(controlProjection) ??
        pack.oneSidedOutcome.exec(controlProjection);
      if (!action || !selfTarget || !outcome) return false;

      const boundedMatches = [action, selfTarget, outcome];
      const firstIndex = Math.min(...boundedMatches.map(({ index }) => index));
      const lastIndex = Math.max(
        ...boundedMatches.map(({ index, 0: value }) => index + value.length)
      );
      return lastIndex - firstIndex <= pack.maxSpan;
    });
  });
}

export function isFeedbackManipulationShaped(text: string): boolean {
  const normalized = normalizeManipulationText(text);
  if (!normalized) return false;

  if (hasCrossLanguageAttributedAnaphorControl(normalized)) {
    return true;
  }

  if (hasBoundedMultilingualControl(normalized)) {
    return true;
  }

  return getEnglishControlClauses(normalized).some(
    ({ clause, roleEnvelope }) => {
      if (!roleEnvelope && isTrustedProductPolicy(clause)) return false;
      if (
        !roleEnvelope &&
        OUTCOME_NEUTRAL_QUALITY_METRIC.test(clause) &&
        !hasEmbeddedResultControl(clause)
      ) {
        return false;
      }
      if (
        !roleEnvelope &&
        OUTCOME_NEUTRAL_PRODUCT_TARGET.test(clause) &&
        !hasEmbeddedResultControl(clause)
      ) {
        return false;
      }
      if (
        !roleEnvelope &&
        OUTCOME_NEUTRAL_CALIBRATION_TARGET.test(clause) &&
        !hasIndependentCalibrationManipulation(clause)
      ) {
        return false;
      }

      const controlsOutcome =
        PASSIVE_SCORE_RESULT_CONTROL.test(clause) ||
        SCORE_OUTCOME.test(clause) ||
        COERCIVE_QUALITY_OUTCOME.test(clause) ||
        ONE_SIDED_OUTCOME.test(clause) ||
        PASS_OR_HIRE_OUTCOME.test(clause);
      if (!controlsOutcome) return false;

      return (
        roleEnvelope ||
        EMBEDDED_EVALUATOR_OUTPUT_IMPERATIVE.test(clause) ||
        EMBEDDED_DIMENSION_SCORE_CONTROL.test(clause) ||
        EMBEDDED_DIMENSION_DEONTIC_CONTROL.test(clause) ||
        EMBEDDED_SUFFIX_DEONTIC_CONTROL.test(clause) ||
        EMBEDDED_SELF_OUTCOME_CONTROL.test(clause) ||
        EMBEDDED_SELF_SCORE_CONTROL.test(clause) ||
        GERUND_SELF_OUTCOME_CONTROL.test(clause) ||
        GERUND_DIMENSION_OUTCOME_CONTROL.test(clause) ||
        OUTPUT_SCHEMA_SCORE_CONTROL.test(clause) ||
        DIRECT_SELF_SCORE_REQUEST.test(clause) ||
        RESULT_ACTION_CONTROL.test(clause) ||
        EMBEDDED_STANDARD_RESULT_CONTROL.test(clause) ||
        EMBEDDED_DECLARATIVE_RESULT_CONTROL.test(clause) ||
        isEvaluatorVocativeControl(clause) ||
        IMPERATIVE_CONTROL.test(clause) ||
        REQUEST_CONTROL.test(clause) ||
        ADDRESSEE_DEONTIC_CONTROL.test(clause) ||
        DESIRE_CONTROL.test(clause) ||
        TARGET_DEONTIC_CONTROL.test(clause) ||
        EMBEDDED_TARGET_DEONTIC_CONTROL.test(clause) ||
        SELF_IDENTIFIED_AUTHORITY.test(clause) ||
        ASSUMED_AUTHORITY_CONTROL.test(clause) ||
        SELF_OUTCOME_ASSERTION.test(clause) ||
        SELF_ATTRIBUTED_PAST_SCORE.test(clause) ||
        hasUnattributedDirectSelfOutcomeDeclaration(clause) ||
        DIRECT_RESULT_DECLARATION.test(clause) ||
        EMBEDDED_DIRECT_RESULT_DECLARATION.test(clause) ||
        REQUIRED_REVIEWER_RESULT_CONTROL.test(clause) ||
        DELEGATED_REVIEWER_RESULT_CONTROL.test(clause) ||
        ADDITIONAL_DELEGATED_REVIEWER_RESULT_CONTROL.test(clause) ||
        PASSIVE_SCORE_RESULT_CONTROL.test(clause) ||
        NAMED_ACTOR_HIRING_CONTROL.test(clause) ||
        DEONTIC_CONTROL.test(clause)
      );
    }
  );
}

function normalizeManipulationText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\u2018([^\u2018\u2019]*)\u2019/gu, "\u2039$1\u203a")
    .replace(/\u201a([^\u2018\u201a]*)\u2018/gu, "\u2039$1\u203a")
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .replace(/[\u2018\u2019\u201A\u201B]/gu, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/gu, '"')
    .replace(/[\u2010-\u2015\u2212]/gu, "-")
    .replace(/[\r\n\u0085\u2028\u2029]+/gu, ";")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

interface EnglishControlClause {
  clause: string;
  roleEnvelope: boolean;
}

function getEnglishControlClauses(text: string): EnglishControlClause[] {
  const isolatedRoles = text.replace(ROLE_ENVELOPE, (match) => `;${match}`);
  const clauses: EnglishControlClause[] = [];
  let pendingRoleEnvelope = false;
  for (const candidate of isolatedRoles.split(/[.!?;。！？؛]+/iu)) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const startsWithRoleEnvelope = LEADING_ROLE_ENVELOPE.test(trimmed);
    const clause = trimmed
      .replace(LEADING_ROLE_ENVELOPE, "")
      .replace(TRAILING_ROLE_ENVELOPE, "")
      .replace(/^[,:"']+/u, "")
      .trim();
    if (!clause) {
      pendingRoleEnvelope ||= startsWithRoleEnvelope;
      continue;
    }
    const roleEnvelope = startsWithRoleEnvelope || pendingRoleEnvelope;
    clauses.push({ clause, roleEnvelope });
    for (const fragment of clause.split(
      /\s+-\s+(?![-+]?(?:\d|\.\d))|[()]|\/(?!\s*\d)(?=\s*\p{L})|\b(?:also|although|and\s+then|as\s+(?:the\s+)?(?:final|first|last|next)\s+step|but\s+then|however|nevertheless|next|or|plus|so|then|while|yet)\b/iu
    )) {
      const trimmedFragment = fragment.replace(/^[,:"']+/u, "").trim();
      if (!trimmedFragment || trimmedFragment === clause) continue;
      clauses.push({ clause: trimmedFragment, roleEnvelope });
    }
    pendingRoleEnvelope = false;
  }

  for (const { clause } of [...clauses]) {
    const embeddedControl = clause.match(
      new RegExp(
        `(?:[,()]|\\/(?!\\s*\\d)|\\b(?:also|and|but|plus)\\b)\\s+((?:(?:please|kindly)\\s+)?${CONTROL_ACTIONS.source}\\b[\\s\\S]*)$`,
        "iu"
      )
    );
    if (!embeddedControl || embeddedControl.index === undefined) continue;
    const policyPrefix = clause
      .slice(0, embeddedControl.index)
      .replace(/[,;:]\s*$/u, "")
      .trim();
    if (isTrustedProductPolicy(policyPrefix)) {
      clauses.push({ clause: embeddedControl[1].trim(), roleEnvelope: false });
    }
  }

  return clauses;
}

function isEvaluatorVocativeControl(clause: string): boolean {
  if (!EVALUATOR_VOCATIVE.test(clause)) return false;
  const directive = clause.replace(EVALUATOR_VOCATIVE, "");
  return (
    VOCATIVE_SELF_OUTCOME_TARGET.test(directive) ||
    IMPERATIVE_CONTROL.test(directive) ||
    REQUEST_CONTROL.test(directive) ||
    TARGET_DEONTIC_CONTROL.test(directive)
  );
}

function isTrustedProductPolicy(clause: string): boolean {
  const selfBenefitProjection = clause.replace(
    /^my\s+answer\s+to\s+the\s+product\s+question\s+is\s+that\s+/iu,
    ""
  );
  return (
    (PRODUCT_POLICY_FRAME.test(clause) ||
      THIRD_PARTY_POLICY_AUDIENCE.test(clause)) &&
    FEEDBACK_POLICY_SUBJECT.test(clause) &&
    ONE_SIDED_OUTCOME.test(clause) &&
    !SCORE_OUTCOME.test(clause) &&
    !COERCIVE_QUALITY_OUTCOME.test(clause) &&
    !PASS_OR_HIRE_OUTCOME.test(clause) &&
    !DIRECT_EVALUATOR_ADDRESSEE.test(clause) &&
    !SELF_BENEFIT.test(selfBenefitProjection) &&
    !EMBEDDED_EVALUATOR_OUTPUT_IMPERATIVE.test(clause) &&
    !EMBEDDED_DIMENSION_SCORE_CONTROL.test(clause) &&
    !RESULT_ACTION_CONTROL.test(clause) &&
    !EMBEDDED_STANDARD_RESULT_CONTROL.test(clause) &&
    !EMBEDDED_DECLARATIVE_RESULT_CONTROL.test(clause) &&
    !IMPERATIVE_CONTROL.test(clause) &&
    !REQUEST_CONTROL.test(clause) &&
    !DESIRE_CONTROL.test(clause)
  );
}
