"""Fail-safe runtime boundary for the deterministic interview controller."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, Mapping

from shared.interview_controller import (
    CandidateTurnCompleted,
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

_EXIT_UTTERANCES = {
    "end interview",
    "end the interview",
    "i want to stop",
    "i would like to stop",
    "let's stop",
    "lets stop",
    "stop",
    "stop interview",
    "stop the interview",
}
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


@dataclass(frozen=True)
class ControllerAdapterStatus:
    contract_version: str
    enabled: bool
    failure_reason: str | None


class InterviewControllerAdapter:
    """Mutable boundary owner around an immutable pure controller state."""

    def __init__(
        self,
        *,
        state: ControllerState | None,
        failure_reason: str | None = None,
    ) -> None:
        self._state = state
        self._failure_reason = failure_reason
        self._speech_move_ids: dict[str, str] = {}
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
                )
            move_id = transition.state.pending_move_id
            return TurnDirective(
                contract_version=CONTROLLER_ADAPTER_CONTRACT_VERSION,
                instruction=transition.snapshot.to_prompt_instruction(),
                suppress_reply=False,
                move_id=move_id,
            )
        except Exception as error:
            self._disable(error)
            return None

    def speech_created(
        self, *, handle_id: str, monotonic_ms: int | None = None
    ) -> None:
        state = self._state
        if not self.enabled or state is None or state.pending_move_id is None:
            return
        try:
            move_id = state.pending_move_id
            transition = reduce_controller(
                state,
                MoveStageAdvanced(
                    expected_state_revision=state.state_revision,
                    move_id=move_id,
                    stage="generated",
                    monotonic_ms=_monotonic_ms(monotonic_ms),
                ),
            )
            self._state = transition.state
            self._speech_move_ids[handle_id] = move_id
        except Exception as error:
            self._disable(error)

    def speech_finished(
        self,
        *,
        handle_id: str,
        scheduled: bool,
        interrupted: bool,
        has_confirmed_prefix: bool,
        assistant_message_ids: tuple[str, ...] = (),
        monotonic_ms: int | None = None,
    ) -> None:
        state = self._state
        move_id = self._speech_move_ids.pop(handle_id, None)
        if not self.enabled or state is None or move_id is None:
            return
        try:
            move = _find_move(state, move_id)
            if move.stage == "canonically_delivered":
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
        target[key] = value
        while len(target) > MAX_PENDING_CORRELATIONS:
            target.pop(next(iter(target)))

    def _disable(self, error: Exception) -> None:
        self._state = None
        self._speech_move_ids.clear()
        self._transcript_move_ids.clear()
        self._interruption_move_ids.clear()
        self._persisted_interviewer_events.clear()
        self._admitted_candidate_revisions.clear()
        self._failure_reason = (
            error.code if isinstance(error, ControllerError) else "adapter_failure"
        )


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
        return InterviewControllerAdapter(state=state)
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
    normalized = " ".join(text.casefold().strip(" .!?,'\"").split())
    return normalized in _EXIT_UTTERANCES


def _requests_clarification(text: str) -> bool:
    normalized = " ".join(text.casefold().split())
    return any(pattern.search(normalized) is not None for pattern in _CLARIFICATION_PATTERNS)


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
