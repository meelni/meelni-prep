import { isExactFeedbackTranscriptReplayText } from "./feedback-transcript";

export const ANSWER_BLOCK_CONTRACT_VERSION = 1 as const;
export const ANSWER_BLOCK_MAX_CONTINUATION_GAP_MS = 5_000 as const;

export type AnswerBlockSpeaker = "user" | "interviewer";
export type AnswerBlockDeliveryState = "delivered" | "partially_delivered";

interface AnswerBlockCanonicalSpeechEvent {
  contractVersion: 2;
  eventId: string;
  writerId: string;
  writerGeneration: number;
  sequence: number;
  speaker: AnswerBlockSpeaker;
  text: string;
  isFinal: true;
  startedAtMs: number;
  endedAtMs: number;
  audioDurationMs: number;
  section: string;
  deliveryState: AnswerBlockDeliveryState;
}

export interface CanonicalAnswerBlockTurn
  extends AnswerBlockCanonicalSpeechEvent {
  kind: "turn";
}

/**
 * A canonical turn removed from reviewable evidence as a semantic replay.
 * It advances ledger continuity and preserves structural boundaries without
 * becoming answer text, evidence, or citation provenance.
 */
export interface AnswerBlockSemanticReplayTurn
  extends AnswerBlockCanonicalSpeechEvent {
  kind: "semantic_replay";
  replayOfEventId: string;
}

/** A known non-exact replay-family omission that must remain a boundary. */
export interface AnswerBlockSemanticReplayBoundaryTurn
  extends AnswerBlockCanonicalSpeechEvent {
  kind: "semantic_replay_boundary";
}

export interface AnswerBlockIntegrityBoundaryEvent {
  kind: "integrity_boundary";
  eventId: string;
  writerId: string;
  writerGeneration: number;
  sequence: number;
  speaker: AnswerBlockSpeaker;
  occurredAtMs: number;
  reason: "no_provider_confirmed_prefix" | "canonicalization_failed";
}

export interface AnswerBlockCutoffEvent {
  kind: "cutoff";
  occurredAtMs: number;
  reason: "session_cutoff";
}

export interface AnswerBlockSessionEndEvent {
  kind: "session_end";
  occurredAtMs: number;
}

export type AnswerBlockLedgerEvent =
  | CanonicalAnswerBlockTurn
  | AnswerBlockSemanticReplayTurn
  | AnswerBlockSemanticReplayBoundaryTurn
  | AnswerBlockIntegrityBoundaryEvent
  | AnswerBlockCutoffEvent
  | AnswerBlockSessionEndEvent;

export type AnswerBlockBoundaryKind =
  | "interviewer_follow_up"
  | "speaker_change"
  | "interruption_marker"
  | "canonicalization_failure"
  | "long_silence"
  | "session_cutoff"
  | "writer_generation"
  | "sequence_gap"
  | "semantic_replay"
  | "section_change"
  | "invalid_timing"
  | "session_end"
  | "input_exhausted";

export interface AnswerBlockBoundary {
  kind: AnswerBlockBoundaryKind;
  afterEventId: string | null;
  beforeEventId: string | null;
  boundaryEventId: string | null;
}

export interface AnswerBlockSourceTurn {
  readonly eventId: string;
  readonly writerId: string;
  readonly writerGeneration: number;
  readonly sequence: number;
  readonly speaker: AnswerBlockSpeaker;
  readonly text: string;
  readonly textUtf8Bytes: Uint8Array;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly audioDurationMs: number;
  readonly section: string;
  readonly deliveryState: AnswerBlockDeliveryState;
}

export interface CandidateAnswerBlock {
  contractVersion: typeof ANSWER_BLOCK_CONTRACT_VERSION;
  answerBlockId: string;
  ordinal: number;
  prompt: readonly AnswerBlockSourceTurn[];
  response: readonly AnswerBlockSourceTurn[];
  promptText: string;
  responseText: string;
  startedAtMs: number;
  endedAtMs: number;
  closedBy: AnswerBlockBoundaryKind;
}

export interface AnswerBlockDerivationIssue {
  code:
    | "duplicate_event_id"
    | "event_after_session_end"
    | "integrity_boundary"
    | "invalid_ledger_order"
    | "invalid_replay_continuity"
    | "invalid_turn";
  eventId: string | null;
}

export interface DerivedAnswerBlocks {
  blocks: CandidateAnswerBlock[];
  boundaries: AnswerBlockBoundary[];
  issues: AnswerBlockDerivationIssue[];
  eligible: boolean;
}

export interface AnswerBlockReviewabilityInput {
  answerBlockId: string;
  promptText: string;
  responseText: string;
}

interface PendingAnswerBlock {
  prompt: AnswerBlockSourceTurn[];
  response: AnswerBlockSourceTurn[];
}

/**
 * Derive candidate-answer units from an already ordered canonical ledger.
 * The immutable source turns remain citation authority; normalized block text
 * exists only for deterministic reviewability and presentation decisions.
 */
export function deriveCandidateAnswerBlocks(
  events: readonly AnswerBlockLedgerEvent[],
  options: { maxContinuationGapMs?: number } = {}
): DerivedAnswerBlocks {
  const maxContinuationGapMs =
    options.maxContinuationGapMs ?? ANSWER_BLOCK_MAX_CONTINUATION_GAP_MS;
  if (!Number.isSafeInteger(maxContinuationGapMs) || maxContinuationGapMs < 0) {
    throw new Error("answer_block_invalid_max_continuation_gap");
  }

  const blocks: CandidateAnswerBlock[] = [];
  const boundaries: AnswerBlockBoundary[] = [];
  const issues: AnswerBlockDerivationIssue[] = [];
  const eventIds = new Set<string>();
  const lastSequenceByWriter = new Map<string, number>();
  const acceptedTurnsByEventId = new Map<string, CanonicalAnswerBlockTurn>();
  let currentPrompt: AnswerBlockSourceTurn[] = [];
  let current: PendingAnswerBlock | null = null;
  let previousTurn: AnswerBlockCanonicalSpeechEvent | null = null;
  let pendingReplayFamilyPromptEventId: string | null = null;
  let sessionEnded = false;

  const closeCurrent = (
    closedBy: AnswerBlockBoundaryKind,
    boundary: Omit<AnswerBlockBoundary, "kind"> = {
      afterEventId: current?.response.at(-1)?.eventId ?? null,
      beforeEventId: null,
      boundaryEventId: null,
    }
  ) => {
    if (!current) return;
    const response = current.response;
    const ordinal = blocks.length + 1;
    boundaries.push({ kind: closedBy, ...boundary });
    blocks.push({
      contractVersion: ANSWER_BLOCK_CONTRACT_VERSION,
      answerBlockId: `answer-block:${String(ordinal).padStart(4, "0")}`,
      ordinal,
      prompt: current.prompt,
      response,
      promptText: joinBlockText(current.prompt),
      responseText: joinBlockText(response),
      startedAtMs: response[0]!.startedAtMs,
      endedAtMs: response.at(-1)!.endedAtMs,
      closedBy,
    });
    current = null;
  };

  const closeOrRecordBoundary = (
    kind: AnswerBlockBoundaryKind,
    boundary: Omit<AnswerBlockBoundary, "kind">
  ) => {
    if (current) closeCurrent(kind, boundary);
    else boundaries.push({ kind, ...boundary });
  };

  for (const event of events) {
    const eventId = "eventId" in event ? event.eventId : null;
    if (sessionEnded) {
      issues.push({ code: "event_after_session_end", eventId });
      continue;
    }
    if (eventId && eventIds.has(eventId)) {
      closeOrRecordBoundary("canonicalization_failure", {
        afterEventId: current?.response.at(-1)?.eventId ?? null,
        beforeEventId: eventId,
        boundaryEventId: eventId,
      });
      issues.push({ code: "duplicate_event_id", eventId });
      currentPrompt = [];
      previousTurn = null;
      pendingReplayFamilyPromptEventId = null;
      continue;
    }
    if (eventId) eventIds.add(eventId);

    if (event.kind === "session_end") {
      if (previousTurn && previousTurn.endedAtMs > event.occurredAtMs) {
        closeOrRecordBoundary("invalid_timing", {
          afterEventId: previousTurn.eventId,
          beforeEventId: null,
          boundaryEventId: null,
        });
        issues.push({
          code: "invalid_ledger_order",
          eventId: previousTurn.eventId,
        });
      }
      closeOrRecordBoundary("session_end", {
        afterEventId: previousTurn?.eventId ?? null,
        beforeEventId: null,
        boundaryEventId: null,
      });
      currentPrompt = [];
      previousTurn = null;
      pendingReplayFamilyPromptEventId = null;
      sessionEnded = true;
      continue;
    }
    if (event.kind === "cutoff") {
      if (previousTurn && previousTurn.endedAtMs > event.occurredAtMs) {
        closeOrRecordBoundary("invalid_timing", {
          afterEventId: previousTurn.eventId,
          beforeEventId: null,
          boundaryEventId: null,
        });
        issues.push({
          code: "invalid_ledger_order",
          eventId: previousTurn.eventId,
        });
      }
      closeOrRecordBoundary("session_cutoff", {
        afterEventId: previousTurn?.eventId ?? null,
        beforeEventId: null,
        boundaryEventId: null,
      });
      currentPrompt = [];
      previousTurn = null;
      pendingReplayFamilyPromptEventId = null;
      sessionEnded = true;
      continue;
    }

    const hadOpenCandidateBlock = current !== null;
    const sequenceIssue = recordWriterSequence(event, lastSequenceByWriter);
    if (sequenceIssue) {
      closeOrRecordBoundary(sequenceIssue.boundary, {
        afterEventId: previousTurn?.eventId ?? null,
        beforeEventId: event.eventId,
        boundaryEventId: null,
      });
      if (sequenceIssue.fatal) {
        issues.push({ code: "invalid_ledger_order", eventId: event.eventId });
        currentPrompt = [];
        previousTurn = null;
        pendingReplayFamilyPromptEventId = null;
      }
    }

    if (event.kind === "integrity_boundary") {
      const boundaryKind =
        event.reason === "canonicalization_failed"
          ? "canonicalization_failure"
          : "interruption_marker";
      closeOrRecordBoundary(boundaryKind, {
        afterEventId: current?.response.at(-1)?.eventId ?? null,
        beforeEventId: null,
        boundaryEventId: event.eventId,
      });
      if (
        event.reason === "canonicalization_failed" ||
        event.speaker === "user"
      ) {
        issues.push({ code: "integrity_boundary", eventId: event.eventId });
      }
      currentPrompt = [];
      previousTurn = null;
      pendingReplayFamilyPromptEventId = null;
      continue;
    }

    if (!isCanonicalAnswerBlockSpeechEvent(event)) {
      closeOrRecordBoundary("canonicalization_failure", {
        afterEventId: previousTurn?.eventId ?? null,
        beforeEventId: event.eventId || null,
        boundaryEventId: event.eventId || null,
      });
      issues.push({ code: "invalid_turn", eventId: event.eventId || null });
      currentPrompt = [];
      previousTurn = null;
      pendingReplayFamilyPromptEventId = null;
      continue;
    }

    const transition = previousTurn
      ? classifyTurnTransition(previousTurn, event, maxContinuationGapMs)
      : null;
    if (transition && transition !== sequenceIssue?.boundary) {
      closeOrRecordBoundary(transition, {
        afterEventId: previousTurn?.eventId ?? null,
        beforeEventId: event.eventId,
        boundaryEventId: null,
      });
      if (transition === "invalid_timing") {
        issues.push({ code: "invalid_ledger_order", eventId: event.eventId });
        currentPrompt = [];
      }
    }

    if (event.kind === "semantic_replay") {
      const anchor = acceptedTurnsByEventId.get(event.replayOfEventId);
      const attemptedCandidateBridge =
        hadOpenCandidateBlock && event.speaker === "user";
      const validAnchor =
        anchor !== undefined &&
        anchor.speaker === event.speaker &&
        anchor.writerId === event.writerId &&
        anchor.writerGeneration === event.writerGeneration &&
        isExactFeedbackTranscriptReplayText(event.text, anchor.text);
      const validCandidateContinuity =
        !attemptedCandidateBridge ||
        (previousTurn?.speaker === "user" &&
          anchor?.eventId === previousTurn.eventId &&
          previousTurn.writerId === event.writerId &&
          previousTurn.writerGeneration === event.writerGeneration &&
          sequenceIssue === null &&
          transition === null);
      if (!validAnchor || !validCandidateContinuity) {
        issues.push({
          code: "invalid_replay_continuity",
          eventId: event.eventId,
        });
        currentPrompt = [];
        previousTurn = null;
        continue;
      }
      if (
        event.speaker === "interviewer" &&
        previousTurn?.speaker !== "interviewer"
      ) {
        currentPrompt = [];
      }
      previousTurn = event;
      continue;
    }
    if (event.kind === "semantic_replay_boundary") {
      closeOrRecordBoundary("semantic_replay", {
        afterEventId: current?.response.at(-1)?.eventId ?? null,
        beforeEventId: event.eventId,
        boundaryEventId: event.eventId,
      });
      if (event.speaker === "user" || hadOpenCandidateBlock) {
        issues.push({
          code: "invalid_replay_continuity",
          eventId: event.eventId,
        });
        pendingReplayFamilyPromptEventId = null;
      } else {
        pendingReplayFamilyPromptEventId = event.eventId;
      }
      if (event.speaker === "interviewer") currentPrompt = [];
      previousTurn = event;
      continue;
    }

    const source = toSourceTurn(event);
    acceptedTurnsByEventId.set(event.eventId, event);
    if (event.speaker === "interviewer") {
      pendingReplayFamilyPromptEventId = null;
      currentPrompt =
        previousTurn?.speaker === "interviewer" && transition === null
          ? [...currentPrompt, source]
          : [source];
    } else {
      if (pendingReplayFamilyPromptEventId) {
        issues.push({
          code: "invalid_replay_continuity",
          eventId: pendingReplayFamilyPromptEventId,
        });
        pendingReplayFamilyPromptEventId = null;
      }
      if (current) current.response.push(source);
      else current = { prompt: [...currentPrompt], response: [source] };
    }
    previousTurn = event;
  }

  if (current) closeCurrent("input_exhausted");
  return {
    blocks,
    boundaries,
    issues,
    eligible: issues.length === 0,
  };
}

export function projectAnswerBlocksForReviewability(
  blocks: readonly CandidateAnswerBlock[]
): AnswerBlockReviewabilityInput[] {
  return blocks.map((block) => ({
    answerBlockId: block.answerBlockId,
    promptText: block.promptText,
    responseText: block.responseText,
  }));
}

function recordWriterSequence(
  event:
    | CanonicalAnswerBlockTurn
    | AnswerBlockSemanticReplayTurn
    | AnswerBlockSemanticReplayBoundaryTurn
    | AnswerBlockIntegrityBoundaryEvent,
  lastSequenceByWriter: Map<string, number>
): { boundary: "sequence_gap"; fatal: boolean } | null {
  const writerKey = `${event.writerGeneration}\u0000${event.writerId}`;
  const previousSequence = lastSequenceByWriter.get(writerKey);
  lastSequenceByWriter.set(writerKey, event.sequence);
  if (
    previousSequence === undefined ||
    event.sequence === previousSequence + 1
  ) {
    return null;
  }
  return {
    boundary: "sequence_gap",
    fatal: true,
  };
}

function classifyTurnTransition(
  previous: AnswerBlockCanonicalSpeechEvent,
  current: AnswerBlockCanonicalSpeechEvent,
  maxContinuationGapMs: number
): AnswerBlockBoundaryKind | null {
  if (current.endedAtMs < previous.startedAtMs) return "invalid_timing";
  if (previous.speaker !== current.speaker) {
    return current.speaker === "interviewer"
      ? "interviewer_follow_up"
      : "speaker_change";
  }
  if (current.startedAtMs < previous.endedAtMs) return "invalid_timing";
  if (
    previous.writerGeneration !== current.writerGeneration ||
    previous.writerId !== current.writerId
  ) {
    return "writer_generation";
  }
  if (previous.section !== current.section) return "section_change";
  if (current.startedAtMs - previous.endedAtMs > maxContinuationGapMs) {
    return "long_silence";
  }
  return null;
}

function isCanonicalAnswerBlockSpeechEvent(
  turn:
    | CanonicalAnswerBlockTurn
    | AnswerBlockSemanticReplayTurn
    | AnswerBlockSemanticReplayBoundaryTurn
): boolean {
  return (
    turn.contractVersion === 2 &&
    turn.isFinal === true &&
    Boolean(turn.eventId) &&
    Boolean(turn.writerId) &&
    Number.isSafeInteger(turn.writerGeneration) &&
    turn.writerGeneration > 0 &&
    Number.isSafeInteger(turn.sequence) &&
    turn.sequence > 0 &&
    (turn.speaker === "user" || turn.speaker === "interviewer") &&
    Boolean(turn.text.trim()) &&
    Number.isFinite(turn.startedAtMs) &&
    Number.isFinite(turn.endedAtMs) &&
    turn.endedAtMs > turn.startedAtMs &&
    Number.isSafeInteger(turn.audioDurationMs) &&
    turn.audioDurationMs > 0 &&
    Math.abs(turn.endedAtMs - turn.startedAtMs - turn.audioDurationMs) <= 1 &&
    Boolean(turn.section) &&
    (turn.kind !== "semantic_replay" || Boolean(turn.replayOfEventId)) &&
    (turn.deliveryState === "delivered" ||
      turn.deliveryState === "partially_delivered")
  );
}

function toSourceTurn(turn: CanonicalAnswerBlockTurn): AnswerBlockSourceTurn {
  return {
    eventId: turn.eventId,
    writerId: turn.writerId,
    writerGeneration: turn.writerGeneration,
    sequence: turn.sequence,
    speaker: turn.speaker,
    text: turn.text,
    textUtf8Bytes: new TextEncoder().encode(turn.text),
    startedAtMs: turn.startedAtMs,
    endedAtMs: turn.endedAtMs,
    audioDurationMs: turn.audioDurationMs,
    section: turn.section,
    deliveryState: turn.deliveryState,
  };
}

function joinBlockText(turns: readonly AnswerBlockSourceTurn[]): string {
  return turns
    .map((turn) => turn.text.trim())
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}
