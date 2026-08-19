"""Pure deterministic controller for the full-interview runtime.

The controller owns intent and time projection. It has no LiveKit or provider
dependency, and it never treats generated or spoken output as delivered history.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, TypeAlias

from shared.interviewer_contracts import (
    INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION,
    is_interview_runtime_state,
)
from shared.session_deadline import parse_deadline_at, serialize_deadline_at


CONTROLLER_STATE_CONTRACT_VERSION = "deterministic-interview-controller.v1"
CONTROLLER_SNAPSHOT_CONTRACT_VERSION = "interview-controller-snapshot.v1"
CONTROLLER_POLICY_VERSION = "deterministic-interview-policy.v1"
WARNING_REMAINING_MS = 120_000
CLOSING_REMAINING_MS = 45_000
MAX_MOVE_LEDGER_ENTRIES = 24
MAX_CANDIDATE_FINGERPRINTS = 8
MAX_RECENT_DELIVERED_MOVES = 8
MAX_SNAPSHOT_BYTES = 2_048

_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]*$")
_SHA256 = re.compile(r"^sha256:[a-f0-9]{64}$")

MoveType: TypeAlias = Literal["probe", "clarify", "challenge", "transition", "close"]
MoveStage: TypeAlias = Literal[
    "admitted",
    "generated",
    "scheduled",
    "spoken",
    "interrupted",
    "canonically_delivered",
    "aborted",
]
ClockBand: TypeAlias = Literal["normal", "warning", "closing", "elapsed"]
Phase: TypeAlias = Literal[
    "opening",
    "primary_question",
    "follow_up",
    "transition",
    "closing",
    "closed",
]
WarningState: TypeAlias = Literal["pending", "admitted", "delivered", "skipped"]
InterruptionState: TypeAlias = Literal[
    "clear",
    "candidate_speaking",
    "interviewer_interrupted",
    "recovery_pending",
]
CloseState: TypeAlias = Literal["open", "requested", "admitted", "speech_fenced"]
AnswerShape: TypeAlias = Literal["silence", "short", "normal", "long", "repeated"]


class ControllerError(ValueError):
    """Stable controller failure identity used by the safe runtime adapter."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(f"Interview controller failure: {code}")


@dataclass(frozen=True)
class ControllerClock:
    started_at: str
    deadline_at: str
    observed_at: str
    monotonic_anchor_ms: int
    remaining_ms: int
    band: ClockBand


@dataclass(frozen=True)
class DeliveryEvidence:
    evidence_type: Literal["transcript_event", "interruption_marker"]
    event_id: str
    writer_id: str
    writer_generation: int
    sequence: int
    delivery_state: Literal["delivered", "partially_delivered"] | None = None
    reason: Literal["no_provider_confirmed_prefix"] | None = None


@dataclass(frozen=True)
class ControllerMove:
    move_id: str
    move_type: MoveType
    reason_code: str
    question_id: str
    topic: str
    source_turn_id: str
    target_turn_ids: tuple[str, ...]
    stage: MoveStage
    updated_at: str
    delivery_evidence: DeliveryEvidence | None
    recovery_of_move_id: str | None
    clarifies_move_id: str | None
    intentional_clarification: bool
    includes_warning: bool


@dataclass(frozen=True)
class CandidateFingerprint:
    turn_id: str
    digest: str


@dataclass(frozen=True)
class ControllerState:
    contract_version: str
    policy_version: str
    session_id: str
    brief_id: str
    state_revision: int
    lifecycle_state: str
    lifecycle_version: int
    writer_id: str
    writer_generation: int
    phase: Phase
    round_objectives: tuple[str, ...]
    objective_index: int
    topic_catalog: tuple[str, ...]
    topic_index: int
    active_question_id: str
    clock: ControllerClock
    warning_state: WarningState
    interruption_state: InterruptionState
    close_state: CloseState
    speech_fenced: bool
    terminal: bool
    allowed_moves: tuple[MoveType, ...]
    move_ledger: tuple[ControllerMove, ...]
    pending_move_id: str | None
    move_ordinal: int
    last_finalized_candidate_turn_id: str | None
    last_finalized_candidate_transcript_revision: str | None
    candidate_fingerprints: tuple[CandidateFingerprint, ...]

    @property
    def round_objective_id(self) -> str:
        return self.round_objectives[self.objective_index]

    @property
    def current_topic(self) -> str:
        return self.topic_catalog[self.topic_index]

    def to_wire(self) -> dict[str, Any]:
        return asdict(self)

    def to_runtime_state(self) -> dict[str, Any]:
        ledger: list[dict[str, Any]] = []
        for move in self.move_ledger:
            stage = move.stage
            evidence = _evidence_wire(move.delivery_evidence)
            ledger.append(
                {
                    "move_id": move.move_id,
                    "move_type": move.move_type,
                    "delivery_state": stage,
                    "question_id": move.question_id,
                    "target_turn_ids": list(move.target_turn_ids),
                    "updated_at": move.updated_at,
                    "delivery_evidence": evidence,
                }
            )
        runtime_state = {
            "contract_version": INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION,
            "session_id": self.session_id,
            "brief_id": self.brief_id,
            "state_revision": self.state_revision,
            "lifecycle_snapshot": {
                "state": self.lifecycle_state,
                "version": self.lifecycle_version,
            },
            "active_writer": {
                "writer_id": self.writer_id,
                "writer_generation": self.writer_generation,
            },
            "controller_phase": self.phase,
            "round_objective_id": self.round_objective_id,
            "current_topic": self.current_topic,
            "active_question_id": self.active_question_id,
            "clock": {
                "started_at": self.clock.started_at,
                "deadline_at": self.clock.deadline_at,
                "observed_at": self.clock.observed_at,
                "remaining_ms": self.clock.remaining_ms,
                "band": self.clock.band,
            },
            "allowed_moves": list(self.allowed_moves),
            "probe_ledger": ledger,
            "last_finalized_candidate_turn_id": self.last_finalized_candidate_turn_id,
            "last_finalized_candidate_transcript_revision": (
                self.last_finalized_candidate_transcript_revision
            ),
            "interruption_state": self.interruption_state,
            "close_state": self.close_state,
            "speech_fenced": self.speech_fenced,
        }
        if not is_interview_runtime_state(runtime_state):
            raise ControllerError("invalid_runtime_projection")
        return runtime_state


@dataclass(frozen=True)
class ControllerSnapshot:
    payload: dict[str, Any]

    def to_json(self) -> str:
        encoded = json.dumps(
            self.payload,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        if len(encoded.encode("utf-8")) > MAX_SNAPSHOT_BYTES:
            raise ControllerError("snapshot_too_large")
        return encoded

    def to_prompt_instruction(self) -> str:
        return f"CONTROLLER_SNAPSHOT {self.to_json()}"


@dataclass(frozen=True)
class ControllerTransition:
    state: ControllerState
    snapshot: ControllerSnapshot | None = None


@dataclass(frozen=True)
class CandidateTurnCompleted:
    expected_state_revision: int
    turn_id: str
    transcript_revision: str
    text: str
    duration_ms: int
    monotonic_ms: int
    requested_clarification: bool = False
    requested_exit: bool = False


@dataclass(frozen=True)
class ClockObserved:
    expected_state_revision: int
    monotonic_ms: int


@dataclass(frozen=True)
class MoveStageAdvanced:
    expected_state_revision: int
    move_id: str
    stage: Literal["generated", "scheduled", "spoken"]
    monotonic_ms: int


@dataclass(frozen=True)
class SpeechInterrupted:
    expected_state_revision: int
    move_id: str
    monotonic_ms: int
    persisted_marker: DeliveryEvidence | None = None


@dataclass(frozen=True)
class PersistedTranscriptEvidence:
    expected_state_revision: int
    move_id: str
    evidence: DeliveryEvidence
    monotonic_ms: int


@dataclass(frozen=True)
class WriterReconnected:
    expected_state_revision: int
    writer_id: str
    writer_generation: int
    lifecycle_version: int
    monotonic_ms: int


@dataclass(frozen=True)
class TerminalSettled:
    expected_state_revision: int
    monotonic_ms: int


ControllerEvent: TypeAlias = (
    CandidateTurnCompleted
    | ClockObserved
    | MoveStageAdvanced
    | SpeechInterrupted
    | PersistedTranscriptEvidence
    | WriterReconnected
    | TerminalSettled
)


def create_controller_state(
    *,
    session_id: str,
    brief_id: str,
    writer_id: str,
    writer_generation: int,
    lifecycle_state: str,
    lifecycle_version: int,
    started_at: str,
    deadline_at: str,
    observed_at: str,
    monotonic_anchor_ms: int,
    round_objectives: tuple[str, ...],
    topic_catalog: tuple[str, ...],
    active_question_id: str,
) -> ControllerState:
    clock = _initial_clock(
        started_at=started_at,
        deadline_at=deadline_at,
        observed_at=observed_at,
        monotonic_anchor_ms=monotonic_anchor_ms,
    )
    elapsed = clock.band == "elapsed"
    closing = clock.band == "closing"
    state = ControllerState(
        contract_version=CONTROLLER_STATE_CONTRACT_VERSION,
        policy_version=CONTROLLER_POLICY_VERSION,
        session_id=session_id,
        brief_id=brief_id,
        state_revision=0,
        lifecycle_state=lifecycle_state,
        lifecycle_version=lifecycle_version,
        writer_id=writer_id,
        writer_generation=writer_generation,
        phase="closed" if elapsed else "closing" if closing else "primary_question",
        round_objectives=round_objectives,
        objective_index=0,
        topic_catalog=topic_catalog,
        topic_index=0,
        active_question_id=active_question_id,
        clock=clock,
        warning_state="skipped" if closing or elapsed else "pending",
        interruption_state="clear",
        close_state=("speech_fenced" if elapsed else "requested" if closing else "open"),
        speech_fenced=elapsed,
        terminal=elapsed,
        allowed_moves=(),
        move_ledger=(),
        pending_move_id=None,
        move_ordinal=0,
        last_finalized_candidate_turn_id=None,
        last_finalized_candidate_transcript_revision=None,
        candidate_fingerprints=(),
    )
    state = replace(state, allowed_moves=derive_allowed_moves(state))
    _validate_state(state)
    state.to_runtime_state()
    return state


def parse_controller_state(raw: str | dict[str, Any]) -> ControllerState:
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError as error:
        raise ControllerError("invalid_json") from error
    if not isinstance(value, dict):
        raise ControllerError("invalid_state")
    if value.get("contract_version") != CONTROLLER_STATE_CONTRACT_VERSION:
        raise ControllerError("unsupported_contract")
    try:
        clock = ControllerClock(**value["clock"])
        moves = tuple(
            ControllerMove(
                **{
                    **move,
                    "target_turn_ids": tuple(move["target_turn_ids"]),
                    "delivery_evidence": (
                        DeliveryEvidence(**move["delivery_evidence"])
                        if move["delivery_evidence"] is not None
                        else None
                    ),
                }
            )
            for move in value["move_ledger"]
        )
        fingerprints = tuple(
            CandidateFingerprint(**fingerprint)
            for fingerprint in value["candidate_fingerprints"]
        )
        state = ControllerState(
            **{
                **value,
                "clock": clock,
                "round_objectives": tuple(value["round_objectives"]),
                "topic_catalog": tuple(value["topic_catalog"]),
                "allowed_moves": tuple(value["allowed_moves"]),
                "move_ledger": moves,
                "candidate_fingerprints": fingerprints,
            }
        )
    except (KeyError, TypeError, ValueError) as error:
        raise ControllerError("invalid_state") from error
    _validate_state(state)
    state.to_runtime_state()
    return state


def reduce_controller(state: ControllerState, event: ControllerEvent) -> ControllerTransition:
    _validate_state(state)
    _validate_event_shape(event)
    _require_revision(state, event.expected_state_revision)
    if state.terminal:
        return ControllerTransition(state)
    if isinstance(event, CandidateTurnCompleted):
        return _complete_candidate_turn(state, event)
    if isinstance(event, ClockObserved):
        return ControllerTransition(_advance_clock(state, event.monotonic_ms))
    if isinstance(event, MoveStageAdvanced):
        return ControllerTransition(_advance_move_stage(state, event))
    if isinstance(event, SpeechInterrupted):
        return ControllerTransition(_interrupt_move(state, event))
    if isinstance(event, PersistedTranscriptEvidence):
        return ControllerTransition(_commit_delivery(state, event))
    if isinstance(event, WriterReconnected):
        return ControllerTransition(_reconnect_writer(state, event))
    if isinstance(event, TerminalSettled):
        return ControllerTransition(_settle_terminal(state, event.monotonic_ms))
    raise ControllerError("unknown_event")


def derive_allowed_moves(state: ControllerState) -> tuple[MoveType, ...]:
    if state.terminal or state.speech_fenced or state.clock.band == "elapsed":
        return ()
    if state.pending_move_id is not None:
        return ()
    if state.phase == "closing" or state.close_state in ("requested", "admitted"):
        return ("close",)
    return ("probe", "clarify", "challenge", "transition", "close")


def classify_candidate_turn(
    state: ControllerState,
    *,
    text: str,
    duration_ms: int,
) -> tuple[AnswerShape, str | None]:
    normalized = " ".join(text.casefold().split())
    digest = _candidate_digest(normalized) if normalized else None
    if not normalized:
        return "silence", None
    if digest in {item.digest for item in state.candidate_fingerprints}:
        return "repeated", digest
    words = normalized.split()
    if len(words) <= 6 or duration_ms < 2_000:
        return "short", digest
    if len(words) >= 80 or duration_ms >= 60_000:
        return "long", digest
    return "normal", digest


def _complete_candidate_turn(
    state: ControllerState, event: CandidateTurnCompleted
) -> ControllerTransition:
    if event.turn_id == state.last_finalized_candidate_turn_id:
        raise ControllerError("stale_candidate_turn")
    if state.pending_move_id is not None:
        raise ControllerError("pending_move")

    projected = _advance_clock(state, event.monotonic_ms, increment_revision=False)
    shape, digest = classify_candidate_turn(
        projected, text=event.text, duration_ms=event.duration_ms
    )
    fingerprints = projected.candidate_fingerprints
    if digest is not None:
        fingerprints = (*fingerprints, CandidateFingerprint(event.turn_id, digest))[
            -MAX_CANDIDATE_FINGERPRINTS:
        ]
    base = replace(
        projected,
        last_finalized_candidate_turn_id=event.turn_id,
        last_finalized_candidate_transcript_revision=event.transcript_revision,
        candidate_fingerprints=fingerprints,
    )
    if base.clock.band == "elapsed":
        return ControllerTransition(_revised(base, allowed_moves=()))

    move_type, reason_code, topic_index, objective_index, recovery = _select_move(
        base,
        answer_shape=shape,
        requested_clarification=event.requested_clarification,
        requested_exit=event.requested_exit,
    )
    ordinal = base.move_ordinal + 1
    move_id = f"move:{base.session_id}:{ordinal}"
    intentional_clarification = move_type == "clarify"
    clarifies_move_id = (
        _last_delivered_move(base).move_id
        if intentional_clarification and _last_delivered_move(base) is not None
        else None
    )
    includes_warning = base.clock.band == "warning" and base.warning_state != "delivered"
    move = ControllerMove(
        move_id=move_id,
        move_type=move_type,
        reason_code=reason_code,
        question_id=base.active_question_id,
        topic=base.topic_catalog[topic_index],
        source_turn_id=event.turn_id,
        target_turn_ids=(event.turn_id,),
        stage="admitted",
        updated_at=base.clock.observed_at,
        delivery_evidence=None,
        recovery_of_move_id=recovery.move_id if recovery is not None else None,
        clarifies_move_id=clarifies_move_id,
        intentional_clarification=intentional_clarification,
        includes_warning=includes_warning,
    )
    phase: Phase = "closing" if move_type == "close" else base.phase
    if move_type == "transition":
        phase = "transition"
    close_state: CloseState = "admitted" if move_type == "close" else base.close_state
    warning_state: WarningState = (
        "admitted" if includes_warning else base.warning_state
    )
    admitted = _revised(
        base,
        phase=phase,
        objective_index=objective_index,
        topic_index=topic_index,
        warning_state=warning_state,
        close_state=close_state,
        move_ledger=_append_bounded_move(base.move_ledger, move),
        pending_move_id=move_id,
        move_ordinal=ordinal,
        allowed_moves=(),
    )
    _validate_state(admitted)
    admitted.to_runtime_state()
    snapshot = _build_snapshot(admitted, move, answer_shape=shape)
    snapshot.to_json()
    return ControllerTransition(admitted, snapshot)


def _select_move(
    state: ControllerState,
    *,
    answer_shape: AnswerShape,
    requested_clarification: bool,
    requested_exit: bool,
) -> tuple[MoveType, str, int, int, ControllerMove | None]:
    recovery = _last_recoverable_move(state)
    if (
        requested_exit
        or state.clock.band == "closing"
        or state.close_state == "requested"
    ):
        reason = "candidate_requested_close" if requested_exit else "deadline_close"
        return "close", reason, state.topic_index, state.objective_index, None
    if _catalog_exhausted(state):
        return (
            "close",
            "catalog_exhausted",
            state.topic_index,
            state.objective_index,
            None,
        )
    if recovery is not None:
        return (
            recovery.move_type,
            recovery.reason_code,
            state.topic_catalog.index(recovery.topic),
            state.objective_index,
            recovery,
        )
    if requested_clarification or answer_shape in ("silence", "short", "repeated"):
        return (
            "clarify",
            "resolve_ambiguity",
            state.topic_index,
            state.objective_index,
            None,
        )
    if state.clock.band == "warning":
        topic_index, objective_index = _next_topic_and_objective(state)
        return "transition", "advance_round", topic_index, objective_index, None

    delivered = _delivered_for_current_topic(state)
    delivered_types = {move.move_type for move in delivered}
    if "probe" not in delivered_types:
        return "probe", "deepen_reasoning", state.topic_index, state.objective_index, None
    if answer_shape == "long" and "challenge" not in delivered_types:
        return "challenge", "test_tradeoff", state.topic_index, state.objective_index, None
    topic_index, objective_index = _next_topic_and_objective(state)
    return "transition", "advance_round", topic_index, objective_index, None


def _advance_move_stage(state: ControllerState, event: MoveStageAdvanced) -> ControllerState:
    if event.stage not in ("generated", "scheduled", "spoken"):
        raise ControllerError("invalid_event")
    projected = _advance_clock(state, event.monotonic_ms, increment_revision=False)
    move = _find_move(projected, event.move_id)
    if move.stage == "canonically_delivered":
        raise ControllerError("move_already_delivered")
    expected = {
        "generated": "admitted",
        "scheduled": "generated",
        "spoken": "scheduled",
    }[event.stage]
    if move.stage != expected:
        raise ControllerError("illegal_transition")
    updated = replace(move, stage=event.stage, updated_at=projected.clock.observed_at)
    result = _revised(projected, move_ledger=_replace_move(projected.move_ledger, updated))
    _validate_state(result)
    result.to_runtime_state()
    return result


def _interrupt_move(state: ControllerState, event: SpeechInterrupted) -> ControllerState:
    move = _find_move(state, event.move_id)
    if move.stage == "canonically_delivered":
        return state
    if move.stage == "aborted" and event.persisted_marker is not None:
        projected = _advance_clock(state, event.monotonic_ms, increment_revision=False)
        move = _find_move(projected, event.move_id)
        _validate_interruption_evidence(projected, event.persisted_marker)
        updated = replace(
            move,
            stage="interrupted",
            updated_at=projected.clock.observed_at,
            delivery_evidence=event.persisted_marker,
        )
        result = _revised(
            projected,
            move_ledger=_replace_move(projected.move_ledger, updated),
        )
        result = replace(result, allowed_moves=derive_allowed_moves(result))
        _validate_state(result)
        result.to_runtime_state()
        return result
    if move.stage not in ("admitted", "generated", "scheduled", "spoken"):
        raise ControllerError("illegal_transition")
    projected = _advance_clock(state, event.monotonic_ms, increment_revision=False)
    move = _find_move(projected, event.move_id)
    evidence = event.persisted_marker
    if evidence is not None:
        _validate_interruption_evidence(projected, evidence)
    stage: MoveStage = "interrupted" if evidence is not None else "aborted"
    updated = replace(
        move,
        stage=stage,
        updated_at=projected.clock.observed_at,
        delivery_evidence=evidence,
    )
    close_state: CloseState = "requested" if move.move_type == "close" else projected.close_state
    warning_state = (
        "pending" if move.includes_warning else projected.warning_state
    )
    result = _revised(
        projected,
        move_ledger=_replace_move(projected.move_ledger, updated),
        pending_move_id=None,
        interruption_state="recovery_pending",
        close_state=close_state,
        warning_state=warning_state,
    )
    result = replace(result, allowed_moves=derive_allowed_moves(result))
    _validate_state(result)
    result.to_runtime_state()
    return result


def _commit_delivery(
    state: ControllerState, event: PersistedTranscriptEvidence
) -> ControllerState:
    evidence = event.evidence
    _validate_transcript_evidence(state, evidence)
    move = _find_move(state, event.move_id)
    if move.stage == "canonically_delivered":
        if move.delivery_evidence == evidence:
            return state
        raise ControllerError("evidence_conflict")
    projected = _advance_clock(state, event.monotonic_ms, increment_revision=False)
    move = _find_move(projected, event.move_id)
    for ledger_move in projected.move_ledger:
        if (
            ledger_move.move_id != move.move_id
            and ledger_move.delivery_evidence is not None
            and ledger_move.delivery_evidence.event_id == evidence.event_id
        ):
            raise ControllerError("evidence_conflict")
    updated = replace(
        move,
        stage="canonically_delivered",
        updated_at=projected.clock.observed_at,
        delivery_evidence=evidence,
    )
    phase: Phase = projected.phase
    close_state = projected.close_state
    speech_fenced = projected.speech_fenced
    terminal = projected.terminal
    if move.move_type == "close":
        phase = "closed"
        close_state = "speech_fenced"
        speech_fenced = True
        terminal = True
    elif move.move_type == "transition":
        phase = "follow_up"
    elif phase == "primary_question":
        phase = "follow_up"
    warning_state = "delivered" if move.includes_warning else projected.warning_state
    result = _revised(
        projected,
        phase=phase,
        move_ledger=_replace_move(projected.move_ledger, updated),
        pending_move_id=None,
        interruption_state="clear",
        close_state=close_state,
        warning_state=warning_state,
        speech_fenced=speech_fenced,
        terminal=terminal,
    )
    result = replace(result, allowed_moves=derive_allowed_moves(result))
    _validate_state(result)
    result.to_runtime_state()
    return result


def _reconnect_writer(state: ControllerState, event: WriterReconnected) -> ControllerState:
    if type(event.writer_generation) is not int or event.writer_generation <= 0:
        raise ControllerError("invalid_writer")
    if event.writer_generation <= state.writer_generation:
        raise ControllerError("stale_writer")
    if type(event.lifecycle_version) is not int or event.lifecycle_version <= 0:
        raise ControllerError("invalid_lifecycle")
    if event.lifecycle_version <= state.lifecycle_version:
        raise ControllerError("stale_lifecycle")
    _require_identifier(event.writer_id, "invalid_writer")
    projected = _advance_clock(state, event.monotonic_ms, increment_revision=False)
    ledger = projected.move_ledger
    interruption_state: InterruptionState = projected.interruption_state
    pending = projected.pending_move_id
    close_state = projected.close_state
    if pending is not None:
        move = _find_move(projected, pending)
        aborted = replace(
            move,
            stage="aborted",
            updated_at=projected.clock.observed_at,
            delivery_evidence=None,
        )
        ledger = _replace_move(ledger, aborted)
        pending = None
        interruption_state = "recovery_pending"
        if move.move_type == "close":
            close_state = "requested"
    result = _revised(
        projected,
        lifecycle_state="active",
        lifecycle_version=event.lifecycle_version,
        writer_id=event.writer_id,
        writer_generation=event.writer_generation,
        move_ledger=ledger,
        pending_move_id=pending,
        interruption_state=interruption_state,
        close_state=close_state,
    )
    result = replace(result, allowed_moves=derive_allowed_moves(result))
    _validate_state(result)
    result.to_runtime_state()
    return result


def _settle_terminal(state: ControllerState, monotonic_ms: int) -> ControllerState:
    projected = _advance_clock(state, monotonic_ms, increment_revision=False)
    ledger = _abort_pending_for_fence(projected)
    result = _revised(
        projected,
        phase="closed",
        close_state="speech_fenced",
        speech_fenced=True,
        terminal=True,
        move_ledger=ledger,
        pending_move_id=None,
        allowed_moves=(),
    )
    _validate_state(result)
    result.to_runtime_state()
    return result


def _advance_clock(
    state: ControllerState, monotonic_ms: int, *, increment_revision: bool = True
) -> ControllerState:
    if type(monotonic_ms) is not int:
        raise ControllerError("invalid_event")
    if monotonic_ms < state.clock.monotonic_anchor_ms:
        raise ControllerError("monotonic_regression")
    elapsed_ms = monotonic_ms - state.clock.monotonic_anchor_ms
    observed = _parse_timestamp(state.clock.observed_at) + timedelta(milliseconds=elapsed_ms)
    deadline = _parse_timestamp(state.clock.deadline_at)
    remaining_ms = max(0, _timedelta_milliseconds(deadline - observed))
    band = _clock_band(remaining_ms)
    clock = replace(
        state.clock,
        observed_at=serialize_deadline_at(observed),
        monotonic_anchor_ms=monotonic_ms,
        remaining_ms=remaining_ms,
        band=band,
    )
    changes: dict[str, Any] = {"clock": clock}
    if band == "closing" and not state.terminal:
        pending = state.pending_move_id
        ledger = state.move_ledger
        interruption_state = state.interruption_state
        if pending is not None and _find_move(state, pending).move_type != "close":
            ledger = _abort_pending_for_fence(replace(state, clock=clock))
            pending = None
            interruption_state = "clear"
        changes.update(
            phase="closing",
            close_state="requested" if state.close_state == "open" else state.close_state,
            move_ledger=ledger,
            pending_move_id=pending,
            interruption_state=interruption_state,
            warning_state=(
                "skipped"
                if state.warning_state in ("pending", "admitted")
                else state.warning_state
            ),
        )
    elif band == "elapsed":
        ledger = _abort_pending_for_fence(replace(state, clock=clock))
        changes.update(
            phase="closed",
            close_state="speech_fenced",
            speech_fenced=True,
            terminal=True,
            move_ledger=ledger,
            pending_move_id=None,
            warning_state=(
                "skipped"
                if state.warning_state in ("pending", "admitted")
                else state.warning_state
            ),
        )
    projected = replace(state, **changes)
    projected = replace(projected, allowed_moves=derive_allowed_moves(projected))
    if increment_revision:
        projected = replace(projected, state_revision=state.state_revision + 1)
    _validate_state(projected)
    projected.to_runtime_state()
    return projected


def _build_snapshot(
    state: ControllerState,
    move: ControllerMove,
    *,
    answer_shape: AnswerShape,
) -> ControllerSnapshot:
    recent = [
        {
            "move_id": item.move_id,
            "move_type": item.move_type,
            "topic": item.topic,
        }
        for item in state.move_ledger
        if item.stage == "canonically_delivered"
    ][-MAX_RECENT_DELIVERED_MOVES:]
    return ControllerSnapshot(
        {
            "contract_version": CONTROLLER_SNAPSHOT_CONTRACT_VERSION,
            "policy_version": state.policy_version,
            "state_revision": state.state_revision,
            "phase": state.phase,
            "round_objective_id": state.round_objective_id,
            "current_topic": state.current_topic,
            "clock": {
                "remaining_ms": state.clock.remaining_ms,
                "band": state.clock.band,
            },
            "candidate_turn": {
                "turn_id": move.source_turn_id,
                "answer_shape": answer_shape,
            },
            "move": {
                "move_id": move.move_id,
                "move_type": move.move_type,
                "reason_code": move.reason_code,
                "topic": move.topic,
                "recovery_of_move_id": move.recovery_of_move_id,
                "clarifies_move_id": move.clarifies_move_id,
            },
            "constraints": {
                "substantive_question_budget": 0 if move.move_type == "close" else 1,
                "intentional_clarification": move.intentional_clarification,
                "include_time_warning": move.includes_warning,
                "no_coaching": True,
                "no_hints": True,
                "no_mid_session_evaluation": True,
            },
            "recent_canonically_delivered_moves": recent,
        }
    )


def _initial_clock(
    *,
    started_at: str,
    deadline_at: str,
    observed_at: str,
    monotonic_anchor_ms: int,
) -> ControllerClock:
    started = _parse_timestamp(started_at)
    deadline = _parse_timestamp(deadline_at)
    observed = _parse_timestamp(observed_at)
    if deadline <= started or observed < started:
        raise ControllerError("invalid_clock")
    if type(monotonic_anchor_ms) is not int or monotonic_anchor_ms < 0:
        raise ControllerError("invalid_clock")
    remaining_ms = max(0, _timedelta_milliseconds(deadline - observed))
    return ControllerClock(
        started_at=started_at,
        deadline_at=deadline_at,
        observed_at=observed_at,
        monotonic_anchor_ms=monotonic_anchor_ms,
        remaining_ms=remaining_ms,
        band=_clock_band(remaining_ms),
    )


def _clock_band(remaining_ms: int) -> ClockBand:
    if remaining_ms == 0:
        return "elapsed"
    if remaining_ms <= CLOSING_REMAINING_MS:
        return "closing"
    if remaining_ms <= WARNING_REMAINING_MS:
        return "warning"
    return "normal"


def _next_topic_and_objective(state: ControllerState) -> tuple[int, int]:
    topic_index = min(state.topic_index + 1, len(state.topic_catalog) - 1)
    objective_index = min(state.objective_index + 1, len(state.round_objectives) - 1)
    return topic_index, objective_index


def _catalog_exhausted(state: ControllerState) -> bool:
    if (
        state.topic_index != len(state.topic_catalog) - 1
        or state.objective_index != len(state.round_objectives) - 1
    ):
        return False
    return any(
        move.stage == "canonically_delivered"
        and move.move_type == "transition"
        and move.topic == state.current_topic
        for move in state.move_ledger
    )


def _last_recoverable_move(state: ControllerState) -> ControllerMove | None:
    if state.interruption_state != "recovery_pending":
        return None
    for move in reversed(state.move_ledger):
        if move.stage in ("aborted", "interrupted") and move.move_type != "close":
            return move
    return None


def _last_delivered_move(state: ControllerState) -> ControllerMove | None:
    for move in reversed(state.move_ledger):
        if move.stage == "canonically_delivered":
            return move
    return None


def _delivered_for_current_topic(state: ControllerState) -> tuple[ControllerMove, ...]:
    return tuple(
        move
        for move in state.move_ledger
        if move.stage == "canonically_delivered" and move.topic == state.current_topic
    )


def _append_bounded_move(
    ledger: tuple[ControllerMove, ...], move: ControllerMove
) -> tuple[ControllerMove, ...]:
    return (*ledger, move)[-MAX_MOVE_LEDGER_ENTRIES:]


def _abort_pending_for_fence(state: ControllerState) -> tuple[ControllerMove, ...]:
    if state.pending_move_id is None:
        return state.move_ledger
    move = _find_move(state, state.pending_move_id)
    if move.stage not in ("admitted", "generated", "scheduled", "spoken"):
        raise ControllerError("invalid_state")
    aborted = replace(
        move,
        stage="aborted",
        updated_at=state.clock.observed_at,
        delivery_evidence=None,
    )
    return _replace_move(state.move_ledger, aborted)


def _replace_move(
    ledger: tuple[ControllerMove, ...], updated: ControllerMove
) -> tuple[ControllerMove, ...]:
    return tuple(updated if move.move_id == updated.move_id else move for move in ledger)


def _find_move(state: ControllerState, move_id: str) -> ControllerMove:
    for move in state.move_ledger:
        if move.move_id == move_id:
            return move
    raise ControllerError("unknown_move")


def _revised(state: ControllerState, **changes: Any) -> ControllerState:
    return replace(state, state_revision=state.state_revision + 1, **changes)


def _require_revision(state: ControllerState, expected: int) -> None:
    if type(expected) is not int or expected != state.state_revision:
        raise ControllerError("stale_state")


def _validate_event_shape(event: ControllerEvent) -> None:
    if isinstance(event, CandidateTurnCompleted):
        _require_identifier(event.turn_id, "invalid_turn")
        _require_identifier(event.transcript_revision, "invalid_turn")
        if not isinstance(event.text, str) or len(event.text) > 12_000:
            raise ControllerError("invalid_turn")
        if type(event.duration_ms) is not int or event.duration_ms < 0:
            raise ControllerError("invalid_turn")
        if (
            type(event.requested_clarification) is not bool
            or type(event.requested_exit) is not bool
        ):
            raise ControllerError("invalid_turn")
    elif isinstance(event, (ClockObserved, TerminalSettled)):
        pass
    elif isinstance(event, MoveStageAdvanced):
        _require_identifier(event.move_id, "invalid_event")
        if event.stage not in ("generated", "scheduled", "spoken"):
            raise ControllerError("invalid_event")
    elif isinstance(event, SpeechInterrupted):
        _require_identifier(event.move_id, "invalid_event")
        if event.persisted_marker is not None:
            if not isinstance(event.persisted_marker, DeliveryEvidence):
                raise ControllerError("invalid_event")
            _validate_evidence_shape(event.persisted_marker, code="invalid_event")
            if event.persisted_marker.evidence_type != "interruption_marker":
                raise ControllerError("invalid_event")
    elif isinstance(event, PersistedTranscriptEvidence):
        _require_identifier(event.move_id, "invalid_event")
        if not isinstance(event.evidence, DeliveryEvidence):
            raise ControllerError("invalid_event")
        _validate_evidence_shape(event.evidence, code="invalid_event")
        if event.evidence.evidence_type != "transcript_event":
            raise ControllerError("invalid_event")
    elif isinstance(event, WriterReconnected):
        _require_identifier(event.writer_id, "invalid_writer")
        if type(event.writer_generation) is not int or event.writer_generation <= 0:
            raise ControllerError("invalid_writer")
        if type(event.lifecycle_version) is not int or event.lifecycle_version <= 0:
            raise ControllerError("invalid_lifecycle")
    else:
        raise ControllerError("unknown_event")
    if type(event.monotonic_ms) is not int or event.monotonic_ms < 0:
        raise ControllerError("invalid_event")


def _candidate_digest(normalized: str) -> str:
    return f"sha256:{hashlib.sha256(normalized.encode('utf-8')).hexdigest()}"


def _parse_timestamp(value: str) -> datetime:
    try:
        parsed = parse_deadline_at(value)
    except ValueError as error:
        raise ControllerError("invalid_clock") from error
    if parsed is None:
        raise ControllerError("invalid_clock")
    return parsed.astimezone(timezone.utc)


def _evidence_wire(evidence: DeliveryEvidence | None) -> dict[str, Any] | None:
    if evidence is None:
        return None
    common = {
        "evidence_type": evidence.evidence_type,
        "event_id": evidence.event_id,
        "writer_id": evidence.writer_id,
        "writer_generation": evidence.writer_generation,
        "sequence": evidence.sequence,
    }
    if evidence.evidence_type == "transcript_event":
        return {**common, "delivery_state": evidence.delivery_state}
    return {**common, "reason": evidence.reason}


def _validate_transcript_evidence(
    state: ControllerState, evidence: DeliveryEvidence
) -> None:
    if evidence.evidence_type != "transcript_event":
        raise ControllerError("invalid_delivery_evidence")
    if evidence.delivery_state not in ("delivered", "partially_delivered"):
        raise ControllerError("invalid_delivery_evidence")
    if evidence.reason is not None:
        raise ControllerError("invalid_delivery_evidence")
    _validate_evidence_authority(state, evidence)


def _validate_interruption_evidence(
    state: ControllerState, evidence: DeliveryEvidence
) -> None:
    if (
        evidence.evidence_type != "interruption_marker"
        or evidence.reason != "no_provider_confirmed_prefix"
        or evidence.delivery_state is not None
    ):
        raise ControllerError("invalid_interruption_evidence")
    _validate_evidence_authority(state, evidence)


def _validate_evidence_authority(
    state: ControllerState, evidence: DeliveryEvidence
) -> None:
    _require_identifier(evidence.event_id, "invalid_delivery_evidence")
    if (
        evidence.writer_id != state.writer_id
        or evidence.writer_generation != state.writer_generation
        or type(evidence.writer_generation) is not int
        or type(evidence.sequence) is not int
        or evidence.sequence <= 0
    ):
        raise ControllerError("stale_writer")


def _validate_state(state: ControllerState) -> None:
    if state.contract_version != CONTROLLER_STATE_CONTRACT_VERSION:
        raise ControllerError("unsupported_contract")
    if state.policy_version != CONTROLLER_POLICY_VERSION:
        raise ControllerError("unsupported_policy")
    for value in (
        state.session_id,
        state.brief_id,
        state.writer_id,
        state.active_question_id,
    ):
        _require_identifier(value, "invalid_state")
    if (
        type(state.state_revision) is not int
        or state.state_revision < 0
        or type(state.writer_generation) is not int
        or state.writer_generation <= 0
        or type(state.lifecycle_version) is not int
        or state.lifecycle_version <= 0
        or state.lifecycle_state
        not in (
            "created",
            "connecting",
            "active",
            "reconnecting",
            "ending",
            "completed",
            "abandoned",
            "failed",
        )
    ):
        raise ControllerError("invalid_state")
    if state.phase not in (
        "opening",
        "primary_question",
        "follow_up",
        "transition",
        "closing",
        "closed",
    ):
        raise ControllerError("invalid_state")
    if state.warning_state not in ("pending", "admitted", "delivered", "skipped"):
        raise ControllerError("invalid_state")
    if state.interruption_state not in (
        "clear",
        "candidate_speaking",
        "interviewer_interrupted",
        "recovery_pending",
    ):
        raise ControllerError("invalid_state")
    if state.close_state not in ("open", "requested", "admitted", "speech_fenced"):
        raise ControllerError("invalid_state")
    if type(state.speech_fenced) is not bool or type(state.terminal) is not bool:
        raise ControllerError("invalid_state")
    if type(state.move_ordinal) is not int or state.move_ordinal < 0:
        raise ControllerError("invalid_state")
    if not (1 <= len(state.round_objectives) <= 8) or not (
        1 <= len(state.topic_catalog) <= 12
    ):
        raise ControllerError("invalid_state")
    if not (0 <= state.objective_index < len(state.round_objectives)) or not (
        0 <= state.topic_index < len(state.topic_catalog)
    ):
        raise ControllerError("invalid_state")
    for token in (*state.round_objectives, *state.topic_catalog):
        if not isinstance(token, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", token):
            raise ControllerError("invalid_state")
    if len(state.move_ledger) > MAX_MOVE_LEDGER_ENTRIES or len(
        state.candidate_fingerprints
    ) > MAX_CANDIDATE_FINGERPRINTS:
        raise ControllerError("invalid_state")
    if len({move.move_id for move in state.move_ledger}) != len(state.move_ledger):
        raise ControllerError("invalid_state")
    _validate_move_ledger(state)
    if len({item.turn_id for item in state.candidate_fingerprints}) != len(
        state.candidate_fingerprints
    ):
        raise ControllerError("invalid_state")
    for item in state.candidate_fingerprints:
        _require_identifier(item.turn_id, "invalid_state")
        if not isinstance(item.digest, str) or not _SHA256.fullmatch(item.digest):
            raise ControllerError("invalid_state")
    if state.pending_move_id is not None:
        pending = _find_move(state, state.pending_move_id)
        if pending.stage not in ("admitted", "generated", "scheduled", "spoken"):
            raise ControllerError("invalid_state")
    active_moves = tuple(
        move
        for move in state.move_ledger
        if move.stage in ("admitted", "generated", "scheduled", "spoken")
    )
    if state.pending_move_id is None:
        if active_moves:
            raise ControllerError("invalid_state")
    elif len(active_moves) != 1 or active_moves[0].move_id != state.pending_move_id:
        raise ControllerError("invalid_state")
    if state.terminal != state.speech_fenced:
        raise ControllerError("invalid_state")
    if state.speech_fenced and (
        state.phase != "closed" or state.close_state != "speech_fenced"
    ):
        raise ControllerError("invalid_state")
    if state.phase == "closing" and state.close_state not in ("requested", "admitted"):
        raise ControllerError("invalid_state")
    if state.close_state == "admitted" and state.phase != "closing":
        raise ControllerError("invalid_state")
    if tuple(state.allowed_moves) != derive_allowed_moves(state):
        raise ControllerError("invalid_state")
    _validate_clock(state.clock)


def _validate_clock(clock: ControllerClock) -> None:
    started = _parse_timestamp(clock.started_at)
    deadline = _parse_timestamp(clock.deadline_at)
    observed = _parse_timestamp(clock.observed_at)
    remaining = max(0, _timedelta_milliseconds(deadline - observed))
    if (
        deadline <= started
        or observed < started
        or type(clock.monotonic_anchor_ms) is not int
        or clock.monotonic_anchor_ms < 0
        or clock.remaining_ms != remaining
        or clock.band != _clock_band(remaining)
    ):
        raise ControllerError("invalid_clock")


def _require_identifier(value: Any, code: str) -> None:
    if not isinstance(value, str) or len(value) > 240 or not _IDENTIFIER.fullmatch(value):
        raise ControllerError(code)


def _validate_move_ledger(state: ControllerState) -> None:
    reason_codes = {
        "probe": ("deepen_reasoning", "controller_fallback"),
        "clarify": ("resolve_ambiguity", "controller_fallback"),
        "challenge": ("test_tradeoff", "controller_fallback"),
        "transition": ("advance_round", "controller_fallback"),
        "close": (
            "deadline_close",
            "candidate_requested_close",
            "catalog_exhausted",
            "controller_fallback",
        ),
    }
    for move in state.move_ledger:
        _require_identifier(move.move_id, "invalid_state")
        _require_identifier(move.question_id, "invalid_state")
        _require_identifier(move.source_turn_id, "invalid_state")
        if move.move_type not in reason_codes or move.reason_code not in reason_codes[
            move.move_type
        ]:
            raise ControllerError("invalid_state")
        if move.stage not in (
            "admitted",
            "generated",
            "scheduled",
            "spoken",
            "interrupted",
            "canonically_delivered",
            "aborted",
        ):
            raise ControllerError("invalid_state")
        if move.topic not in state.topic_catalog:
            raise ControllerError("invalid_state")
        if not (1 <= len(move.target_turn_ids) <= 8):
            raise ControllerError("invalid_state")
        for turn_id in move.target_turn_ids:
            _require_identifier(turn_id, "invalid_state")
        _parse_timestamp(move.updated_at)
        if type(move.intentional_clarification) is not bool or type(
            move.includes_warning
        ) is not bool:
            raise ControllerError("invalid_state")
        if move.intentional_clarification != (move.move_type == "clarify"):
            raise ControllerError("invalid_state")
        for related_move_id in (move.recovery_of_move_id, move.clarifies_move_id):
            if related_move_id is not None:
                _require_identifier(related_move_id, "invalid_state")
        evidence = move.delivery_evidence
        if move.stage == "canonically_delivered":
            if evidence is None or evidence.evidence_type != "transcript_event":
                raise ControllerError("invalid_state")
        elif move.stage == "interrupted":
            if evidence is None or evidence.evidence_type != "interruption_marker":
                raise ControllerError("invalid_state")
        elif evidence is not None:
            raise ControllerError("invalid_state")
        if evidence is not None:
            _validate_evidence_shape(evidence)


def _validate_evidence_shape(
    evidence: DeliveryEvidence, *, code: str = "invalid_state"
) -> None:
    _require_identifier(evidence.event_id, code)
    _require_identifier(evidence.writer_id, code)
    if (
        type(evidence.writer_generation) is not int
        or evidence.writer_generation <= 0
        or type(evidence.sequence) is not int
        or evidence.sequence <= 0
    ):
        raise ControllerError(code)
    if evidence.evidence_type == "transcript_event":
        if evidence.delivery_state not in ("delivered", "partially_delivered"):
            raise ControllerError(code)
        if evidence.reason is not None:
            raise ControllerError(code)
    elif evidence.evidence_type == "interruption_marker":
        if (
            evidence.reason != "no_provider_confirmed_prefix"
            or evidence.delivery_state is not None
        ):
            raise ControllerError(code)
    else:
        raise ControllerError(code)


def _timedelta_milliseconds(value: timedelta) -> int:
    return (
        value.days * 86_400_000
        + value.seconds * 1_000
        + value.microseconds // 1_000
    )
