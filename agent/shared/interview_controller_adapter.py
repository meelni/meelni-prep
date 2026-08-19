"""Fail-safe runtime boundary for the deterministic interview controller."""

from __future__ import annotations

import json
import re
import secrets
import time
from collections.abc import Callable
from copy import copy
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, Mapping

from shared.interview_controller import (
    CandidateTurnPrepared,
    CandidateTurnCompleted,
    ClockObserved,
    ControllerError,
    ControllerState,
    DeliveryEvidence,
    InterviewerMoveAdmitted,
    LifecycleSnapshotRefreshed,
    MoveStageAdvanced,
    PersistedTranscriptEvidence,
    SpeechInterrupted,
    create_controller_state,
    list_probe_candidates,
    project_controller_state,
    reduce_controller,
)
from shared.session_deadline import parse_deadline_at, serialize_deadline_at


CONTROLLER_ADAPTER_CONTRACT_VERSION = "interview-controller-adapter.v1"
CONTROLLER_FEATURE_ENV = "MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED"
MAX_PENDING_CORRELATIONS = 8
MAX_GENERATION_CONTEXT_ITEMS = 16
MAX_EXIT_INTENT_WORDS = 12
MAX_RUNTIME_TRANSCRIPT_CORRELATIONS = 1_000
MAX_SESSION_SPEECH_IDENTITIES = 1_000
MAX_SESSION_GENERATION_CAPABILITIES = 1_000
MAX_TOOL_CALLS_PER_TURN = 3
MAX_SAME_HANDLE_CONTINUATIONS = 3

_GENERATION_CAPABILITY_SEPARATOR = ":capability:"
_GENERATION_CAPABILITY_PATTERN = re.compile(r"[A-Za-z0-9_-]{32,128}")

_EXIT_ACTION = r"(?:stop|end|finish)"
_EXIT_TARGET = r"(?:(?:the|this|our) )?(?:mock interview|interview|session)"
_EXIT_WHEN = r"(?:now|here|today|for now|for today|at this point)"
_EXIT_SCOPE = rf"(?: {_EXIT_TARGET}(?: {_EXIT_WHEN})?| {_EXIT_WHEN})"
_EXIT_REQUEST_PATTERNS = (
    re.compile(
        rf"^(?:please )?{_EXIT_ACTION}{_EXIT_SCOPE}(?: please)?$"
    ),
    re.compile(
        rf"^(?:i (?:want|need) to|i would like to|id like to) {_EXIT_ACTION}"
        rf"{_EXIT_SCOPE}(?: please)?$"
    ),
    re.compile(
        rf"^(?:can|could|would|will) (?:we|you) (?:please )?{_EXIT_ACTION}"
        rf"{_EXIT_SCOPE}(?: please)?$"
    ),
    re.compile(
        rf"^lets {_EXIT_ACTION}{_EXIT_SCOPE}(?: please)?$"
    ),
    re.compile(
        rf"^(?:i think )?(?:we can|we should) {_EXIT_ACTION}"
        rf"{_EXIT_SCOPE}(?: please)?$"
    ),
)
_CLARIFICATION_PATTERNS = (
    re.compile(r"\bcan you clarify\b"),
    re.compile(r"\bcould you clarify\b"),
    re.compile(r"\bplease clarify\b"),
    re.compile(r"\bwhat do you mean\b"),
    re.compile(r"\bcould you repeat\b"),
    re.compile(r"\bcan you repeat\b"),
)


@dataclass(frozen=True)
class TurnDirective:
    contract_version: str
    instruction: str | None
    suppress_reply: bool
    move_id: str | None
    generation_context_id: str | None
    tool_mode: bool = False


@dataclass(frozen=True)
class GenerationCapabilityRecord:
    finalized_turn_id: str
    move_id: str
    generation_epoch: int
    handle_id: str | None


@dataclass(frozen=True, eq=False, repr=False)
class SpeechCompletionAcceptance:
    """Opaque identity authorizing one accepted speech instance to complete."""


@dataclass(frozen=True)
class CreatedSpeechHandleRecord:
    generation_epoch: int
    completion_acceptance: SpeechCompletionAcceptance


@dataclass(frozen=True)
class AuthorizedSpeechHandleRecord:
    finalized_turn_id: str
    move_id: str | None
    tool_mode: bool
    generation_started: bool
    continuation_steps: int
    fallback_generation_granted: bool
    completion_acceptance: SpeechCompletionAcceptance


@dataclass(frozen=True)
class ControllerAdapterStatus:
    contract_version: str
    enabled: bool
    failure_reason: str | None


class ReplySuppressionGate:
    """Turn-local gate consumed at the public LiveKit LLM boundary."""

    def __init__(self) -> None:
        self._message_ids: dict[str, None] = {}

    def arm(self, message_id: str) -> None:
        if not isinstance(message_id, str) or not message_id:
            raise ControllerError("invalid_adapter_input")
        put_bounded_correlation(
            self._message_ids,
            message_id,
            None,
            limit=MAX_PENDING_CORRELATIONS,
        )

    def consume_for_items(self, items: object) -> bool:
        message_id, _, _ = _generation_context_identity(items)
        return self.consume(message_id)

    def consume(self, message_id: str | None) -> bool:
        if message_id is None or message_id not in self._message_ids:
            return False
        self._message_ids.pop(message_id, None)
        return True


def allow_controller_generation(
    adapter: "InterviewControllerAdapter",
    suppression_gate: ReplySuppressionGate,
    chat_items: object,
    *,
    monotonic_ms: int | None = None,
) -> bool:
    """Resolve the provider-free decision used by the public LiveKit LLM node."""
    finalized_turn_id, move_id, generation_capability = (
        _generation_context_identity(chat_items)
    )
    if suppression_gate.consume(finalized_turn_id):
        return False
    allowed = adapter.authorize_generation(
        finalized_turn_id=finalized_turn_id,
        move_id=move_id,
        generation_capability=generation_capability,
        monotonic_ms=monotonic_ms,
    )
    if allowed:
        _redact_generation_capability(chat_items)
    return allowed


class InterviewControllerAdapter:
    """Mutable boundary owner around an immutable pure controller state."""

    def __init__(
        self,
        *,
        state: ControllerState | None,
        failure_reason: str | None = None,
        generation_token_factory: Callable[[], str] | None = None,
    ) -> None:
        self._state = state
        self._failure_reason = failure_reason
        self._generation_token_factory = (
            generation_token_factory or _new_generation_capability
        )
        self._current_generation_handle: ContextVar[str | None] = ContextVar(
            f"interview_controller_generation_handle_{id(self)}",
            default=None,
        )
        self._generation_epoch = 0
        self._seen_speech_handles: dict[str, None] = {}
        self._generation_capabilities: dict[
            str, GenerationCapabilityRecord
        ] = {}
        self._seen_generation_capabilities: dict[str, None] = {}
        self._created_speech_handles: dict[
            str, CreatedSpeechHandleRecord
        ] = {}
        self._authorized_speech_handles: dict[
            str, AuthorizedSpeechHandleRecord
        ] = {}
        self._retired_speech_handles: dict[str, None] = {}
        self._transcript_move_ids: dict[str, str] = {}
        self._interruption_move_ids: dict[str, str] = {}
        self._persisted_interviewer_events: dict[str, Mapping[str, object]] = {}
        self._admitted_candidate_revisions: dict[str, str] = {}
        self._active_tool_handles: set[str] = set()
        self._tool_calls_by_handle: dict[str, int] = {}
        self._tool_names_by_handle: dict[str, set[str]] = {}
        self._tool_budget_exhausted_handles: set[str] = set()
        self._tool_fallback_pending_handles: set[str] = set()

    @property
    def enabled(self) -> bool:
        return self._state is not None and self._failure_reason is None

    @property
    def state(self) -> ControllerState | None:
        return self._state

    @property
    def status(self) -> ControllerAdapterStatus:
        return ControllerAdapterStatus(
            contract_version=CONTROLLER_ADAPTER_CONTRACT_VERSION,
            enabled=self.enabled,
            failure_reason=self._failure_reason,
        )

    def complete_user_turn(
        self,
        *,
        message_id: str,
        transcript_revision: str,
        text: str,
        duration_ms: int,
        monotonic_ms: int | None = None,
    ) -> TurnDirective | None:
        state = self._state
        if not self.enabled or state is None:
            return None
        try:
            expected_revision = f"{state.writer_id}:{message_id}"
            if transcript_revision != expected_revision:
                raise ControllerError("candidate_revision_mismatch")
            transition = reduce_controller(
                state,
                CandidateTurnCompleted(
                    expected_state_revision=state.state_revision,
                    turn_id=message_id,
                    transcript_revision=transcript_revision,
                    text=text,
                    duration_ms=duration_ms,
                    monotonic_ms=_monotonic_ms(monotonic_ms),
                    requested_clarification=_requests_clarification(text),
                    requested_exit=_requests_exit(text),
                ),
            )
            self._state = transition.state
            self._bounded_put(
                self._admitted_candidate_revisions,
                message_id,
                transcript_revision,
            )
            if transition.snapshot is None:
                return TurnDirective(
                    contract_version=CONTROLLER_ADAPTER_CONTRACT_VERSION,
                    instruction=None,
                    suppress_reply=transition.state.terminal,
                    move_id=None,
                    generation_context_id=None,
                )
            move_id = transition.state.pending_move_id
            if move_id is None:
                raise ControllerError("invalid_state")
            generation_context_id = self._mint_generation_context_id(
                finalized_turn_id=message_id,
                move_id=move_id,
            )
            return TurnDirective(
                contract_version=CONTROLLER_ADAPTER_CONTRACT_VERSION,
                instruction=transition.snapshot.to_prompt_instruction(),
                suppress_reply=False,
                move_id=move_id,
                generation_context_id=generation_context_id,
            )
        except Exception as error:
            self._disable(error)
            return None

    def prepare_user_turn_for_tools(
        self,
        *,
        message_id: str,
        transcript_revision: str,
        text: str,
        duration_ms: int,
        monotonic_ms: int | None = None,
    ) -> TurnDirective | None:
        """Finalize one turn while leaving intent admission to bounded tools."""
        state = self._state
        if not self.enabled or state is None:
            return None
        current_ms = _monotonic_ms(monotonic_ms)
        try:
            projected = project_controller_state(state, monotonic_ms=current_ms)
            if _requests_exit(text) or projected.clock.band in ("closing", "elapsed"):
                return self.complete_user_turn(
                    message_id=message_id,
                    transcript_revision=transcript_revision,
                    text=text,
                    duration_ms=duration_ms,
                    monotonic_ms=current_ms,
                )
            expected_revision = f"{state.writer_id}:{message_id}"
            if transcript_revision != expected_revision:
                raise ControllerError("candidate_revision_mismatch")
            transition = reduce_controller(
                state,
                CandidateTurnPrepared(
                    expected_state_revision=state.state_revision,
                    turn_id=message_id,
                    transcript_revision=transcript_revision,
                    text=text,
                    duration_ms=duration_ms,
                    monotonic_ms=current_ms,
                ),
            )
            self._state = transition.state
            self._bounded_put(
                self._admitted_candidate_revisions,
                message_id,
                transcript_revision,
            )
            if transition.state.terminal:
                return TurnDirective(
                    contract_version=CONTROLLER_ADAPTER_CONTRACT_VERSION,
                    instruction=None,
                    suppress_reply=True,
                    move_id=None,
                    generation_context_id=None,
                    tool_mode=True,
                )
            authority_id = f"tool-turn:{message_id}"
            generation_context_id = self._mint_generation_context_id(
                finalized_turn_id=message_id,
                move_id=authority_id,
            )
            instruction = " ".join(
                (
                    "INTERVIEWER_TOOLS",
                    json.dumps(
                        {
                            "active_question_id": (
                                transition.state.active_question_id
                            ),
                            "contract_version": "interviewer-tools.v1",
                            "lifecycle_version": (
                                transition.state.lifecycle_version
                            ),
                            "state_revision": transition.state.state_revision,
                            "tool_call_budget": MAX_TOOL_CALLS_PER_TURN,
                        },
                        ensure_ascii=True,
                        separators=(",", ":"),
                        sort_keys=True,
                    ),
                    "Before a substantive interviewer reply, commit exactly one",
                    "legal move. Read state/clock or get probe candidates only",
                    "when needed. Never repeat a tool. After any tool failure,",
                    "make one natural prompt-led reply without another tool call.",
                    "Never reveal internal state or reasoning.",
                )
            )
            return TurnDirective(
                contract_version=CONTROLLER_ADAPTER_CONTRACT_VERSION,
                instruction=instruction,
                suppress_reply=False,
                move_id=None,
                generation_context_id=generation_context_id,
                tool_mode=True,
            )
        except Exception as error:
            self._disable(error)
            return None

    def speech_created(
        self,
        *,
        handle_id: str,
        source: Literal["say", "generate_reply"] = "generate_reply",
        monotonic_ms: int | None = None,
    ) -> SpeechCompletionAcceptance | None:
        if not self.enabled:
            return None
        try:
            _required_identifier(handle_id)
            if source not in ("say", "generate_reply"):
                raise ControllerError("invalid_adapter_input")
            if handle_id in self._seen_speech_handles:
                self._current_generation_handle.set(None)
                return None
            if len(self._seen_speech_handles) >= MAX_SESSION_SPEECH_IDENTITIES:
                self._current_generation_handle.set(None)
                raise ControllerError("speech_handle_identity_capacity_exceeded")
            self._seen_speech_handles[handle_id] = None
            if source != "generate_reply":
                self._current_generation_handle.set(None)
                return None
            completion_acceptance = SpeechCompletionAcceptance()
            evicted = put_bounded_correlation(
                self._created_speech_handles,
                handle_id,
                CreatedSpeechHandleRecord(
                    generation_epoch=self._generation_epoch,
                    completion_acceptance=completion_acceptance,
                ),
                limit=MAX_PENDING_CORRELATIONS,
            )
            for evicted_handle_id in evicted:
                self._retire_speech_handle(evicted_handle_id)
            for capability, record in reversed(
                tuple(self._generation_capabilities.items())
            ):
                if (
                    record.generation_epoch != self._generation_epoch
                    or record.handle_id is not None
                ):
                    continue
                self._generation_capabilities[capability] = (
                    GenerationCapabilityRecord(
                        finalized_turn_id=record.finalized_turn_id,
                        move_id=record.move_id,
                        generation_epoch=record.generation_epoch,
                        handle_id=handle_id,
                    )
                )
                break
            # LiveKit 1.6.5 emits this public event synchronously before it
            # creates the handle's pipeline task. The task therefore inherits
            # this exact handle identity through Python's public task context.
            self._current_generation_handle.set(handle_id)
            return completion_acceptance
        except Exception as error:
            self._disable(error)
            return None

    def authorize_generation(
        self,
        *,
        finalized_turn_id: str | None,
        move_id: str | None,
        generation_capability: str | None,
        monotonic_ms: int | None = None,
    ) -> bool:
        """Observe the canonical clock before allowing provider generation."""
        state = self._state
        if not self.enabled or state is None:
            return True
        handle_id = self._current_generation_handle.get()
        authorized_handle = self._authorized_speech_handles.get(handle_id)
        if isinstance(handle_id, str) and authorized_handle is not None:
            return self._authorize_same_handle_continuation(
                handle_id=handle_id,
                record=authorized_handle,
                monotonic_ms=monotonic_ms,
            )
        created_handle = self._created_speech_handles.get(handle_id)
        if (
            not isinstance(handle_id, str)
            or created_handle is None
        ):
            return False
        if (
            not isinstance(finalized_turn_id, str)
            or not finalized_turn_id
            or not isinstance(move_id, str)
            or not move_id
            or not isinstance(generation_capability, str)
            or not generation_capability
        ):
            return False
        capability_record = self._generation_capabilities.get(
            generation_capability
        )
        if capability_record != GenerationCapabilityRecord(
            finalized_turn_id=finalized_turn_id,
            move_id=move_id,
            generation_epoch=created_handle.generation_epoch,
            handle_id=handle_id,
        ):
            return False
        self._created_speech_handles.pop(handle_id, None)
        self._generation_capabilities.pop(generation_capability, None)
        try:
            if move_id.startswith("tool-turn:"):
                if (
                    state.terminal
                    or state.speech_fenced
                    or state.lifecycle_state != "active"
                    or state.pending_move_id is not None
                    or state.last_finalized_candidate_turn_id != finalized_turn_id
                    or move_id != f"tool-turn:{finalized_turn_id}"
                ):
                    self._retire_speech_handle(handle_id)
                    return False
                projected = project_controller_state(
                    state,
                    monotonic_ms=_monotonic_ms(monotonic_ms),
                )
                if projected.terminal or projected.speech_fenced:
                    self._retire_speech_handle(handle_id)
                    return False
                self._authorize_speech_handle(
                    handle_id=handle_id,
                    record=AuthorizedSpeechHandleRecord(
                        finalized_turn_id=finalized_turn_id,
                        move_id=None,
                        tool_mode=True,
                        generation_started=False,
                        continuation_steps=0,
                        fallback_generation_granted=False,
                        completion_acceptance=created_handle.completion_acceptance,
                    ),
                )
                return True
            if state.terminal or state.pending_move_id != move_id:
                self._retire_speech_handle(handle_id)
                return False
            pending_move = _find_move(state, move_id)
            if (
                pending_move.source_turn_id != finalized_turn_id
                or pending_move.stage != "admitted"
            ):
                self._retire_speech_handle(handle_id)
                return False
            current_ms = _monotonic_ms(monotonic_ms)
            state = reduce_controller(
                state,
                ClockObserved(
                    expected_state_revision=state.state_revision,
                    monotonic_ms=current_ms,
                ),
            ).state
            self._state = state
            if state.terminal or state.pending_move_id != move_id:
                self._retire_speech_handle(handle_id)
                return False
            self._state = reduce_controller(
                state,
                MoveStageAdvanced(
                    expected_state_revision=state.state_revision,
                    move_id=move_id,
                    stage="generated",
                    monotonic_ms=current_ms,
                ),
            ).state
            self._authorize_speech_handle(
                handle_id=handle_id,
                record=AuthorizedSpeechHandleRecord(
                    finalized_turn_id=finalized_turn_id,
                    move_id=move_id,
                    tool_mode=False,
                    generation_started=True,
                    continuation_steps=0,
                    fallback_generation_granted=False,
                    completion_acceptance=(
                        created_handle.completion_acceptance
                    ),
                ),
            )
            return True
        except Exception as error:
            self._retire_speech_handle(handle_id)
            self._disable(error)
            return True

    def speech_finished(
        self,
        *,
        handle_id: str,
        completion_acceptance: SpeechCompletionAcceptance | None = None,
        scheduled: bool,
        interrupted: bool,
        has_confirmed_prefix: bool,
        assistant_message_ids: tuple[str, ...] = (),
        monotonic_ms: int | None = None,
    ) -> None:
        state = self._state
        created_handle = self._created_speech_handles.get(handle_id)
        authorized_handle = self._authorized_speech_handles.get(handle_id)
        if completion_acceptance is None:
            return
        if created_handle is not None:
            if (
                authorized_handle is not None
                or created_handle.completion_acceptance
                is not completion_acceptance
            ):
                return
        elif (
            authorized_handle is None
            or authorized_handle.completion_acceptance
            is not completion_acceptance
        ):
            return
        self._created_speech_handles.pop(handle_id, None)
        authorized_handle = self._authorized_speech_handles.pop(
            handle_id,
            None,
        )
        self._retire_speech_handle(handle_id)
        if not self.enabled or state is None or authorized_handle is None:
            return
        move_id = authorized_handle.move_id
        if move_id is None:
            return
        try:
            move = _find_move(state, move_id)
            if move.stage in ("aborted", "interrupted", "canonically_delivered"):
                return
            current_ms = _monotonic_ms(monotonic_ms)
            for message_id in assistant_message_ids:
                event_id = f"{state.writer_id}:{message_id}"
                self._bounded_put(self._transcript_move_ids, event_id, move_id)
            marker_event_id = f"{state.writer_id}:{handle_id}:unavailable"
            if interrupted and not has_confirmed_prefix:
                self._bounded_put(
                    self._interruption_move_ids,
                    marker_event_id,
                    move_id,
                )
            if not scheduled:
                self._state = reduce_controller(
                    state,
                    SpeechInterrupted(
                        expected_state_revision=state.state_revision,
                        move_id=move_id,
                        monotonic_ms=current_ms,
                    ),
                ).state
                return
            if move.stage == "generated":
                state = reduce_controller(
                    state,
                    MoveStageAdvanced(
                        expected_state_revision=state.state_revision,
                        move_id=move_id,
                        stage="scheduled",
                        monotonic_ms=current_ms,
                    ),
                ).state
                move = _find_move(state, move_id)
            if move.stage == "scheduled" and (has_confirmed_prefix or not interrupted):
                state = reduce_controller(
                    state,
                    MoveStageAdvanced(
                        expected_state_revision=state.state_revision,
                        move_id=move_id,
                        stage="spoken",
                        monotonic_ms=current_ms,
                    ),
                ).state
            if interrupted and not has_confirmed_prefix:
                state = reduce_controller(
                    state,
                    SpeechInterrupted(
                        expected_state_revision=state.state_revision,
                        move_id=move_id,
                        monotonic_ms=current_ms,
                    ),
                ).state
            self._state = state
            self._commit_any_persisted_interviewer_event(move_id, current_ms)
        except Exception as error:
            self._disable(error)

    def persisted_transcript(
        self,
        transcript_event: Mapping[str, object],
        *,
        source_message_id: str | None = None,
        monotonic_ms: int | None = None,
    ) -> None:
        state = self._state
        if not self.enabled or state is None:
            return
        speaker = transcript_event.get("speaker")
        if speaker == "user":
            try:
                if source_message_id is None:
                    return
                event_id = _required_string(transcript_event, "event_id")
                if (
                    _required_string(transcript_event, "writer_id")
                    != state.writer_id
                    or _required_integer(transcript_event, "writer_generation")
                    != state.writer_generation
                ):
                    raise ControllerError("stale_writer")
                expected = self._admitted_candidate_revisions.get(source_message_id)
                if expected is None:
                    return
                if expected != event_id:
                    raise ControllerError("candidate_revision_mismatch")
                self._admitted_candidate_revisions.pop(source_message_id, None)
            except Exception as error:
                self._disable(error)
            return
        if speaker != "interviewer":
            return
        try:
            event_id = _required_string(transcript_event, "event_id")
            move_id = self._transcript_move_ids.get(event_id)
            if move_id is None:
                self._bounded_put(
                    self._persisted_interviewer_events,
                    event_id,
                    transcript_event,
                )
                return
            self._commit_correlated_transcript(
                move_id,
                transcript_event,
                _monotonic_ms(monotonic_ms),
            )
        except Exception as error:
            self._disable(error)

    def persisted_interruption_marker(
        self,
        marker: Mapping[str, object],
        *,
        monotonic_ms: int | None = None,
    ) -> None:
        state = self._state
        if not self.enabled or state is None:
            return
        try:
            event_id = _required_string(marker, "event_id")
            move_id = self._interruption_move_ids.get(event_id)
            if move_id is None:
                return
            if (
                marker.get("speaker") != "interviewer"
                or marker.get("reason") != "no_provider_confirmed_prefix"
            ):
                raise ControllerError("invalid_interruption_evidence")
            evidence = DeliveryEvidence(
                evidence_type="interruption_marker",
                event_id=event_id,
                writer_id=_required_string(marker, "writer_id"),
                writer_generation=_required_integer(marker, "writer_generation"),
                sequence=_required_integer(marker, "sequence"),
                reason="no_provider_confirmed_prefix",
            )
            self._state = reduce_controller(
                state,
                SpeechInterrupted(
                    expected_state_revision=state.state_revision,
                    move_id=move_id,
                    monotonic_ms=_monotonic_ms(monotonic_ms),
                    persisted_marker=evidence,
                ),
            ).state
            self._interruption_move_ids.pop(event_id, None)
        except Exception as error:
            self._disable(error)

    def _commit_correlated_transcript(
        self,
        move_id: str,
        transcript_event: Mapping[str, object],
        monotonic_ms: int,
    ) -> None:
        state = self._state
        if state is None:
            return
        event_id = _required_string(transcript_event, "event_id")
        if self._transcript_move_ids.get(event_id) != move_id:
            return
        evidence = DeliveryEvidence(
            evidence_type="transcript_event",
            event_id=event_id,
            writer_id=_required_string(transcript_event, "writer_id"),
            writer_generation=_required_integer(transcript_event, "writer_generation"),
            sequence=_required_integer(transcript_event, "sequence"),
            delivery_state=_delivery_state(transcript_event),
        )
        self._state = reduce_controller(
            state,
            PersistedTranscriptEvidence(
                expected_state_revision=state.state_revision,
                move_id=move_id,
                evidence=evidence,
                monotonic_ms=monotonic_ms,
            ),
        ).state
        correlated_event_ids = tuple(
            correlated_event_id
            for correlated_event_id, correlated_move_id in self._transcript_move_ids.items()
            if correlated_move_id == move_id
        )
        for correlated_event_id in correlated_event_ids:
            self._transcript_move_ids.pop(correlated_event_id, None)
            self._persisted_interviewer_events.pop(correlated_event_id, None)

    def _commit_any_persisted_interviewer_event(
        self, move_id: str, monotonic_ms: int
    ) -> None:
        for event_id, correlated_move_id in tuple(self._transcript_move_ids.items()):
            if correlated_move_id != move_id:
                continue
            persisted = self._persisted_interviewer_events.get(event_id)
            if persisted is not None:
                self._commit_correlated_transcript(
                    move_id,
                    persisted,
                    monotonic_ms,
                )
                return

    def apply_tool_move(
        self,
        *,
        move_id: str,
        move_type: str,
        reason_code: str,
        question_id: str,
        topic: str,
        source_turn_id: str,
        probe_candidate_id: str | None,
        expected_state_revision: int,
        monotonic_ms: int,
        handle_id: str | None = None,
    ) -> ControllerState:
        state = self._state
        if not self.enabled or state is None:
            raise ControllerError("adapter_unavailable")
        if handle_id is not None:
            record = self._authorized_speech_handles.get(handle_id)
            if (
                record is None
                or record.move_id is not None
                or self._current_generation_handle.get() != handle_id
            ):
                raise ControllerError("tool_handle_mismatch")
        transition = reduce_controller(
            state,
            InterviewerMoveAdmitted(
                expected_state_revision=expected_state_revision,
                move_id=move_id,
                move_type=move_type,
                reason_code=reason_code,
                question_id=question_id,
                topic=topic,
                source_turn_id=source_turn_id,
                probe_candidate_id=probe_candidate_id,
                monotonic_ms=monotonic_ms,
            ),
        )
        self._state = transition.state
        if handle_id is not None:
            self.bind_tool_move(handle_id=handle_id, move_id=move_id)
        return transition.state

    def refresh_lifecycle_snapshot(
        self,
        *,
        lifecycle_state: str,
        lifecycle_version: int,
        monotonic_ms: int,
    ) -> ControllerState:
        state = self._state
        if not self.enabled or state is None:
            raise ControllerError("adapter_unavailable")
        self._state = reduce_controller(
            state,
            LifecycleSnapshotRefreshed(
                expected_state_revision=state.state_revision,
                lifecycle_state=lifecycle_state,
                lifecycle_version=lifecycle_version,
                monotonic_ms=monotonic_ms,
            ),
        ).state
        return self._state

    def invalidate_lifecycle_authority(self) -> None:
        """Fail closed without affecting the existing speech fallback path."""
        if self.enabled:
            self._disable(ControllerError("lifecycle_refresh_unavailable"))

    def begin_tool_call(self, *, handle_id: str, tool_name: str) -> str:
        if tool_name not in (
            "read_interview_state",
            "read_interview_clock",
            "get_probe_candidates",
            "commit_interviewer_move",
            "request_graceful_close",
        ):
            return "invalid_request"
        record = self._authorized_speech_handles.get(handle_id)
        if (
            not self.enabled
            or record is None
            or self._current_generation_handle.get() != handle_id
        ):
            return "unavailable"
        if record.move_id is not None:
            return "unavailable"
        if handle_id in self._tool_fallback_pending_handles:
            return "unavailable"
        if handle_id in self._active_tool_handles:
            return "invalid_request"
        calls = self._tool_calls_by_handle.get(handle_id, 0)
        names = self._tool_names_by_handle.setdefault(handle_id, set())
        if calls >= MAX_TOOL_CALLS_PER_TURN or tool_name in names:
            self._tool_budget_exhausted_handles.add(handle_id)
            return "unavailable"
        self._active_tool_handles.add(handle_id)
        self._tool_calls_by_handle[handle_id] = calls + 1
        names.add(tool_name)
        return "eligible"

    def end_tool_call(self, *, handle_id: str) -> None:
        self._active_tool_handles.discard(handle_id)

    def bind_tool_move(self, *, handle_id: str, move_id: str) -> None:
        record = self._authorized_speech_handles.get(handle_id)
        state = self._state
        if (
            record is None
            or record.move_id is not None
            or state is None
            or state.pending_move_id != move_id
            or self._current_generation_handle.get() != handle_id
        ):
            raise ControllerError("tool_handle_mismatch")
        self._authorized_speech_handles[handle_id] = AuthorizedSpeechHandleRecord(
            finalized_turn_id=record.finalized_turn_id,
            move_id=move_id,
            tool_mode=record.tool_mode,
            generation_started=False,
            continuation_steps=record.continuation_steps,
            fallback_generation_granted=record.fallback_generation_granted,
            completion_acceptance=record.completion_acceptance,
        )

    def request_tool_fallback(
        self,
        *,
        handle_id: str,
        monotonic_ms: int | None = None,
    ) -> bool:
        """Fence tools now and defer fallback admission to generation."""
        state = self._state
        record = self._authorized_speech_handles.get(handle_id)
        if (
            not self.enabled
            or state is None
            or record is None
            or not record.tool_mode
            or record.move_id is not None
            or record.fallback_generation_granted
            or self._current_generation_handle.get() != handle_id
        ):
            return False
        try:
            projected = project_controller_state(
                state,
                monotonic_ms=_monotonic_ms(monotonic_ms),
            )
        except ControllerError:
            return False
        if (
            projected.terminal
            or projected.speech_fenced
            or projected.lifecycle_state != "active"
            or projected.pending_move_id is not None
            or projected.last_finalized_candidate_turn_id
            != record.finalized_turn_id
        ):
            return False
        self._tool_fallback_pending_handles.add(handle_id)
        return True

    def admit_tool_fallback_move(
        self,
        *,
        handle_id: str,
        monotonic_ms: int | None = None,
    ) -> bool:
        """Bind one deterministic controller fallback to an active tool handle."""
        state = self._state
        record = self._authorized_speech_handles.get(handle_id)
        if (
            not self.enabled
            or state is None
            or record is None
            or not record.tool_mode
            or record.move_id is not None
            or handle_id not in self._tool_fallback_pending_handles
            or self._current_generation_handle.get() != handle_id
        ):
            return False
        try:
            current_ms = _monotonic_ms(monotonic_ms)
            projected = project_controller_state(state, monotonic_ms=current_ms)
        except ControllerError:
            return False
        if (
            projected.terminal
            or projected.speech_fenced
            or projected.lifecycle_state != "active"
            or projected.pending_move_id is not None
            or projected.last_finalized_candidate_turn_id
            != record.finalized_turn_id
        ):
            return False

        candidates = list_probe_candidates(projected)
        if projected.clock.band == "closing" and "close" in projected.allowed_moves:
            move_type = "close"
            topic = projected.current_topic
            probe_candidate_id = None
        elif candidates:
            candidate = candidates[0]
            move_type = candidate["move_type"]
            topic = candidate["topic"]
            probe_candidate_id = candidate["probe_candidate_id"]
        elif "transition" in projected.allowed_moves:
            move_type = "transition"
            topic = projected.topic_catalog[
                min(projected.topic_index + 1, len(projected.topic_catalog) - 1)
            ]
            probe_candidate_id = None
        elif "close" in projected.allowed_moves:
            move_type = "close"
            topic = projected.current_topic
            probe_candidate_id = None
        else:
            return False

        move_id = f"move:{projected.session_id}:{projected.move_ordinal + 1}"
        try:
            transition = reduce_controller(
                state,
                InterviewerMoveAdmitted(
                    expected_state_revision=state.state_revision,
                    move_id=move_id,
                    move_type=move_type,
                    reason_code="controller_fallback",
                    question_id=projected.active_question_id,
                    topic=topic,
                    source_turn_id=record.finalized_turn_id,
                    probe_candidate_id=probe_candidate_id,
                    monotonic_ms=current_ms,
                ),
            )
        except ControllerError:
            return False
        self._state = transition.state
        self._authorized_speech_handles[handle_id] = AuthorizedSpeechHandleRecord(
            finalized_turn_id=record.finalized_turn_id,
            move_id=move_id,
            tool_mode=record.tool_mode,
            generation_started=False,
            continuation_steps=record.continuation_steps,
            fallback_generation_granted=record.fallback_generation_granted,
            completion_acceptance=record.completion_acceptance,
        )
        return True

    def tools_fenced_for_current_handle(self) -> bool:
        handle_id = self._current_generation_handle.get()
        record = self._authorized_speech_handles.get(handle_id)
        return bool(
            isinstance(handle_id, str)
            and (
                handle_id in self._tool_budget_exhausted_handles
                or handle_id in self._tool_fallback_pending_handles
                or (record is not None and record.move_id is not None)
            )
        )

    def current_tool_fallback_instruction(self) -> str | None:
        """Describe only the controller-selected fallback for this handle."""
        state = self._state
        handle_id = self._current_generation_handle.get()
        record = self._authorized_speech_handles.get(handle_id)
        if (
            not self.enabled
            or state is None
            or record is None
            or record.move_id is None
            or state.pending_move_id != record.move_id
        ):
            return None
        move = _find_move(state, record.move_id)
        if move.reason_code != "controller_fallback":
            return None
        return " ".join(
            (
                "CONTROLLER_FALLBACK",
                json.dumps(
                    {
                        "contract_version": CONTROLLER_ADAPTER_CONTRACT_VERSION,
                        "move_type": move.move_type,
                        "question_id": move.question_id,
                        "topic": move.topic,
                    },
                    ensure_ascii=True,
                    separators=(",", ":"),
                    sort_keys=True,
                ),
                "Make exactly one natural interviewer reply matching this move.",
                "Do not call another tool or reveal internal state or reasoning.",
            )
        )

    def _authorize_speech_handle(
        self,
        *,
        handle_id: str,
        record: AuthorizedSpeechHandleRecord,
    ) -> None:
        evicted = put_bounded_correlation(
            self._authorized_speech_handles,
            handle_id,
            record,
            limit=MAX_PENDING_CORRELATIONS,
        )
        for evicted_handle_id in evicted:
            self._retire_speech_handle(evicted_handle_id)

    def _authorize_same_handle_continuation(
        self,
        *,
        handle_id: str,
        record: AuthorizedSpeechHandleRecord,
        monotonic_ms: int | None,
    ) -> bool:
        state = self._state
        if state is None:
            return True
        if not record.tool_mode:
            return False
        current_ms = _monotonic_ms(monotonic_ms)
        projected = project_controller_state(state, monotonic_ms=current_ms)
        if (
            projected.terminal
            or projected.speech_fenced
            or projected.lifecycle_state != "active"
        ):
            return False
        next_step = record.continuation_steps + 1
        fallback_pending = handle_id in self._tool_fallback_pending_handles
        if next_step > MAX_SAME_HANDLE_CONTINUATIONS:
            self._tool_budget_exhausted_handles.add(handle_id)
            if record.fallback_generation_granted:
                return False
            self._tool_fallback_pending_handles.add(handle_id)
            fallback_pending = True
        if fallback_pending:
            if not self.admit_tool_fallback_move(
                handle_id=handle_id,
                monotonic_ms=current_ms,
            ):
                return False
            self._tool_fallback_pending_handles.discard(handle_id)
            state = self._state
            if state is None:
                return False
            record = self._authorized_speech_handles[handle_id]
            record = AuthorizedSpeechHandleRecord(
                finalized_turn_id=record.finalized_turn_id,
                move_id=record.move_id,
                tool_mode=record.tool_mode,
                generation_started=record.generation_started,
                continuation_steps=record.continuation_steps,
                fallback_generation_granted=False,
                completion_acceptance=record.completion_acceptance,
            )
            self._authorized_speech_handles[handle_id] = record
            if next_step > MAX_SAME_HANDLE_CONTINUATIONS:
                next_step = record.continuation_steps
        move_id = record.move_id
        generation_started = record.generation_started
        is_fallback_move = False
        if move_id is not None:
            if state.pending_move_id != move_id:
                return False
            move = _find_move(state, move_id)
            is_fallback_move = move.reason_code == "controller_fallback"
            if (
                is_fallback_move
                and record.fallback_generation_granted
            ):
                return False
            if not generation_started:
                if move.stage != "admitted":
                    return False
                self._state = reduce_controller(
                    state,
                    MoveStageAdvanced(
                        expected_state_revision=state.state_revision,
                        move_id=move_id,
                        stage="generated",
                        monotonic_ms=current_ms,
                    ),
                ).state
                generation_started = True
            elif move.stage not in ("generated", "scheduled", "spoken"):
                return False
        self._authorized_speech_handles[handle_id] = AuthorizedSpeechHandleRecord(
            finalized_turn_id=record.finalized_turn_id,
            move_id=move_id,
            tool_mode=record.tool_mode,
            generation_started=generation_started,
            continuation_steps=next_step,
            fallback_generation_granted=(
                record.fallback_generation_granted or is_fallback_move
            ),
            completion_acceptance=record.completion_acceptance,
        )
        return True

    @staticmethod
    def _bounded_put(target: dict, key: str, value: object) -> None:
        put_bounded_correlation(
            target,
            key,
            value,
            limit=MAX_PENDING_CORRELATIONS,
        )

    def _retire_speech_handle(self, handle_id: str) -> None:
        if handle_id in self._authorized_speech_handles:
            return
        put_bounded_correlation(
            self._retired_speech_handles,
            handle_id,
            None,
            limit=MAX_PENDING_CORRELATIONS,
        )
        self._active_tool_handles.discard(handle_id)
        self._tool_calls_by_handle.pop(handle_id, None)
        self._tool_names_by_handle.pop(handle_id, None)
        self._tool_budget_exhausted_handles.discard(handle_id)
        self._tool_fallback_pending_handles.discard(handle_id)

    def _mint_generation_context_id(
        self,
        *,
        finalized_turn_id: str,
        move_id: str,
    ) -> str:
        capability = self._generation_token_factory()
        if (
            not isinstance(capability, str)
            or _GENERATION_CAPABILITY_PATTERN.fullmatch(capability) is None
            or capability in self._seen_generation_capabilities
        ):
            raise ControllerError("invalid_generation_capability")
        if (
            len(self._seen_generation_capabilities)
            >= MAX_SESSION_GENERATION_CAPABILITIES
        ):
            raise ControllerError("generation_capability_capacity_exceeded")
        self._seen_generation_capabilities[capability] = None
        self._generation_epoch += 1
        put_bounded_correlation(
            self._generation_capabilities,
            capability,
            GenerationCapabilityRecord(
                finalized_turn_id=finalized_turn_id,
                move_id=move_id,
                generation_epoch=self._generation_epoch,
                handle_id=None,
            ),
            limit=MAX_PENDING_CORRELATIONS,
        )
        return (
            f"controller:{move_id}"
            f"{_GENERATION_CAPABILITY_SEPARATOR}{capability}"
        )

    def _disable(self, error: Exception) -> None:
        self._state = None
        self._current_generation_handle.set(None)
        self._generation_epoch = 0
        self._created_speech_handles.clear()
        self._authorized_speech_handles.clear()
        self._retired_speech_handles.clear()
        self._generation_capabilities.clear()
        self._seen_generation_capabilities.clear()
        self._transcript_move_ids.clear()
        self._interruption_move_ids.clear()
        self._persisted_interviewer_events.clear()
        self._admitted_candidate_revisions.clear()
        self._active_tool_handles.clear()
        self._tool_calls_by_handle.clear()
        self._tool_names_by_handle.clear()
        self._tool_budget_exhausted_handles.clear()
        self._tool_fallback_pending_handles.clear()
        self._failure_reason = (
            error.code if isinstance(error, ControllerError) else "adapter_failure"
        )


def put_bounded_correlation(
    target: dict,
    key: str,
    value: object,
    *,
    limit: int,
) -> tuple[str, ...]:
    """Insert one runtime correlation and report deterministic evictions."""
    target[key] = value
    evicted: list[str] = []
    while len(target) > limit:
        oldest = next(iter(target))
        target.pop(oldest)
        evicted.append(oldest)
    return tuple(evicted)


def controller_feature_enabled(env: Mapping[str, str]) -> bool:
    return env.get(CONTROLLER_FEATURE_ENV) == "true"


def resolve_controller_runtime_mode(
    adapter: InterviewControllerAdapter,
) -> Literal["existing_interviewer", "controlled_interviewer"]:
    return "controlled_interviewer" if adapter.enabled else "existing_interviewer"


def create_interview_controller_adapter(
    *,
    env: Mapping[str, str],
    session_id: str,
    deadline_at: str | None,
    writer_id: str,
    writer_generation: int,
    interview_brief: Mapping[str, object] | None,
    lifecycle_state: str | None = None,
    lifecycle_version: int | None = None,
    observed_at: datetime | None = None,
    monotonic_ms: int | None = None,
    generation_token_factory: Callable[[], str] | None = None,
) -> InterviewControllerAdapter:
    if not controller_feature_enabled(env):
        return InterviewControllerAdapter(state=None, failure_reason="flag_disabled")
    if interview_brief is None:
        return InterviewControllerAdapter(state=None, failure_reason="brief_unavailable")
    if deadline_at is None:
        return InterviewControllerAdapter(state=None, failure_reason="deadline_unavailable")
    if lifecycle_state is None or lifecycle_version is None:
        return InterviewControllerAdapter(
            state=None,
            failure_reason="lifecycle_snapshot_unavailable",
        )
    try:
        if lifecycle_state != "active":
            raise ControllerError("lifecycle_not_active")
        if type(lifecycle_version) is not int or lifecycle_version <= 0:
            raise ControllerError("invalid_lifecycle")
        if interview_brief.get("contract_version") != "interview-brief.v2":
            raise ControllerError("invalid_brief")
        if interview_brief.get("session_id") != session_id:
            raise ControllerError("invalid_brief")
        if interview_brief.get("deadline_at") != deadline_at:
            raise ControllerError("invalid_brief")
        brief_id = _required_string(interview_brief, "brief_id")
        duration_minutes = _required_integer(interview_brief, "duration_minutes")
        if duration_minutes not in (15, 30, 45):
            raise ControllerError("invalid_brief")
        selected_question = _required_mapping(interview_brief, "selected_question")
        round_pack = _required_mapping(interview_brief, "round_pack")
        objectives = _required_token_tuple(round_pack, "objectives", maximum=8)
        topics = _required_token_tuple(round_pack, "probe_families", maximum=12)
        deadline = parse_deadline_at(deadline_at)
        if deadline is None:
            raise ControllerError("invalid_clock")
        started = deadline - timedelta(minutes=duration_minutes)
        current = observed_at or datetime.now(timezone.utc)
        if current.tzinfo is None:
            raise ControllerError("invalid_clock")
        current = max(started, current.astimezone(timezone.utc))
        state = create_controller_state(
            session_id=session_id,
            brief_id=brief_id,
            writer_id=writer_id,
            writer_generation=writer_generation,
            lifecycle_state=lifecycle_state,
            lifecycle_version=lifecycle_version,
            started_at=serialize_deadline_at(started),
            deadline_at=deadline_at,
            observed_at=serialize_deadline_at(current),
            monotonic_anchor_ms=_monotonic_ms(monotonic_ms),
            round_objectives=objectives,
            topic_catalog=topics,
            active_question_id=_required_string(selected_question, "id"),
        )
        return InterviewControllerAdapter(
            state=state,
            generation_token_factory=generation_token_factory,
        )
    except Exception as error:
        reason = error.code if isinstance(error, ControllerError) else "initialization_failure"
        return InterviewControllerAdapter(state=None, failure_reason=reason)


def measured_turn_duration_ms(metrics: object) -> int:
    if not isinstance(metrics, Mapping):
        return 0
    started = metrics.get("started_speaking_at")
    stopped = metrics.get("stopped_speaking_at")
    if (
        isinstance(started, bool)
        or isinstance(stopped, bool)
        or not isinstance(started, (int, float))
        or not isinstance(stopped, (int, float))
        or stopped < started
    ):
        return 0
    return max(0, round((stopped - started) * 1_000))


def _requests_exit(text: str) -> bool:
    normalized = _normalize_intent_text(text)
    if not normalized or len(normalized.split()) > MAX_EXIT_INTENT_WORDS:
        return False
    return any(pattern.fullmatch(normalized) for pattern in _EXIT_REQUEST_PATTERNS)


def _requests_clarification(text: str) -> bool:
    normalized = " ".join(text.casefold().split())
    return any(pattern.search(normalized) is not None for pattern in _CLARIFICATION_PATTERNS)


def _normalize_intent_text(text: str) -> str:
    normalized = text.casefold().replace("\u2019", "'").replace("'", "")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", normalized).split())


def _generation_context_identity(
    items: object,
) -> tuple[str | None, str | None, str | None]:
    if not isinstance(items, (list, tuple)):
        return None, None, None
    finalized_turn_id: str | None = None
    move_id: str | None = None
    generation_capability: str | None = None
    for item in reversed(items[-MAX_GENERATION_CONTEXT_ITEMS:]):
        item_id = getattr(item, "id", None)
        if not isinstance(item_id, str) or not item_id:
            continue
        role = getattr(item, "role", None)
        if finalized_turn_id is None and role == "user":
            finalized_turn_id = item_id
        if move_id is None and role == "system":
            parsed_move_id, parsed_capability = _parse_generation_context_id(
                item_id
            )
            if parsed_move_id is not None:
                move_id = parsed_move_id
                generation_capability = parsed_capability
        if (
            finalized_turn_id is not None
            and move_id is not None
            and generation_capability is not None
        ):
            break
    return finalized_turn_id, move_id, generation_capability


def _redact_generation_capability(items: object) -> None:
    if not isinstance(items, list):
        return
    start = max(0, len(items) - MAX_GENERATION_CONTEXT_ITEMS)
    for index in range(start, len(items)):
        item = items[index]
        if getattr(item, "role", None) != "system":
            continue
        item_id = getattr(item, "id", None)
        if not isinstance(item_id, str):
            continue
        move_id, capability = _parse_generation_context_id(item_id)
        if move_id is not None and capability is not None:
            model_copy = getattr(item, "model_copy", None)
            if callable(model_copy):
                redacted = model_copy(deep=True)
            else:
                redacted = copy(item)
            setattr(redacted, "id", f"controller:{move_id}")
            items[index] = redacted


def _parse_generation_context_id(
    item_id: str,
) -> tuple[str | None, str | None]:
    if not (
        item_id.startswith("controller:move:")
        or item_id.startswith("controller:tool-turn:")
    ):
        return None, None
    body = item_id.removeprefix("controller:")
    if _GENERATION_CAPABILITY_SEPARATOR not in body:
        return None, None
    move_id, capability = body.rsplit(_GENERATION_CAPABILITY_SEPARATOR, 1)
    if not move_id or not capability:
        return None, None
    return move_id, capability


def _new_generation_capability() -> str:
    return secrets.token_urlsafe(32)


def _monotonic_ms(value: int | None) -> int:
    candidate = time.monotonic_ns() // 1_000_000 if value is None else value
    if type(candidate) is not int or candidate < 0:
        raise ControllerError("invalid_event")
    return candidate


def _required_string(value: Mapping[str, object], key: str) -> str:
    candidate = value.get(key)
    if not isinstance(candidate, str) or not candidate:
        raise ControllerError("invalid_adapter_input")
    return candidate


def _required_identifier(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise ControllerError("invalid_adapter_input")
    return value


def _required_integer(value: Mapping[str, object], key: str) -> int:
    candidate = value.get(key)
    if type(candidate) is not int:
        raise ControllerError("invalid_adapter_input")
    return candidate


def _required_mapping(
    value: Mapping[str, object], key: str
) -> Mapping[str, object]:
    candidate = value.get(key)
    if not isinstance(candidate, Mapping):
        raise ControllerError("invalid_adapter_input")
    return candidate


def _required_token_tuple(
    value: Mapping[str, object], key: str, *, maximum: int
) -> tuple[str, ...]:
    candidate = value.get(key)
    if not isinstance(candidate, list) or not 1 <= len(candidate) <= maximum:
        raise ControllerError("invalid_adapter_input")
    tokens = tuple(candidate)
    if any(
        not isinstance(token, str)
        or re.fullmatch(r"[a-z0-9][a-z0-9_-]*", token) is None
        for token in tokens
    ):
        raise ControllerError("invalid_adapter_input")
    return tokens


def _delivery_state(
    transcript_event: Mapping[str, object],
) -> str:
    candidate = transcript_event.get("delivery_state")
    if candidate not in ("delivered", "partially_delivered"):
        raise ControllerError("invalid_adapter_input")
    return candidate


def _find_move(state: ControllerState, move_id: str):
    for move in state.move_ledger:
        if move.move_id == move_id:
            return move
    raise ControllerError("unknown_move")
