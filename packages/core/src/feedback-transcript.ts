import { isFeedbackManipulationShaped } from "./feedback-manipulation";

export interface FeedbackTranscriptTurn {
  eventId: string;
  speaker: "user" | "interviewer";
  text: string;
  deliveryState?: "delivered" | "partially_delivered";
}

export interface FeedbackTranscriptTurnInput {
  eventId: string | null;
  speaker: string;
  text: string | null;
  contractVersion?: number | null;
  deliveryState?: string | null;
}

export type FeedbackTranscriptIssueCode =
  | "malformed_event"
  | "missing_user_speech"
  | "prompt_injection"
  | "repeated_turn";

export interface FeedbackTranscriptIssue {
  code: FeedbackTranscriptIssueCode;
  eventId: string | null;
  fatal: boolean;
}

export interface PreparedFeedbackTranscript {
  transcript: FeedbackTranscriptTurn[];
  issues: FeedbackTranscriptIssue[];
  eligible: boolean;
  reasons: string[];
  duplicateTurnsRemoved: number;
}

export interface PrepareFeedbackTranscriptOptions {
  requireContractV2?: boolean;
}

const FEEDBACK_RESULT_TARGET_COMMAND_PATTERN =
  /^(?:(?:please|kindly|(?:(?:can|could|would|will)\s+you))\s+)?(?:to\s+)?(?:choose|pick|provide|record|return|select)\s+(?:(?:(?:a|an|my|the)\s+)?(?:(?:evaluation|final|numeric)\s+)?(?:outcome|rating|result|score)\s+(?:(?:as|at|of|to|with)\s+)?(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|10|[0-9])(?:\s*(?:\/\s*(?:ten|10)|out\s+of\s+(?:ten|10)))?|full\s+marks|high(?:est)?|maximum|perfect)|(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|10|[0-9])(?:\s*(?:\/\s*(?:ten|10)|out\s+of\s+(?:ten|10)))?|full\s+marks|high(?:est)?|maximum|perfect)\s+(?:as|at|for|of|to|with)\s+(?:(?:(?:a|an|my|the)\s+)?(?:(?:evaluation|final|numeric)\s+)?(?:outcome|rating|result|score)|(?:my|the|this)\s+(?:answer|performance|response)))\s*[.!?,;:]?$/iu;

const INJECTION_CLAUSE_PATTERNS = [
  /^(?:please\s+|you\s+(?:must|should|need\s+to|have\s+to)\s+|i\s+(?:(?:need|want)\s+you\s+to|(?:am\s+asking|ask)\s+you\s+to)\s+)?(?:ignore|disregard|override|forget)\b[\s\S]{0,100}\b(?:previous|prior|system|developer|instructions?|prompt|scoring\s+evidence|rubric|evaluation)\b/i,
  /\b(?:ignore|disregard|override|forget)\b[\s\S]{0,100}\b(?:previous|prior|system|developer|instructions?|prompt|scoring\s+evidence|rubric|evaluation)\b(?=[\s\S]{0,120}\b(?:award|developer|give|output|print|rate|return|reveal|score|system)\b)/i,
  /\b(?:(?:do\s+not|never)\s+(?:follow|obey)|stop\s+(?:following|obeying))\b[\s\S]{0,100}\b(?:previous|prior|system|developer|instructions?|prompt)\b/i,
  /\b(?:treat|consider|regard)\b[\s\S]{0,80}\b(?:previous|prior|system|developer|instructions?|prompt)\b[\s\S]{0,40}\b(?:invalid|irrelevant|untrusted)\b(?=[\s\S]{0,100}\b(?:award|give|output|rate|return|reveal|score)\b[\s\S]{0,60}\b(?:all\s+dimensions?|developer|every\s+dimension|maximum|me|perfect|scores?|strengths?|system|ten|10)\b)/i,
  /\b(?:act\s+as|pretend\s+you\s+are)\s+(?:the\s+)?(?:system|developer)\b(?=[\s\S]{0,100}\b(?:award|give|output|rate|return|reveal|score)\b)/i,
  /^(?:(?:and|but)(?:\s+then)?|instead|now|then)?\s*(?:please\s+)?(?:reveal|print|repeat|return|output)\b[\s\S]{0,80}\b(?:system|developer)\s+(?:message|prompt|instructions?)\b/i,
  /^(?:(?:and|but)(?:\s+then)?|instead|now|then)?\s*(?:please\s+)?(?:award|give|set|assign)\s+(?:me|my|every|all|each|the)\b[\s\S]{0,80}\b(?:ratings?|scores?|strengths?|ten|10)\b/i,
  /^(?:(?:and|but)(?:\s+then)?|instead|now|then)?\s*(?:please\s+)?(?:rate|score)\s+(?:me|my\s+(?:answer|performance|response)(?!\s+(?:quality|rate|rates|metric|metrics)\b)|this\s+(?:answer|response)(?!\s+(?:quality|rate|rates|metric|metrics)\b)|the\s+answer(?!\s+(?:quality|rate|rates|metric|metrics)\b))\b[\s\S]{0,80}\b(?:ten|10|high|maximum|perfect)\b/i,
  /^(?:(?:and|but)(?:\s+then)?|instead|now|then)?\s*(?:please\s+|kindly\s+)?(?:appraise|apply|bestow|echo|furnish|make|pencil(?:\s+in)?|record|repeat|reproduce|use)\b(?=[\s\S]{0,100}\b(?:me|my\s+(?:answer|performance|response)|the\s+(?:answer|response)|this\s+(?:answer|response))\b)(?=[\s\S]{0,100}(?:\b(?:score|rating)\b[\s\S]{0,24}\b(?:ten|10)\b|\b(?:ten|10)\s*(?:\/\s*(?:ten|10)|out\s+of\s+(?:ten|10))\b))/i,
  /^(?:(?:and|but)(?:\s+then)?|instead|now|then)?\s*(?:please\s+)?(?:return|output|list|mention)\s+only\s+strengths?\b/i,
  FEEDBACK_RESULT_TARGET_COMMAND_PATTERN,
] as const;

const TRANSCRIPT_DELIMITER_PATTERN = /<\s*\/?\s*transcript_data\b[^>]*>/i;
const STRUCTURAL_INJECTION_PATTERN =
  /^\s*(?:(?:\[|###\s*)(?:system|developer|assistant)(?:\]|\s*:)|<\s*\/?\s*(?:system|developer|assistant)\b[^>]*>|<\s*message\b[^>]*\brole\s*=\s*["']?(?:system|developer|assistant)["']?[^>]*>|<\s*role\s*>\s*(?:system|developer|assistant)\s*<\s*\/\s*role\s*>|\{?\s*["']?role["']?\s*[:=]\s*["']?(?:system|developer|assistant)["']?\b|\[TURN_ID\s*=)/i;
const MAX_CANONICAL_EVENT_ID_LENGTH = 512;
const MAX_REPLAY_TOKENS_PER_TURN = 1_024;
const MAX_CROSS_EVENT_PREVIOUS_CANDIDATE_EVENTS = 2;
const MAX_CROSS_EVENT_PREVIOUS_EVENT_TAIL_LENGTH = 512;
const MAX_CROSS_EVENT_CURRENT_EVENT_HEAD_LENGTH = 256;
const MAX_PARTIAL_FEEDBACK_RESULT_CONTROL_EVENTS = 6;
/**
 * A launch interview should fit comfortably below this evaluation-only budget.
 * The durable transcript may contain more turns, but feedback fails closed
 * before replay indexes or model input can grow beyond 64K normalized tokens.
 */
export const MAX_TOTAL_REPLAY_TOKENS = 65_536;

interface ReplayPrefixTrieNode {
  children: Map<string, ReplayPrefixTrieNode>;
  maxAcceptedContributions: number;
  terminalCandidates: ReplaySemanticTurn[];
}

interface ReplaySemanticTurn {
  tokens: readonly string[];
  acceptedFamilyContributions: number;
}

interface ReplaySemanticIndex {
  exactTexts: Map<string, number>;
  internalDeltaSignatures: Map<string, number>;
  leadingLabelSignatures: Map<number, number>;
  prefixSequenceRoot: ReplaySequenceTrieNode;
  suffixSequenceRoot: ReplaySequenceTrieNode;
  nextSequenceNodeId: number;
}

interface ReplaySequenceTrieNode {
  id: number;
  children: Map<string, ReplaySequenceTrieNode>;
}

interface CandidateSecurityTurn {
  tail: string;
}

type PartialFeedbackResultControlAction =
  | "candidate"
  | "result"
  | "targeted_result";

interface PartialFeedbackResultControlState {
  fragmentCount: number;
  action: PartialFeedbackResultControlAction | null;
  hasTarget: boolean;
  hasTargetPrefix: boolean;
  hasResult: boolean;
  hasResultModifier: boolean;
  hasOutcome: boolean;
}

/**
 * Establish the canonical, untrusted-data boundary used before evaluation.
 * Malformed events and instruction-shaped transcript content fail closed;
 * deterministic replays are removed so they cannot inflate eligibility.
 */
export function prepareFeedbackTranscript(
  turns: readonly FeedbackTranscriptTurnInput[],
  options: PrepareFeedbackTranscriptOptions = {}
): PreparedFeedbackTranscript {
  const transcript: FeedbackTranscriptTurn[] = [];
  const issues: FeedbackTranscriptIssue[] = [];
  const eventIds = new Set<string>();
  let totalReplayTokens = 0;
  const replaySemanticIndexes: Record<
    FeedbackTranscriptTurn["speaker"],
    ReplaySemanticIndex
  > = {
    user: createReplaySemanticIndex(),
    interviewer: createReplaySemanticIndex(),
  };
  const replayPrefixTries: Record<
    FeedbackTranscriptTurn["speaker"],
    ReplayPrefixTrieNode
  > = {
    user: createReplayPrefixTrieNode(),
    interviewer: createReplayPrefixTrieNode(),
  };
  // Retain bounded tails for two- and three-event scans plus typed state for a
  // command split across at most six candidate events. Interviewer and
  // malformed events are barriers for both mechanisms.
  let previousCandidateSecurityTurns: CandidateSecurityTurn[] = [];
  let partialFeedbackResultControlState: PartialFeedbackResultControlState | null =
    null;

  for (const turn of turns) {
    const eventId = typeof turn.eventId === "string" ? turn.eventId : "";
    const text = typeof turn.text === "string" ? turn.text.trim() : "";
    const speaker = turn.speaker;
    const malformed =
      !eventId ||
      !eventId.trim() ||
      eventId.length > MAX_CANONICAL_EVENT_ID_LENGTH ||
      !text ||
      isCorruptedTranscriptText(text) ||
      (speaker !== "user" && speaker !== "interviewer") ||
      (options.requireContractV2 && turn.contractVersion !== 2) ||
      eventIds.has(eventId);

    if (malformed) {
      previousCandidateSecurityTurns = [];
      partialFeedbackResultControlState = null;
      issues.push({
        code: "malformed_event",
        eventId: eventId || null,
        fatal: true,
      });
      continue;
    }
    eventIds.add(eventId);

    const partialFeedbackResultControl: {
      detected: boolean;
      next: PartialFeedbackResultControlState | null;
    } =
      speaker === "user"
        ? advancePartialFeedbackResultControl(
            partialFeedbackResultControlState,
            text
          )
        : { detected: false, next: null };
    if (
      containsTranscriptDelimiter(text) ||
      (speaker === "user" && isPromptInjectionShaped(text)) ||
      (speaker === "user" &&
        isCrossEventFeedbackResultControl(
          previousCandidateSecurityTurns,
          text
        )) ||
      partialFeedbackResultControl.detected
    ) {
      previousCandidateSecurityTurns = [];
      partialFeedbackResultControlState = null;
      issues.push({ code: "prompt_injection", eventId, fatal: true });
      continue;
    }
    partialFeedbackResultControlState =
      speaker === "user" ? partialFeedbackResultControl.next : null;
    previousCandidateSecurityTurns =
      speaker === "user"
        ? [
            ...previousCandidateSecurityTurns,
            createCandidateSecurityTurn(text),
          ].slice(-MAX_CROSS_EVENT_PREVIOUS_CANDIDATE_EVENTS)
        : [];

    const semanticText = normalizeSemanticText(text);
    const replayTokens = tokenizeReplayText(semanticText);
    if (!replayTokens || replayTokens.length === 0) {
      issues.push({ code: "malformed_event", eventId, fatal: true });
      break;
    }
    if (totalReplayTokens + replayTokens.length > MAX_TOTAL_REPLAY_TOKENS) {
      issues.push({ code: "malformed_event", eventId, fatal: true });
      break;
    }
    totalReplayTokens += replayTokens.length;
    const canonicalSpeaker = speaker as FeedbackTranscriptTurn["speaker"];
    const replaySemanticIndex = replaySemanticIndexes[canonicalSpeaker];
    if (replaySemanticIndex.exactTexts.has(semanticText)) {
      issues.push({ code: "repeated_turn", eventId, fatal: false });
      continue;
    }
    const replayPrefixTrie = replayPrefixTries[canonicalSpeaker];
    const prefixMatch = getReplayPrefixMatch(replayPrefixTrie, replayTokens);
    const replaySignatures = getReplaySignatures(
      replaySemanticIndex,
      replayTokens,
      getBoundedLeadingReplayLabelTokenCount(text)
    );
    const semanticReplayMatch = getIndexedSemanticReplayMatch(
      replaySemanticIndex,
      replayTokens,
      prefixMatch.terminalCandidates,
      replaySignatures.internalDeltaSignatures
    );
    const leadingLabelFamilyContributions =
      replaySignatures.leadingLabelSignature === null
        ? 0
        : (replaySemanticIndex.leadingLabelSignatures.get(
            replaySignatures.leadingLabelSignature
          ) ?? 0);
    const matchedAcceptedContributions = Math.max(
      prefixMatch.acceptedFamilyContributions,
      semanticReplayMatch.acceptedFamilyContributions,
      leadingLabelFamilyContributions
    );
    const protectedMetricCorrection =
      prefixMatch.acceptedFamilyContributions >= 2 &&
      isProtectedTerminalMetricCorrection(
        prefixMatch.terminalCandidates,
        replayTokens
      );
    const accepted =
      !semanticReplayMatch.replay &&
      leadingLabelFamilyContributions < 2 &&
      (prefixMatch.acceptedFamilyContributions < 2 ||
        protectedMetricCorrection);
    const acceptedFamilyContributions = accepted
      ? Math.min(2, Math.max(1, matchedAcceptedContributions + 1))
      : Math.max(1, matchedAcceptedContributions);
    const semanticTurn = addObservedSemanticTurn(
      replaySemanticIndex,
      semanticText,
      replayTokens,
      replaySignatures.internalDeltaSignatures,
      replaySignatures.leadingLabelSignature,
      acceptedFamilyContributions
    );
    addReplayPrefixObservation(replayPrefixTrie, semanticTurn, accepted);
    if (!accepted) {
      issues.push({ code: "repeated_turn", eventId, fatal: false });
      continue;
    }
    transcript.push({
      eventId,
      speaker: canonicalSpeaker,
      text,
      deliveryState:
        turn.deliveryState === "partially_delivered"
          ? "partially_delivered"
          : "delivered",
    });
  }

  if (!transcript.some((turn) => turn.speaker === "user")) {
    issues.push({ code: "missing_user_speech", eventId: null, fatal: true });
  }

  const fatalCodes = new Set(
    issues.filter((issue) => issue.fatal).map((issue) => issue.code)
  );
  const reasons: string[] = [];
  if (fatalCodes.has("malformed_event")) {
    reasons.push("Transcript data is incomplete or corrupted");
  }
  if (fatalCodes.has("prompt_injection")) {
    reasons.push(
      "Transcript contains instructions that cannot be evaluated safely"
    );
  }
  if (fatalCodes.has("missing_user_speech")) {
    reasons.push("No usable user speech was recorded");
  }

  return {
    transcript,
    issues,
    eligible: reasons.length === 0,
    reasons,
    duplicateTurnsRemoved: issues.filter(
      (issue) => issue.code === "repeated_turn"
    ).length,
  };
}

export function isPromptInjectionShaped(text: string): boolean {
  const scanText = normalizeInjectionScanProjection(text);
  if (
    containsTranscriptDelimiter(text) ||
    STRUCTURAL_INJECTION_PATTERN.test(scanText)
  ) {
    return true;
  }
  const directiveScanText = stripExplicitInjectionExamples(scanText);
  const clauses = getInjectionScanClauses(directiveScanText).filter(
    (clause) => !isTrustedPolicyDefenseClause(clause)
  );
  return (
    clauses.some((clause) =>
      INJECTION_CLAUSE_PATTERNS.some((pattern) => pattern.test(clause))
    ) ||
    EMBEDDED_INSTRUCTION_DISCLOSURE.test(directiveScanText) ||
    isFeedbackManipulationShaped(directiveScanText)
  );
}

function createCandidateSecurityTurn(text: string): CandidateSecurityTurn {
  return {
    tail: normalizeInjectionScanProjection(text).slice(
      -MAX_CROSS_EVENT_PREVIOUS_EVENT_TAIL_LENGTH
    ),
  };
}

function isCrossEventFeedbackResultControl(
  previousTurns: readonly CandidateSecurityTurn[],
  currentText: string
): boolean {
  const currentHead = normalizeInjectionScanProjection(currentText)
    .slice(0, MAX_CROSS_EVENT_CURRENT_EVENT_HEAD_LENGTH)
    .trim();
  if (!currentHead) return false;

  const boundedPreviousTurns = previousTurns.slice(
    -MAX_CROSS_EVENT_PREVIOUS_CANDIDATE_EVENTS
  );
  for (
    let windowSize = 1;
    windowSize <= boundedPreviousTurns.length;
    windowSize += 1
  ) {
    const priorTails = boundedPreviousTurns
      .slice(-windowSize)
      .map(({ tail }) => tail.trim())
      .filter(Boolean);
    if (priorTails.length !== windowSize) continue;
    if (isPromptInjectionShaped([...priorTails, currentHead].join(" "))) {
      return true;
    }
  }
  return false;
}

const PARTIAL_FEEDBACK_CONTROL_POLITENESS =
  /^(?:(?:please|kindly)|(?:(?:can|could|would|will)\s+you))\s*[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_CONTROL_INTENT =
  /^i\s+(?:ask|need|want|would\s+like)\s*[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_CONTROL_PARTICIPANT =
  /^(?:the\s+)?(?:evaluator|reviewer|you)\s*[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_CANDIDATE_ACTION =
  /^(?:(?:please|kindly|(?:(?:can|could|would|will)\s+you))\s+)?(?:to\s+)?(?:appraise|assign|award|bestow|furnish|give|grade|pencil(?:\s+in)?|rate|score)\b/iu;
const PARTIAL_FEEDBACK_RESULT_ACTION =
  /^(?:(?:please|kindly|(?:(?:can|could|would|will)\s+you))\s+)?(?:to\s+)?(?:choose|output|pick|provide|record|return|select|set)\b/iu;
const PARTIAL_FEEDBACK_TARGETED_RESULT_ACTION =
  /^(?:(?:please|kindly|(?:(?:can|could|would|will)\s+you))\s+)?(?:to\s+)?use\b/iu;
const PARTIAL_FEEDBACK_IMPLICIT_RESULT_ACTION =
  /\b(?:appraise|grade|rate|score)\b/iu;
const PARTIAL_FEEDBACK_CANDIDATE_TARGET =
  /\b(?:candidate|me|mine|my|myself|answer|performance|response)\b/iu;
const PARTIAL_FEEDBACK_CANDIDATE_TARGET_PRONOUN = /^it\s*[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_CANDIDATE_TARGET_PREFIX =
  /(?:^|\s)(?:a|an|her|his|its|our|that|the|their|this|your)\s*[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_CANDIDATE_TARGET_HEAD =
  /^(?:answer|candidate|performance|response)\s*[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_CANDIDATE_TARGET_FRAGMENT =
  /^(?:(?:answer|candidate|me|mine|my|myself|performance|response|the|this)\s*){1,4}[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_RESULT_NOUN =
  /\b(?:assessment|categories|category|dimension|dimensions|evaluation|grade|mark|marks|outcome|outcomes|rating|ratings|result|results|score|scores)\b/iu;
const PARTIAL_FEEDBACK_RESULT_FRAGMENT =
  /^(?:assessment|categories|category|dimension|dimensions|evaluation|grade|mark|marks|outcome|outcomes|rating|ratings|result|results|score|scores)\s*[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_RESULT_MODIFIER = /^final\s*[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_RESULT_SELECTOR = /^(?:all|each|every)\s*[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_CONTROL_OUTCOME =
  /^(?:(?:as|at|of|to|with)\s+)?(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|10|[0-9])(?:\s*(?:\/\s*(?:ten|10)|out\s+of\s+(?:ten|10)))?|full\s+marks|high(?:est)?|maximum|perfect)\s*[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_DIRECT_BARE_OUTCOME_CONTROL =
  /^(?:(?:please|kindly|(?:(?:can|could|would|will)\s+you))\s+)?(?:to\s+)?(?:appraise|assign|award|bestow|furnish|give|grade|pencil(?:\s+in)?|rate|score|output|provide|record|return|set)\s+(?:(?:as|at|of|to|with)\s+)?(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|10|[0-9])(?:\s*(?:\/\s*(?:ten|10)|out\s+of\s+(?:ten|10)))?|full\s+marks|high(?:est)?|maximum|perfect)\s*[.!?,;:]?$/iu;
const PARTIAL_FEEDBACK_CONTROL_CONNECTOR =
  /^(?:(?:a|an|as|at|for|of|the|to|with)\s*){1,3}[.!?,;:]?$/iu;
const MAX_PARTIAL_FEEDBACK_CONTROL_FRAGMENT_LENGTH = 192;

/**
 * Track only typed progress through a short, contiguous result-control
 * command. Candidate speech is never concatenated: an unrelated fragment,
 * interviewer turn, or malformed event clears the state. A command that keeps
 * traversing control grammar at the hard event cap fails closed.
 */
function advancePartialFeedbackResultControl(
  prior: PartialFeedbackResultControlState | null,
  text: string
): {
  detected: boolean;
  next: PartialFeedbackResultControlState | null;
} {
  const fragment = normalizeInjectionScanProjection(text).trim();
  if (
    !fragment ||
    fragment.length > MAX_PARTIAL_FEEDBACK_CONTROL_FRAGMENT_LENGTH
  ) {
    return { detected: false, next: null };
  }
  if (
    PARTIAL_FEEDBACK_DIRECT_BARE_OUTCOME_CONTROL.test(fragment) ||
    FEEDBACK_RESULT_TARGET_COMMAND_PATTERN.test(fragment)
  ) {
    return { detected: true, next: null };
  }

  const candidateAction = PARTIAL_FEEDBACK_CANDIDATE_ACTION.test(fragment);
  const resultAction = PARTIAL_FEEDBACK_RESULT_ACTION.test(fragment);
  const targetedResultAction =
    PARTIAL_FEEDBACK_TARGETED_RESULT_ACTION.test(fragment);
  const action: PartialFeedbackResultControlAction | null = candidateAction
    ? "candidate"
    : resultAction
      ? "result"
      : targetedResultAction
        ? "targeted_result"
        : null;
  const politeOnly = PARTIAL_FEEDBACK_CONTROL_POLITENESS.test(fragment);
  const intentOnly = PARTIAL_FEEDBACK_CONTROL_INTENT.test(fragment);
  const participantOnly = PARTIAL_FEEDBACK_CONTROL_PARTICIPANT.test(fragment);
  const resultSelectorOnly = PARTIAL_FEEDBACK_RESULT_SELECTOR.test(fragment);
  const target =
    PARTIAL_FEEDBACK_CANDIDATE_TARGET.test(fragment) ||
    PARTIAL_FEEDBACK_CANDIDATE_TARGET_PRONOUN.test(fragment) ||
    resultSelectorOnly;
  const targetPrefix = PARTIAL_FEEDBACK_CANDIDATE_TARGET_PREFIX.test(fragment);
  const targetHeadOnly = PARTIAL_FEEDBACK_CANDIDATE_TARGET_HEAD.test(fragment);
  const targetOnly = PARTIAL_FEEDBACK_CANDIDATE_TARGET_FRAGMENT.test(fragment);
  const result =
    PARTIAL_FEEDBACK_RESULT_NOUN.test(fragment) ||
    (candidateAction && PARTIAL_FEEDBACK_IMPLICIT_RESULT_ACTION.test(fragment));
  const resultOnly = PARTIAL_FEEDBACK_RESULT_FRAGMENT.test(fragment);
  const resultModifierOnly = PARTIAL_FEEDBACK_RESULT_MODIFIER.test(fragment);
  const outcome = PARTIAL_FEEDBACK_CONTROL_OUTCOME.test(fragment);
  const connectorOnly = PARTIAL_FEEDBACK_CONTROL_CONNECTOR.test(fragment);

  const start = (): PartialFeedbackResultControlState | null => {
    if (!action && !politeOnly && !intentOnly) return null;
    return {
      fragmentCount: 1,
      action,
      hasTarget: target,
      hasTargetPrefix: Boolean(action && !target && targetPrefix),
      hasResult: result,
      hasResultModifier: false,
      hasOutcome: outcome,
    };
  };
  if (!prior) {
    return { detected: false, next: start() };
  }
  if (prior.fragmentCount >= MAX_PARTIAL_FEEDBACK_RESULT_CONTROL_EVENTS) {
    const continuesControlGrammar =
      target ||
      targetPrefix ||
      result ||
      resultModifierOnly ||
      connectorOnly ||
      outcome ||
      resultSelectorOnly;
    const detected =
      prior.action !== null &&
      (prior.action === "targeted_result"
        ? prior.hasResult || result
        : prior.hasTarget || prior.hasResult || target || result) &&
      (prior.hasOutcome || outcome) &&
      continuesControlGrammar;
    return { detected, next: detected ? null : start() };
  }

  const nextAction = prior.action ?? action;
  const advancesAction = prior.action === null && action !== null;
  const completesTargetPrefix =
    prior.hasTargetPrefix && !prior.hasTarget && targetHeadOnly;
  const advancesTarget = !prior.hasTarget && (target || completesTargetPrefix);
  const advancesTargetPrefix =
    prior.action !== null &&
    !prior.hasTarget &&
    !prior.hasTargetPrefix &&
    targetPrefix;
  const advancesResult = !prior.hasResult && result;
  const advancesResultModifier =
    prior.action !== null &&
    !prior.hasResult &&
    !prior.hasResultModifier &&
    resultModifierOnly;
  const followsControlGrammar =
    advancesAction ||
    advancesTarget ||
    advancesTargetPrefix ||
    advancesResult ||
    advancesResultModifier ||
    (prior.action === null && participantOnly) ||
    (prior.hasTarget && targetOnly) ||
    (prior.hasResult && resultOnly) ||
    resultSelectorOnly ||
    connectorOnly ||
    outcome;
  if (!followsControlGrammar || (prior.action !== null && action !== null)) {
    return { detected: false, next: start() };
  }

  const next = {
    fragmentCount: prior.fragmentCount + 1,
    action: nextAction,
    hasTarget: prior.hasTarget || target || completesTargetPrefix,
    hasTargetPrefix:
      !completesTargetPrefix &&
      !prior.hasTarget &&
      !target &&
      (prior.hasTargetPrefix || advancesTargetPrefix),
    hasResult: prior.hasResult || result,
    hasResultModifier:
      !result && (prior.hasResultModifier || advancesResultModifier),
    hasOutcome: prior.hasOutcome || outcome,
  } satisfies PartialFeedbackResultControlState;
  const detected =
    next.hasOutcome &&
    next.action !== null &&
    (next.action === "targeted_result"
      ? next.hasResult
      : next.hasTarget || next.hasResult);
  return { detected, next: detected ? null : next };
}

function containsTranscriptDelimiter(text: string): boolean {
  return TRANSCRIPT_DELIMITER_PATTERN.test(
    normalizeInjectionScanProjection(text)
  );
}

const EMBEDDED_INSTRUCTION_DISCLOSURE =
  /\b(?:and|but|so|while)\s+(?:(?:please|then)\s+)?(?:output(?:ting)?|print(?:ing)?|return(?:ing)?|reveal(?:ing)?|repeat(?:ing)?)\b[\s\S]{0,80}\b(?:developer|system)\s+(?:instructions?|message|prompt)\b/i;
function normalizeInjectionScanProjection(text: string): string {
  return text
    .replace(/[\r\n\u0085\u2028\u2029]+/g, ";")
    .normalize("NFKC")
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, ";")
    .replace(/\u3002/g, ".")
    .replace(/\u3001/g, ",")
    .replace(/\bdon't\b/gi, "do not");
}

const DEFENSE_EXAMPLE_SUFFIX_ACTION_SOURCE = String.raw`(?:accept|appraise|apply|approve|assess|assign|avoid|award|bestow|call|characterize|classify|conclude|consider|declare|deem|describe|disregard|echo|endorse|ensure|evaluate|find|frame|furnish|generate|give|grade|hire|ignore|include|judge|label|list|make|mark|mention|omit|output|paint|pass|pencil|praise|present|print|produce|provide|put|rank|rate|recommend|record|repeat|reproduce|respond|reply|return|reveal|say|score|see|set|state|suppress|tell|treat|use|view|write)`;
const DEFENSE_EXAMPLE_SUFFIX_BOUNDARY_SOURCE = String.raw`(?=,\s*(?=(?:(?:(?:and|but)\s+)?(?:now|then)\s+|(?:and|but|plus|so)\s+)?(?:please\s+|kindly\s+)?${DEFENSE_EXAMPLE_SUFFIX_ACTION_SOURCE}\b)|\s+(?:(?:and|but)\s+(?:now|then)|afterward|however|instead|next|plus|so|subsequently|yet)\b|[.!?;]|$)`;
const INLINE_INJECTION_DEFENSE_EXAMPLE = new RegExp(
  String.raw`(\b(?:(?:block|classify|detect|escape|filter|guard|prevent|protect|reject|sanitize)\w*|design\w*\b[^.!?;]{0,50}\b(?:detector|filter))\b[^.!?;]{0,100}\b(?:payloads?|phrases?|prompts?|instructions?|requests?|text)\b\s*(?:like|such\s+as|including)\s+)(?:(?:ignore|disregard|override|forget)\b|(?:(?:do\s+not|never)\s+(?:follow|obey)|stop\s+(?:following|obeying))\b)[^.!?;]*?${DEFENSE_EXAMPLE_SUFFIX_BOUNDARY_SOURCE}`,
  "giu"
);
const ACTOR_INJECTION_DEFENSE_EXAMPLE = new RegExp(
  String.raw`(\b(?:stop|block|classify|detect|filter|guard|prevent|protect|reject|sanitize)\w*\b[^.!?;]{0,100}\b(?:attacker|user)\b[^.!?;]{0,40}\b(?:from\s+saying|says?)\s*,?\s*)(?:(?:ignore|disregard|override|forget)\b|(?:(?:do\s+not|never)\s+(?:follow|obey)|stop\s+(?:following|obeying))\b)[^.!?;]*?${DEFENSE_EXAMPLE_SUFFIX_BOUNDARY_SOURCE}`,
  "giu"
);
const SUPPOSED_ATTACKER_INJECTION_DEFENSE_EXAMPLE = new RegExp(
  String.raw`(\bsuppose\s+(?:an?\s+|the\s+)?attacker\s+says?\s*,?\s*)(?:(?:ignore|disregard|override|forget)\b|(?:(?:do\s+not|never)\s+(?:follow|obey)|stop\s+(?:following|obeying))\b)[^.!?;]*?${DEFENSE_EXAMPLE_SUFFIX_BOUNDARY_SOURCE}`,
  "giu"
);
const LABELED_INJECTION_DEFENSE_EXAMPLE = new RegExp(
  String.raw`(\b(?:(?:block|classify|detect|escape|filter|guard|prevent|protect|reject|sanitize)\w*|design\w*\b[^.!?;]{0,50}\b(?:detector|filter))\b[^.!?;]{0,100}\b(?:payloads?|phrases?|prompts?|instructions?|requests?|text)\b\s*:)\s*(?:(?:ignore|disregard|override|forget)\b|(?:(?:do\s+not|never)\s+(?:follow|obey)|stop\s+(?:following|obeying))\b)[^.!?;]*?${DEFENSE_EXAMPLE_SUFFIX_BOUNDARY_SOURCE}`,
  "giu"
);
const LABELED_DIRECT_SCORE_DEFENSE_EXAMPLE = new RegExp(
  String.raw`(\b(?:(?:block|classify|detect|escape|filter|guard|prevent|protect|reject|sanitize)\w*|design\w*\b[^.!?;]{0,50}\b(?:detector|filter))\b[^.!?;]{0,100}\b(?:commands?|instructions?|requests?|text)\b\s*:)\s*(?:(?:return|output)\s+(?:a\s+)?score\s+of\s+(?:ten|10(?:\s*\/\s*10)?)|(?:rate|score)\s+(?:me|my\s+(?:answer|performance|response)|this\s+(?:answer|response)|the\s+answer)\s+(?:as\s+)?(?:ten|10(?:\s*\/\s*10)?))\b(?=\s*(?:[.!?;]|$))`,
  "giu"
);

function stripExplicitInjectionExamples(text: string): string {
  return text
    .replace(INLINE_INJECTION_DEFENSE_EXAMPLE, "$1 ")
    .replace(ACTOR_INJECTION_DEFENSE_EXAMPLE, "$1 ")
    .replace(SUPPOSED_ATTACKER_INJECTION_DEFENSE_EXAMPLE, "$1 ")
    .replace(
      /(\b(?:(?:block|classify|detect|escape|filter|guard|prevent|protect|reject|sanitize)\w*|design\w*\b[^.!?;]{0,50}\b(?:detector|filter))\b[^.!?;]{0,100}\b(?:payloads?|phrases?|prompts?|instructions?|requests?|text)\b[^.!?;]{0,24})"[^"\r\n]*"/gi,
      "$1 "
    )
    .replace(
      /(\b(?:(?:block|classify|detect|escape|filter|guard|prevent|protect|reject|sanitize)\w*|design\w*\b[^.!?;]{0,50}\b(?:detector|filter))\b[^.!?;]{0,100}\b(?:payloads?|phrases?|prompts?|instructions?|requests?|text)\b[^.!?;]{0,24})'[^'\r\n]*'/gi,
      "$1 "
    )
    .replace(
      /(\b(?:(?:block|classify|detect|escape|filter|guard|prevent|protect|reject|sanitize)\w*|design\w*\b[^.!?;]{0,50}\b(?:detector|filter))\b[^.!?;]{0,100}\b(?:payloads?|phrases?|prompts?|instructions?|requests?|text)\b[^.!?;()]{0,24})\(\s*(?:like\s+|such\s+as\s+|including\s+)?(?:(?:ignore|disregard|override|forget)\b|(?:(?:do\s+not|never)\s+(?:follow|obey)|stop\s+(?:following|obeying))\b)[^();]*\)/gi,
      "$1 "
    )
    .replace(LABELED_INJECTION_DEFENSE_EXAMPLE, "$1 ")
    .replace(LABELED_DIRECT_SCORE_DEFENSE_EXAMPLE, "$1 ");
}

function isTrustedPolicyDefenseClause(clause: string): boolean {
  const trustMarkers = [
    ...clause.matchAll(/\b(?:embedded|retrieved|untrusted)\b/gi),
  ];
  const lastTrustMarker = trustMarkers.at(-1);
  const tailStart = lastTrustMarker
    ? clause
        .slice((lastTrustMarker.index ?? 0) + lastTrustMarker[0].length)
        .search(/\b(?:and|but|so|while)\b/i)
    : -1;
  const policyRemainder =
    lastTrustMarker && tailStart >= 0
      ? clause.slice(
          (lastTrustMarker.index ?? 0) + lastTrustMarker[0].length + tailStart
        )
      : "";
  const policyPrefix = lastTrustMarker
    ? clause.slice(0, lastTrustMarker.index ?? 0)
    : "";
  return (
    lastTrustMarker !== undefined &&
    /\b(?:ignore|disregard|override|forget|follow|following|obey|obeying)\b/i.test(
      clause
    ) &&
    !isFeedbackManipulationShaped(policyPrefix) &&
    !isFeedbackManipulationShaped(policyRemainder) &&
    !EMBEDDED_INSTRUCTION_DISCLOSURE.test(policyRemainder)
  );
}

function getInjectionScanClauses(text: string): string[] {
  const candidates = text.split(
    /(?:(?<=[.!?:;,()[\]{}])\s*|\b(?:afterward|although|and\s+(?:now|then)|but\s+(?:now|then)|however|instead|nevertheless|next|or|plus|so|subsequently|then|yet)\b\s*|[\r\n\u0085\u2028\u2029]+)/iu
  );
  return [
    ...new Set(
      candidates
        .map((clause) =>
          clause
            .trim()
            .replace(/^["'([{]+/u, "")
            .replace(/["')\]}]+$/u, "")
            .trim()
        )
        .filter(Boolean)
    ),
  ];
}

/**
 * Resolve harmless whitespace and typographic punctuation differences back to
 * the exact source substring. The returned value is always byte-for-byte text
 * from `source`; null means the proposed quote is not grounded.
 */
export function normalizeEvidenceQuoteToSource(
  source: string,
  proposedQuote: string
): string | null {
  const candidate = proposedQuote.trim();
  if (!candidate) return null;
  if (source.includes(candidate)) return candidate;

  const sourceProjection = projectComparableText(source);
  const quoteProjection = projectComparableText(candidate, true);
  if (!quoteProjection.text) return null;
  const offset = sourceProjection.text.indexOf(quoteProjection.text);
  if (offset < 0) return null;

  const first = sourceProjection.map[offset];
  const last = sourceProjection.map[offset + quoteProjection.text.length - 1];
  if (!first || !last) return null;
  const exact = source.slice(first.start, last.end);
  return exact.trim() ? exact : null;
}

const LEADING_REPLAY_LABEL_SOURCE = String.raw`(?:(?:attempt|answer|response)\s*(?:#\s*)?(?:[1-9]\d?|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:attempt|answer|response))`;
const LEADING_REPLAY_LABEL = new RegExp(
  `^(?:\\[\\s*${LEADING_REPLAY_LABEL_SOURCE}\\s*\\]\\s*|${LEADING_REPLAY_LABEL_SOURCE}\\s*(?:[:.)]|\\s+-)\\s*)`,
  "iu"
);
const VOLATILE_ANNOTATION_REPLAY_TOKEN = "replayvolatileannotationtoken";
const OPAQUE_NONCE_REPLAY_TOKEN = "replayopaquenoncetoken";
const LEADING_ORDINAL_DISCOURSE_REPLAY_TOKEN =
  "replayleadingordinaldiscoursetoken";
const LEADING_ORDINAL_DISCOURSE =
  /^(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:(?:\s+(?:of\s+all|off))|ly)?|(?:1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)(?:\s+(?:of\s+all|off))?|in\s+the\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+place|number\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|10|[1-9]))\b(?:\s*[,;:.-])?(?=\s+(?:i|we)\b)/iu;

function normalizeSemanticText(text: string): string {
  return projectComparableText(
    text.normalize("NFKC").replace(/\p{Default_Ignorable_Code_Point}/gu, ""),
    true
  )
    .text.normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(LEADING_REPLAY_LABEL, "")
    .replace(LEADING_ORDINAL_DISCOURSE, LEADING_ORDINAL_DISCOURSE_REPLAY_TOKEN)
    .replace(
      /\[\s*(?:attempt|option|variant)(?:[_ -]?id)?\s*[:=]\s*[a-z0-9#_-]+\s*\]/gi,
      ` ${VOLATILE_ANNOTATION_REPLAY_TOKEN} `
    )
    .replace(
      /\b(?:attempt|option|variant)[_ -]?id\s*[:=]\s*[a-z0-9#_-]+\b/gi,
      ` ${VOLATILE_ANNOTATION_REPLAY_TOKEN} `
    )
    .replace(
      /\b(?:request[_ -]?id|attempt[_ -]?id|variant[_ -]?id|nonce|trace)\s*[:=]\s*(?=[a-z0-9_-]*[a-z])(?=[a-z0-9_-]*\d)[a-z0-9]+(?:[-_][a-z0-9]+){1,}\b/gi,
      ` ${OPAQUE_NONCE_REPLAY_TOKEN} `
    )
    .replace(
      /\b(?:request[_ -]?id|attempt[_ -]?id|variant[_ -]?id|nonce|trace)\s*[:=]\s*[0-9a-hjkmnp-tv-z]{26}\b/gi,
      ` ${OPAQUE_NONCE_REPLAY_TOKEN} `
    )
    .replace(
      /\b(?:request[_ -]?id|attempt[_ -]?id|variant[_ -]?id|nonce|trace)\s*[:=]\s*(?=[a-z0-9]{16,}\b)(?=[a-z0-9]*[a-z])(?=[a-z0-9]*\d)[a-z0-9]+\b/gi,
      ` ${OPAQUE_NONCE_REPLAY_TOKEN} `
    )
    .replace(/>=|≥/g, " comparison_gte ")
    .replace(/<=|≤/g, " comparison_lte ")
    .replace(/!=|≠/g, " comparison_neq ")
    .replace(/[~≈≃∼](?=\s*\p{N})/gu, " comparison_approx ")
    .replace(/=/g, " comparison_eq ")
    .replace(/>/g, " comparison_gt ")
    .replace(/</g, " comparison_lt ")
    .replace(/\+(?=\s*\p{N})/gu, " sign_positive ")
    .replace(/-(?=\s*\p{N})/gu, " sign_negative ")
    .replace(/\p{Sc}(?=\s*\p{N})/gu, (symbol) => {
      const codePoint = symbol.codePointAt(0)?.toString(16) ?? "unknown";
      return ` currency_${codePoint} `;
    })
    .replace(
      /(\p{N})\s*(\p{Sc})/gu,
      (_match, digit: string, symbol: string) => {
        const codePoint = symbol.codePointAt(0)?.toString(16) ?? "unknown";
        return `${digit} currency_${codePoint} `;
      }
    )
    .replace(
      /(\p{N})\s*([%٪‰؉‱؊×])/gu,
      (_match, digit: string, unit: string) => {
        const unitName =
          unit === "%" || unit === "٪"
            ? "percent"
            : unit === "‰" || unit === "؉"
              ? "permille"
              : unit === "×"
                ? "multiply"
                : "permyriad";
        return `${digit} unit_${unitName} `;
      }
    )
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const REPLAY_GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});
const COMPACT_REPLAY_GRAPHEME =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * Keep ordinary whitespace-delimited words intact while giving compact
 * Han/Kana text stable grapheme tokens. The hard cap bounds every downstream
 * replay comparison and fails closed before an oversized turn can be scored.
 */
function tokenizeReplayText(text: string): string[] | null {
  const tokens: string[] = [];
  const append = (token: string): boolean => {
    if (!token) return true;
    tokens.push(token);
    return tokens.length <= MAX_REPLAY_TOKENS_PER_TURN;
  };

  for (const chunk of text.split(" ")) {
    if (!chunk) continue;
    if (!COMPACT_REPLAY_GRAPHEME.test(chunk)) {
      if (!append(chunk)) return null;
      continue;
    }
    let nonCompactToken = "";
    for (const part of REPLAY_GRAPHEME_SEGMENTER.segment(chunk)) {
      const grapheme = part.segment;
      if (COMPACT_REPLAY_GRAPHEME.test(grapheme)) {
        if (!append(nonCompactToken)) return null;
        nonCompactToken = "";
        if (!append(grapheme)) return null;
      } else {
        nonCompactToken += grapheme;
      }
    }
    if (!append(nonCompactToken)) return null;
  }

  return tokens;
}

const MAX_REPLAY_CANDIDATES_PER_TERMINAL_KEY = 2;
const MAX_TERMINAL_REPLAY_DELTA_TOKENS = 4;
const MAX_INTERNAL_REPLAY_DELTA_TOKENS = 4;

function createReplaySequenceTrieNode(id: number): ReplaySequenceTrieNode {
  return { id, children: new Map() };
}

function createReplaySemanticIndex(): ReplaySemanticIndex {
  return {
    exactTexts: new Map(),
    internalDeltaSignatures: new Map(),
    leadingLabelSignatures: new Map(),
    prefixSequenceRoot: createReplaySequenceTrieNode(0),
    suffixSequenceRoot: createReplaySequenceTrieNode(1),
    nextSequenceNodeId: 2,
  };
}

/**
 * Semantic replay relations can only arise from a bounded terminal delta or
 * from an internal delta made entirely of normalized volatile tokens. Index
 * those two shapes directly so a new turn never scans all observed history.
 * The stored contribution count belongs to accepted evidence; rejected replay
 * variants extend reachability without incrementing that count.
 */
function getIndexedSemanticReplayMatch(
  index: ReplaySemanticIndex,
  tokens: readonly string[],
  terminalCandidates: readonly ReplaySemanticTurn[],
  internalDeltaSignatures: readonly string[]
): { replay: boolean; acceptedFamilyContributions: number } {
  let replay = false;
  let acceptedFamilyContributions = 0;
  for (const signature of internalDeltaSignatures) {
    const contributions = index.internalDeltaSignatures.get(signature);
    if (contributions === undefined) continue;
    replay = true;
    acceptedFamilyContributions = Math.max(
      acceptedFamilyContributions,
      contributions
    );
  }

  for (const candidate of terminalCandidates) {
    if (!isSemanticReplay(candidate.tokens, tokens)) continue;
    replay = true;
    acceptedFamilyContributions = Math.max(
      acceptedFamilyContributions,
      candidate.acceptedFamilyContributions
    );
  }
  return { replay, acceptedFamilyContributions };
}

function addObservedSemanticTurn(
  index: ReplaySemanticIndex,
  text: string,
  tokens: readonly string[],
  internalDeltaSignatures: readonly string[],
  leadingLabelSignature: number | null,
  acceptedFamilyContributions: number
): ReplaySemanticTurn {
  const turn = {
    tokens,
    acceptedFamilyContributions,
  } satisfies ReplaySemanticTurn;
  index.exactTexts.set(text, acceptedFamilyContributions);
  for (const signature of internalDeltaSignatures) {
    index.internalDeltaSignatures.set(
      signature,
      Math.max(
        index.internalDeltaSignatures.get(signature) ?? 0,
        acceptedFamilyContributions
      )
    );
  }
  if (leadingLabelSignature !== null) {
    index.leadingLabelSignatures.set(
      leadingLabelSignature,
      Math.max(
        index.leadingLabelSignatures.get(leadingLabelSignature) ?? 0,
        acceptedFamilyContributions
      )
    );
  }
  return turn;
}

function getOrCreateReplaySequenceChild(
  index: ReplaySemanticIndex,
  node: ReplaySequenceTrieNode,
  token: string
): ReplaySequenceTrieNode {
  const existing = node.children.get(token);
  if (existing) return existing;
  const child = createReplaySequenceTrieNode(index.nextSequenceNodeId);
  index.nextSequenceNodeId += 1;
  node.children.set(token, child);
  return child;
}

/**
 * Intern prefix and suffix token sequences, then identify every bounded
 * internal rotating-marker delta by two integer node IDs. Structurally labeled
 * turns also reuse the exact suffix-node identity after their bounded label,
 * while an unlabeled turn records its full suffix-node identity, so arbitrary
 * label vocabulary cannot create an unbounded family or rotate against the
 * unlabeled base. Each turn adds at most five internal signatures per token
 * and one leading-label-family signature, while the two tries add at most two
 * nodes per replay token.
 */
function getReplaySignatures(
  index: ReplaySemanticIndex,
  tokens: readonly string[],
  leadingLabelTokenCount: number
): {
  internalDeltaSignatures: string[];
  leadingLabelSignature: number | null;
} {
  const suffixIds = new Array<number>(tokens.length + 1);
  suffixIds[tokens.length] = index.suffixSequenceRoot.id;
  let suffixNode = index.suffixSequenceRoot;
  for (let position = tokens.length - 1; position >= 0; position -= 1) {
    suffixNode = getOrCreateReplaySequenceChild(
      index,
      suffixNode,
      tokens[position]
    );
    suffixIds[position] = suffixNode.id;
  }

  const leadingLabelSignature =
    leadingLabelTokenCount > 0 && leadingLabelTokenCount < tokens.length
      ? suffixIds[leadingLabelTokenCount]
      : suffixIds[0];
  if (tokens.length < 8) {
    return {
      internalDeltaSignatures: [],
      leadingLabelSignature,
    };
  }

  const prefixIds = new Array<number>(tokens.length + 1);
  prefixIds[0] = index.prefixSequenceRoot.id;
  let prefixNode = index.prefixSequenceRoot;
  for (let position = 0; position < tokens.length; position += 1) {
    prefixNode = getOrCreateReplaySequenceChild(
      index,
      prefixNode,
      tokens[position]
    );
    prefixIds[position + 1] = prefixNode.id;
  }

  const signatures = new Set<string>();
  const addSignature = (start: number, end: number) => {
    signatures.add(`${prefixIds[start]}:${suffixIds[end]}`);
  };

  for (let boundary = 0; boundary <= tokens.length; boundary += 1) {
    addSignature(boundary, boundary);
  }

  for (let start = 0; start < tokens.length; start += 1) {
    if (!isInternalReplayIgnorableToken(tokens[start])) continue;

    for (
      let end = start + 1;
      end <= Math.min(tokens.length, start + MAX_INTERNAL_REPLAY_DELTA_TOKENS);
      end += 1
    ) {
      if (!isInternalReplayIgnorableToken(tokens[end - 1])) break;
      const unchangedTokens = tokens.length - (end - start);
      if (
        unchangedTokens < 8 ||
        unchangedTokens / Math.max(1, tokens.length) < 0.7
      ) {
        continue;
      }
      addSignature(start, end);
    }
  }

  return {
    internalDeltaSignatures: [...signatures],
    leadingLabelSignature,
  };
}

function isSemanticReplay(
  leftTokens: readonly string[],
  rightTokens: readonly string[]
): boolean {
  if (leftTokens.length < 8 || rightTokens.length < 8) return false;
  return isReplaySafeAlignedDelta(leftTokens, rightTokens);
}

const ROTATING_MARKER_TOKENS = new Set([
  "attempt",
  "nonce",
  "option",
  "trace",
  "variant",
]);
const LOW_INFORMATION_REPLAY_TOKENS = new Set([
  "alpha",
  "beta",
  "eight",
  "extra",
  "first",
  "five",
  "four",
  "gamma",
  "nine",
  "one",
  OPAQUE_NONCE_REPLAY_TOKEN,
  "second",
  "seven",
  "six",
  "ten",
  "third",
  "three",
  "two",
  "very",
]);
const ALWAYS_VOLATILE_REPLAY_TOKENS = new Set([
  OPAQUE_NONCE_REPLAY_TOKEN,
  VOLATILE_ANNOTATION_REPLAY_TOKEN,
]);
const TERMINAL_LOW_INFORMATION_REPLAY_TOKENS = new Set(["first"]);
const MARKER_CONNECTOR_TOKENS = new Set(["using", "with"]);

const BOUNDED_LEADING_REPLAY_LABEL_TOKEN = String.raw`(?:\p{L}[\p{L}\p{M}\p{N}_'’/-]{0,31}|\p{N}{1,3})`;
const BOUNDED_LEADING_REPLAY_LABEL = new RegExp(
  String.raw`^\s*(?:\[\s*(${BOUNDED_LEADING_REPLAY_LABEL_TOKEN}(?:\s+${BOUNDED_LEADING_REPLAY_LABEL_TOKEN}){0,2})\s*\]|(${BOUNDED_LEADING_REPLAY_LABEL_TOKEN}(?:\s+${BOUNDED_LEADING_REPLAY_LABEL_TOKEN}){0,2})\s*(?:[:,.;)]|\s+[\u2010-\u2015-]))\s*(?=[\p{L}\p{N}])`,
  "u"
);

/**
 * Recognize a bounded structural prefix without interpreting its vocabulary.
 * Prefix-only changes share the normalized answer-suffix family, regardless
 * of whether the prefix resembles a calendar, stage, segment, or scenario.
 */
function getBoundedLeadingReplayLabelTokenCount(text: string): number {
  const normalized = text
    .normalize("NFKC")
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "");
  const match = normalized.match(BOUNDED_LEADING_REPLAY_LABEL);
  const label = match?.[1] ?? match?.[2];
  if (!label) return 0;

  const normalizedLabel = normalizeSemanticText(label);
  const labelTokens = tokenizeReplayText(normalizedLabel);
  if (!labelTokens || labelTokens.length < 1 || labelTokens.length > 3) {
    return 0;
  }
  return labelTokens.length;
}

function isInternalReplayIgnorableToken(token: string): boolean {
  return (
    ROTATING_MARKER_TOKENS.has(token) ||
    ALWAYS_VOLATILE_REPLAY_TOKENS.has(token)
  );
}

function isReplaySafeAlignedDelta(
  leftTokens: readonly string[],
  rightTokens: readonly string[]
): boolean {
  let prefix = 0;
  while (
    prefix < leftTokens.length &&
    prefix < rightTokens.length &&
    leftTokens[prefix] === rightTokens[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < leftTokens.length - prefix &&
    suffix < rightTokens.length - prefix &&
    leftTokens[leftTokens.length - 1 - suffix] ===
      rightTokens[rightTokens.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const leftDelta = leftTokens.slice(prefix, leftTokens.length - suffix);
  const rightDelta = rightTokens.slice(prefix, rightTokens.length - suffix);
  const unchangedTokens = prefix + suffix;
  const maximumLength = Math.max(leftTokens.length, rightTokens.length);
  if (
    unchangedTokens < 8 ||
    unchangedTokens / maximumLength < 0.7 ||
    leftDelta.length > 4 ||
    rightDelta.length > 4
  ) {
    return false;
  }

  const markerBeforeDelta = leftTokens[prefix - 1];
  const markerScoped =
    suffix === 0 &&
    ((markerBeforeDelta !== undefined &&
      markerBeforeDelta === rightTokens[prefix - 1] &&
      ROTATING_MARKER_TOKENS.has(markerBeforeDelta)) ||
      ROTATING_MARKER_TOKENS.has(leftDelta[0] ?? "") ||
      ROTATING_MARKER_TOKENS.has(rightDelta[0] ?? "") ||
      (MARKER_CONNECTOR_TOKENS.has(leftDelta[0] ?? "") &&
        ROTATING_MARKER_TOKENS.has(leftDelta[1] ?? "")) ||
      (MARKER_CONNECTOR_TOKENS.has(rightDelta[0] ?? "") &&
        ROTATING_MARKER_TOKENS.has(rightDelta[1] ?? "")));
  const deltaTokens = [...leftDelta, ...rightDelta].filter(
    (token) =>
      !ROTATING_MARKER_TOKENS.has(token) &&
      !(markerScoped && MARKER_CONNECTOR_TOKENS.has(token))
  );
  const lowInformation = deltaTokens.every(
    (token) =>
      ALWAYS_VOLATILE_REPLAY_TOKENS.has(token) ||
      (suffix === 0 && TERMINAL_LOW_INFORMATION_REPLAY_TOKENS.has(token)) ||
      (markerScoped &&
        (LOW_INFORMATION_REPLAY_TOKENS.has(token) ||
          /^\d+[a-z]?$/iu.test(token)))
  );
  const terminalSingleWordInsertionOrDeletion =
    suffix === 0 &&
    leftDelta.length <= 1 &&
    rightDelta.length <= 1 &&
    (leftDelta.length === 0 || rightDelta.length === 0) &&
    deltaTokens.length > 0 &&
    deltaTokens.every((token) => /^\p{L}+$/u.test(token));
  return (
    leftDelta.length + rightDelta.length > 0 &&
    (lowInformation || terminalSingleWordInsertionOrDeletion)
  );
}

function createReplayPrefixTrieNode(): ReplayPrefixTrieNode {
  return {
    children: new Map(),
    maxAcceptedContributions: 0,
    terminalCandidates: [],
  };
}

function getMinimumReplayPrefixLength(tokens: readonly string[]): number {
  return Math.max(8, Math.ceil(tokens.length * 0.7));
}

function getReplayPrefixMatch(
  root: ReplayPrefixTrieNode,
  tokens: readonly string[]
): {
  acceptedFamilyContributions: number;
  terminalCandidates: ReplaySemanticTurn[];
} {
  const minimumPrefixLength = getMinimumReplayPrefixLength(tokens);
  const terminalCandidates = new Set<ReplaySemanticTurn>();
  if (minimumPrefixLength > tokens.length) {
    return { acceptedFamilyContributions: 0, terminalCandidates: [] };
  }

  let node = root;
  let acceptedFamilyContributions = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const child = node.children.get(tokens[index]);
    if (!child) break;
    node = child;
    const prefixLength = index + 1;
    if (prefixLength >= minimumPrefixLength) {
      acceptedFamilyContributions = Math.max(
        acceptedFamilyContributions,
        node.maxAcceptedContributions
      );
      if (tokens.length - prefixLength <= MAX_TERMINAL_REPLAY_DELTA_TOKENS) {
        for (const candidate of node.terminalCandidates) {
          terminalCandidates.add(candidate);
        }
      }
    }
  }
  return {
    acceptedFamilyContributions,
    terminalCandidates: [...terminalCandidates],
  };
}

const PROTECTED_TERMINAL_METRIC_TOKENS = new Set([
  "conversion",
  "retention",
  "revenue",
]);

/**
 * The family cap blocks unbounded arbitrary suffix rotation, but the three
 * canonical business outcomes are materially different answers rather than
 * replay labels. Preserve a one-token correction between those outcomes.
 */
function isProtectedTerminalMetricCorrection(
  priorTurns: readonly ReplaySemanticTurn[],
  tokens: readonly string[]
): boolean {
  return priorTurns.some((priorTurn) => {
    const priorTokens = priorTurn.tokens;
    let prefix = 0;
    while (
      prefix < priorTokens.length &&
      prefix < tokens.length &&
      priorTokens[prefix] === tokens[prefix]
    ) {
      prefix += 1;
    }
    const maximumLength = Math.max(priorTokens.length, tokens.length);
    if (prefix < 8 || prefix / maximumLength < 0.7) return false;
    if (priorTokens.length - prefix !== 1 || tokens.length - prefix !== 1) {
      return false;
    }

    const priorMetric = priorTokens[prefix];
    const correctedMetric = tokens[prefix];
    return (
      priorMetric !== correctedMetric &&
      PROTECTED_TERMINAL_METRIC_TOKENS.has(priorMetric) &&
      PROTECTED_TERMINAL_METRIC_TOKENS.has(correctedMetric)
    );
  });
}

function addReplayPrefixObservation(
  root: ReplayPrefixTrieNode,
  turn: ReplaySemanticTurn,
  accepted: boolean
): void {
  const { tokens } = turn;
  const minimumPrefixLength = getMinimumReplayPrefixLength(tokens);
  if (minimumPrefixLength > tokens.length) return;

  let node = root;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    let child = node.children.get(token);
    if (!child) {
      child = createReplayPrefixTrieNode();
      node.children.set(token, child);
    }
    node = child;
    if (index + 1 >= minimumPrefixLength) {
      node.maxAcceptedContributions = Math.max(
        node.maxAcceptedContributions,
        turn.acceptedFamilyContributions
      );
      if (
        accepted &&
        tokens.length - (index + 1) <= MAX_TERMINAL_REPLAY_DELTA_TOKENS &&
        node.terminalCandidates.length < MAX_REPLAY_CANDIDATES_PER_TERMINAL_KEY
      ) {
        node.terminalCandidates.push(turn);
      }
    }
  }
}

function isCorruptedTranscriptText(text: string): boolean {
  return (
    text.length > 20_000 ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/u.test(text)
  );
}

interface ComparableCharacter {
  start: number;
  end: number;
}

function projectComparableText(value: string, trim = false) {
  let text = "";
  const map: ComparableCharacter[] = [];

  for (let index = 0; index < value.length; ) {
    const point = value.codePointAt(index);
    if (point === undefined) break;
    const sourceCharacter = String.fromCodePoint(point);
    const end = index + sourceCharacter.length;
    const normalized = normalizeComparableCharacter(sourceCharacter);

    for (const character of normalized) {
      if (/\s/u.test(character)) {
        if (text.endsWith(" ")) {
          map[map.length - 1] = { start: map[map.length - 1].start, end };
        } else {
          text += " ";
          map.push({ start: index, end });
        }
      } else {
        text += character;
        map.push({ start: index, end });
      }
    }
    index = end;
  }

  if (!trim) return { text, map };
  const leading = text.length - text.trimStart().length;
  const trailing = text.length - text.trimEnd().length;
  return {
    text: text.slice(leading, text.length - trailing),
    map: map.slice(leading, map.length - trailing),
  };
}

function normalizeComparableCharacter(character: string): string {
  return character
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-");
}
