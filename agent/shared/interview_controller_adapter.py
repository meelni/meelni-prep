"""Fail-safe runtime boundary for the deterministic interview controller."""

from __future__ import annotations

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
    CandidateTurnCompleted,
    ClockObserved,
    ControllerError,
    ControllerState,
    DeliveryEvidence,
    MoveStageAdvanced,
    PersistedTranscriptEvidence,
    SpeechInterrupted,
    create_controller_state,
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
    move_id: str
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
        created_handle = self._created_speech_handles.get(handle_id)
        if (
            not isinstance(handle_id, str)
            or handle_id in self._authorized_speech_handles
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
            evicted = put_bounded_correlation(
                self._authorized_speech_handles,
                handle_id,
                AuthorizedSpeechHandleRecord(
                    move_id=move_id,
                    completion_acceptance=(
                        created_handle.completion_acceptance
                    ),
                ),
                limit=MAX_PENDING_CORRELATIONS,
            )
            for evicted_handle_id in evicted:
                self._retire_speech_handle(evicted_handle_id)
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
    if not item_id.startswith("controller:move:"):
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
