"""Privacy-safe semantic observability for the adaptive interviewer."""

from __future__ import annotations

import asyncio
import math
import os
import re
import threading
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from datetime import datetime, timezone
from typing import Any, Literal, TypeAlias
from uuid import uuid4

from shared.opik_tracing import read_opik_tracing_config

INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION = "interviewer-observability.v1"
INTERVIEWER_MOVE_CONTRACT_VERSION = "interviewer-move.v1"
INTERVIEWER_TOOL_CONTRACT_VERSION = "interviewer-tools.v1"
DIRECTOR_RECOMMENDATION_CONTRACT_VERSION = "director-recommendation.v1"
DIRECTOR_POLICY_CONTRACT_VERSION = "interview-director-policy.v1"
INTERVIEWER_OBSERVABILITY_CLOSE_TIMEOUT_SECONDS = 0.05

RolloutCohort: TypeAlias = Literal["current", "shadow", "canary"]

_ROLLOUT_COHORTS = {"current", "shadow", "canary"}
_RUNTIME_VERSIONS = {
    "current-prompt.v1",
    "director-shadow.v1",
    "adaptive-canary.v1",
}
_CORRELATION_UUID_PATTERN = (
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)
_MAX_LATENCY_MS = 86_400_000
_EVENT_KINDS = {
    "phase",
    "move",
    "tool",
    "director",
    "latency",
    "interruption",
    "fallback",
    "close",
}
_PHASES = {
    "opening",
    "primary_question",
    "follow_up",
    "transition",
    "closing",
    "closed",
}
_MOVE_STAGES = {
    "planned",
    "admitted",
    "generated",
    "scheduled",
    "spoken",
    "interrupted",
    "aborted",
    "canonically_delivered",
}
_MOVE_TYPES = {"probe", "clarify", "challenge", "transition", "close"}
_TOOL_NAMES = {
    "read_interview_state",
    "read_interview_clock",
    "get_probe_candidates",
    "commit_interviewer_move",
    "request_graceful_close",
}
_TOOL_OUTCOMES = {
    "ok",
    "duplicate",
    "stale_state",
    "stale_writer",
    "expired",
    "idempotency_conflict",
    "closed",
    "invalid_request",
    "timeout",
    "unavailable",
}
_DIRECTOR_OUTCOMES = {
    "ready",
    "admitted",
    "rejected",
    "stale",
    "malformed",
    "timeout",
    "unavailable",
}
_RECOMMENDATION_FRESHNESS = {"fresh", "stale", "speculative", "missing"}
_RECOMMENDATION_COMPARISONS = {
    "exact_match",
    "move_match_target_mismatch",
    "move_mismatch",
    "recommendation_missing",
    "recommendation_expired",
    "arrived_after_delivery",
}
_LATENCY_KINDS = {
    "user_speech_to_first_audio",
    "controller_decision_to_first_audio",
    "director_ready",
    "tool_execution",
    "interruption_recovery",
}
_INTERRUPTION_STAGES = {
    "interrupted",
    "recovery_started",
    "recovered",
    "unrecovered",
}
_DELIVERY_OBSERVATIONS = {
    "no_prefix",
    "partial_prefix",
    "full_delivery",
    "unknown",
}
_FALLBACK_REASONS = {
    "controller_policy",
    "director_unavailable",
    "director_stale",
    "director_malformed",
    "director_timeout",
    "tool_timeout",
    "tool_failure",
    "prompt_build_failure",
    "provider_failure",
}
_FALLBACK_SOURCES = {"controller", "director", "tool", "runtime"}
_CLOSE_REASONS = {
    "user_end",
    "time_limit",
    "candidate_request",
    "disconnect",
    "provider_failure",
    "runtime_closed",
    "unknown",
}
_CLOSE_OUTCOMES = {"observed", "settled", "deferred", "failed"}
_COMPLETION_STATUSES = {"completed", "abandoned", "failed", "unknown"}
_COMPLETION_AUTHORITIES = {"canonical_lifecycle", "runtime_observed"}

_COMMON_KEYS = {
    "contract_version",
    "event_kind",
    "runtime_correlation_id",
    "turn_correlation_id",
    "runtime_version",
    "rollout_cohort",
    "emitted_at",
}
_EVENT_KEYS = {
    "phase": _COMMON_KEYS | {"phase"},
    "move": _COMMON_KEYS
    | {
        "move_contract_version",
        "move_stage",
        "move_type",
        "probe_target_id",
    },
    "tool": _COMMON_KEYS
    | {
        "tool_contract_version",
        "tool_name",
        "tool_outcome",
        "latency_ms",
    },
    "director": _COMMON_KEYS
    | {
        "recommendation_contract_version",
        "director_policy_version",
        "director_adapter_version",
        "recommendation_outcome",
        "recommendation_freshness",
        "recommendation_comparison",
        "ready_latency_ms",
        "recommendation_age_ms",
        "estimated_cost_microusd",
    },
    "latency": _COMMON_KEYS | {"latency_kind", "latency_ms"},
    "interruption": _COMMON_KEYS
    | {
        "interruption_stage",
        "delivery_observation",
        "recovery_latency_ms",
    },
    "fallback": _COMMON_KEYS | {"fallback_reason", "fallback_source"},
    "close": _COMMON_KEYS
    | {
        "close_reason",
        "close_outcome",
        "completion_status",
        "completion_authority",
    },
}

_SAFE_SEMANTIC_ATTRIBUTE_NAMES = frozenset(
    f"meelni.interviewer.{key}"
    for keys in _EVENT_KEYS.values()
    for key in keys
)


def safe_semantic_attribute_names() -> frozenset[str]:
    """Return the exporter allowlist without exposing a mutable global."""
    return _SAFE_SEMANTIC_ATTRIBUTE_NAMES


def is_interviewer_observability_session(value: object) -> bool:
    """Validate the exact content-free semantic session envelope."""
    return (
        isinstance(value, dict)
        and set(value)
        == {
            "contract_version",
            "runtime_correlation_id",
            "runtime_version",
            "rollout_cohort",
        }
        and value.get("contract_version")
        == INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION
        and _runtime_correlation_id(value.get("runtime_correlation_id"))
        and value.get("runtime_version") in _RUNTIME_VERSIONS
        and value.get("rollout_cohort") in _ROLLOUT_COHORTS
    )


def is_interviewer_observability_event(value: object) -> bool:
    """Validate an exact content-free semantic event shape."""
    if not isinstance(value, dict):
        return False
    event_kind = value.get("event_kind")
    if event_kind not in _EVENT_KINDS or set(value) != _EVENT_KEYS[event_kind]:
        return False
    if (
        value.get("contract_version")
        != INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION
        or not _runtime_correlation_id(value.get("runtime_correlation_id"))
        or not _nullable_turn_correlation_id(value.get("turn_correlation_id"))
        or value.get("runtime_version") not in _RUNTIME_VERSIONS
        or value.get("rollout_cohort") not in _ROLLOUT_COHORTS
        or not _canonical_timestamp(value.get("emitted_at"))
    ):
        return False

    if event_kind == "phase":
        return value.get("phase") in _PHASES
    if event_kind == "move":
        return (
            value.get("move_contract_version")
            == INTERVIEWER_MOVE_CONTRACT_VERSION
            and value.get("move_stage") in _MOVE_STAGES
            and value.get("move_type") in _MOVE_TYPES
            and _nullable_probe_target_id(value.get("probe_target_id"))
        )
    if event_kind == "tool":
        return (
            value.get("tool_contract_version")
            == INTERVIEWER_TOOL_CONTRACT_VERSION
            and value.get("tool_name") in _TOOL_NAMES
            and value.get("tool_outcome") in _TOOL_OUTCOMES
            and _latency(value.get("latency_ms"))
        )
    if event_kind == "director":
        return (
            value.get("recommendation_contract_version")
            == DIRECTOR_RECOMMENDATION_CONTRACT_VERSION
            and value.get("director_policy_version")
            == DIRECTOR_POLICY_CONTRACT_VERSION
            and _contract_token(value.get("director_adapter_version"))
            and value.get("recommendation_outcome") in _DIRECTOR_OUTCOMES
            and value.get("recommendation_freshness")
            in _RECOMMENDATION_FRESHNESS
            and (
                value.get("recommendation_comparison") is None
                or value.get("recommendation_comparison")
                in _RECOMMENDATION_COMPARISONS
            )
            and _nullable_latency(value.get("ready_latency_ms"))
            and _nullable_latency(value.get("recommendation_age_ms"))
            and _nullable_estimated_cost(value.get("estimated_cost_microusd"))
        )
    if event_kind == "latency":
        return value.get("latency_kind") in _LATENCY_KINDS and _latency(
            value.get("latency_ms")
        )
    if event_kind == "interruption":
        return (
            value.get("interruption_stage") in _INTERRUPTION_STAGES
            and value.get("delivery_observation") in _DELIVERY_OBSERVATIONS
            and _nullable_latency(value.get("recovery_latency_ms"))
        )
    if event_kind == "fallback":
        return (
            value.get("fallback_reason") in _FALLBACK_REASONS
            and value.get("fallback_source") in _FALLBACK_SOURCES
        )
    if event_kind == "close":
        return (
            value.get("close_reason") in _CLOSE_REASONS
            and value.get("close_outcome") in _CLOSE_OUTCOMES
            and value.get("completion_status") in _COMPLETION_STATUSES
            and value.get("completion_authority") in _COMPLETION_AUTHORITIES
        )
    return False


def semantic_event_attributes(value: object) -> dict[str, str | float]:
    """Convert one validated event into the exact exporter attribute namespace."""
    if not is_interviewer_observability_event(value):
        return {}
    assert isinstance(value, dict)
    attributes: dict[str, str | float] = {}
    for key, item in value.items():
        if item is None:
            continue
        if isinstance(item, bool):
            continue
        if isinstance(item, (str, int, float)):
            attributes[f"meelni.interviewer.{key}"] = item
    return attributes


def resolve_interviewer_observability_identity(
    env: Mapping[str, str],
) -> tuple[str, RolloutCohort]:
    """Derive version/cohort from server-owned flags, never room metadata."""
    influence = _is_true(env.get("MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED"))
    shadow = _is_true(env.get("MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED"))
    if influence:
        default_version, cohort = "adaptive-canary.v1", "canary"
    elif shadow:
        default_version, cohort = "director-shadow.v1", "shadow"
    else:
        default_version, cohort = "current-prompt.v1", "current"
    configured_version = env.get("MEELNI_INTERVIEW_RUNTIME_VERSION", "").strip()
    return (
        configured_version if configured_version in _RUNTIME_VERSIONS else default_version,
        cohort,
    )


class InterviewerObservability:
    """Fail-open child-span emitter attached to the active LiveKit trace."""

    def __init__(
        self,
        *,
        tracer: Any | None,
        runtime_version: str,
        rollout_cohort: RolloutCohort,
        runtime_correlation_id: str,
        clock: Callable[[], float] = time.time,
        context_factory: Callable[[Any], Any] | None = None,
    ) -> None:
        self.enabled = tracer is not None
        self.runtime_version = runtime_version
        self.rollout_cohort = rollout_cohort
        self.runtime_correlation_id = runtime_correlation_id
        self._tracer = tracer
        self._clock = clock
        self._context_factory = context_factory
        self._session_span: Any | None = None
        self._closed = False
        if tracer is None:
            return
        try:
            self._session_span = tracer.start_span(
                "interviewer_observability_session",
                attributes={
                    "meelni.interviewer.contract_version": (
                        INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION
                    ),
                    "meelni.interviewer.runtime_correlation_id": (
                        runtime_correlation_id
                    ),
                    "meelni.interviewer.runtime_version": runtime_version,
                    "meelni.interviewer.rollout_cohort": rollout_cohort,
                },
            )
        except Exception:  # noqa: BLE001 - telemetry is never authoritative
            self.enabled = False
            self._session_span = None

    def record(
        self,
        event_kind: str,
        *,
        turn_correlation_id: str | None = None,
        **fields: object,
    ) -> bool:
        if not self.enabled or self._closed or self._tracer is None:
            return False
        try:
            value: dict[str, object] = {
                "contract_version": INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION,
                "event_kind": event_kind,
                "runtime_correlation_id": self.runtime_correlation_id,
                "turn_correlation_id": turn_correlation_id,
                "runtime_version": self.runtime_version,
                "rollout_cohort": self.rollout_cohort,
                "emitted_at": _canonical_time(self._clock()),
                **fields,
            }
            attributes = semantic_event_attributes(value)
            if not attributes:
                return False
            context = (
                self._context_factory(self._session_span)
                if self._context_factory is not None
                and self._session_span is not None
                else None
            )
            span = self._tracer.start_span(
                "interviewer_semantic_event",
                context=context,
                attributes=attributes,
            )
            span.end()
            return True
        except Exception:  # noqa: BLE001 - telemetry cannot affect the runtime
            return False

    def record_phase(self, phase: str, *, turn_id: str | None = None) -> bool:
        return self.record("phase", turn_correlation_id=turn_id, phase=phase)

    def record_fallback(self, reason: str, *, source: str) -> bool:
        return self.record(
            "fallback",
            fallback_reason=reason,
            fallback_source=source,
        )

    def record_close(
        self,
        *,
        reason: str,
        outcome: str,
        completion_status: str = "unknown",
        authority: str = "runtime_observed",
    ) -> bool:
        return self.record(
            "close",
            turn_correlation_id=None,
            close_reason=reason,
            close_outcome=outcome,
            completion_status=completion_status,
            completion_authority=authority,
        )

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            if self._session_span is not None:
                self._session_span.end()
        except Exception:  # noqa: BLE001 - telemetry cannot affect shutdown
            pass


def create_interviewer_observability(
    env: Mapping[str, str] | None = None,
    *,
    tracer: Any | None = None,
    clock: Callable[[], float] = time.time,
    id_factory: Callable[[], str] | None = None,
) -> InterviewerObservability:
    """Create an emitter only under the existing explicit Opik gate."""
    source = env if env is not None else os.environ
    runtime_version, rollout_cohort = resolve_interviewer_observability_identity(
        source
    )
    runtime_correlation_id = f"run:{(id_factory or uuid4)()}"
    if read_opik_tracing_config(source) is None:
        return InterviewerObservability(
            tracer=None,
            runtime_version=runtime_version,
            rollout_cohort=rollout_cohort,
            runtime_correlation_id=runtime_correlation_id,
            clock=clock,
        )
    try:
        if tracer is None:
            from opentelemetry import trace
            from opentelemetry.trace import set_span_in_context

            tracer = trace.get_tracer("meelni.interviewer.observability")
            context_factory = set_span_in_context
        else:
            context_factory = None

        return InterviewerObservability(
            tracer=tracer,
            runtime_version=runtime_version,
            rollout_cohort=rollout_cohort,
            runtime_correlation_id=runtime_correlation_id,
            clock=clock,
            context_factory=context_factory,
        )
    except Exception:  # noqa: BLE001 - telemetry setup is fail-open
        return InterviewerObservability(
            tracer=None,
            runtime_version=runtime_version,
            rollout_cohort=rollout_cohort,
            runtime_correlation_id=runtime_correlation_id,
            clock=clock,
        )


class InterviewerTurnLatencyTracker:
    """Correlate measured speech timings without exporting transcript identities."""

    def __init__(
        self,
        observability: InterviewerObservability,
        *,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self._observability = observability
        self._id_factory = id_factory or (lambda: str(uuid4()))
        self._pending_user_turn: tuple[str, float] | None = None
        self._pending_recovery: tuple[str, float, frozenset[str]] | None = None

    def observe_user_speech_end(self, source_message_id: object, ended_at: object) -> None:
        try:
            if not _positive_time(ended_at):
                return
            self._pending_user_turn = (f"turn:{self._id_factory()}", float(ended_at))
        except Exception:  # noqa: BLE001 - tracking is fail-open
            return

    def observe_interviewer_audio(
        self, source_message_id: object, started_at: object
    ) -> str | None:
        try:
            if not _positive_time(started_at):
                return None
            started = float(started_at)
            turn_id: str | None = None
            if self._pending_user_turn is not None:
                turn_id, ended = self._pending_user_turn
                if started >= ended:
                    self._observability.record(
                        "latency",
                        turn_correlation_id=turn_id,
                        latency_kind="user_speech_to_first_audio",
                        latency_ms=(started - ended) * 1000,
                    )
                    self._pending_user_turn = None
            if self._pending_recovery is not None:
                recovery_turn_id, interrupted_at, excluded_ids = self._pending_recovery
                if (
                    isinstance(source_message_id, str)
                    and source_message_id not in excluded_ids
                    and started >= interrupted_at
                ):
                    recovery_ms = (started - interrupted_at) * 1000
                    self._observability.record(
                        "interruption",
                        turn_correlation_id=recovery_turn_id,
                        interruption_stage="recovered",
                        delivery_observation="unknown",
                        recovery_latency_ms=recovery_ms,
                    )
                    self._pending_recovery = None
            return turn_id
        except Exception:  # noqa: BLE001 - tracking is fail-open
            return None

    def observe_interruption(
        self,
        *,
        occurred_at: object,
        confirmed_message_ids: Sequence[object],
        has_confirmed_prefix: bool,
    ) -> None:
        try:
            if not _positive_time(occurred_at):
                return
            turn_id = (
                self._pending_user_turn[0]
                if self._pending_user_turn is not None
                else f"turn:{self._id_factory()}"
            )
            delivery = "partial_prefix" if has_confirmed_prefix else "no_prefix"
            self._observability.record(
                "interruption",
                turn_correlation_id=turn_id,
                interruption_stage="interrupted",
                delivery_observation=delivery,
                recovery_latency_ms=None,
            )
            excluded_ids = frozenset(
                item for item in confirmed_message_ids if isinstance(item, str)
            )
            self._pending_recovery = (turn_id, float(occurred_at), excluded_ids)
        except Exception:  # noqa: BLE001 - tracking is fail-open
            return

    def mark_unrecovered(self) -> None:
        try:
            if self._pending_recovery is None:
                return
            turn_id, _, _ = self._pending_recovery
            self._observability.record(
                "interruption",
                turn_correlation_id=turn_id,
                interruption_stage="unrecovered",
                delivery_observation="unknown",
                recovery_latency_ms=None,
            )
            self._pending_recovery = None
        except Exception:  # noqa: BLE001 - tracking is fail-open
            return


async def drain_transcript_before_observability_close(
    *,
    drain: Callable[[], Awaitable[None]],
    close: Callable[[], None],
    close_timeout_seconds: float = INTERVIEWER_OBSERVABILITY_CLOSE_TIMEOUT_SECONDS,
) -> None:
    """Drain transcript authority, then bound synchronous telemetry close work."""
    try:
        await drain()
    finally:
        await _run_bounded_observability_close(
            close=close,
            timeout_seconds=close_timeout_seconds,
        )


async def _run_bounded_observability_close(
    *,
    close: Callable[[], None],
    timeout_seconds: float,
) -> None:
    if (
        not isinstance(timeout_seconds, (int, float))
        or isinstance(timeout_seconds, bool)
        or not math.isfinite(timeout_seconds)
        or timeout_seconds <= 0
    ):
        return

    completed = threading.Event()

    def run_close() -> None:
        try:
            close()
        except Exception:  # noqa: BLE001 - telemetry cannot affect shutdown
            pass
        finally:
            completed.set()

    try:
        threading.Thread(
            target=run_close,
            name="interviewer-observability-close",
            daemon=True,
        ).start()
    except Exception:  # noqa: BLE001 - telemetry cannot affect shutdown
        return

    loop = asyncio.get_running_loop()
    deadline = loop.time() + float(timeout_seconds)
    while not completed.is_set():
        remaining = deadline - loop.time()
        if remaining <= 0:
            return
        await asyncio.sleep(min(remaining, 0.005))


def _canonical_time(value: float) -> str:
    if not _positive_time(value):
        raise ValueError("invalid observability time")
    return (
        datetime.fromtimestamp(value, timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _canonical_timestamp(value: object) -> bool:
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", value
    ):
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if not 1 <= parsed.year <= 9999:
            return False
        return True
    except ValueError:
        return False


def _runtime_correlation_id(value: object) -> bool:
    return isinstance(value, str) and bool(
        re.fullmatch(rf"run:{_CORRELATION_UUID_PATTERN}", value)
    )


def _turn_correlation_id(value: object) -> bool:
    return isinstance(value, str) and bool(
        re.fullmatch(rf"turn:{_CORRELATION_UUID_PATTERN}", value)
    )


def _nullable_turn_correlation_id(value: object) -> bool:
    return value is None or _turn_correlation_id(value)


def _probe_target_id(value: object) -> bool:
    return isinstance(value, str) and bool(
        re.fullmatch(r"probe:[0-9a-f]{32,64}", value)
    )


def _nullable_probe_target_id(value: object) -> bool:
    return value is None or _probe_target_id(value)


def _latency(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and 0 <= value <= _MAX_LATENCY_MS
    )


def _nullable_latency(value: object) -> bool:
    return value is None or _latency(value)


def _contract_token(value: object) -> bool:
    return isinstance(value, str) and len(value) <= 96 and bool(
        re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]*", value)
    )


def _nullable_estimated_cost(value: object) -> bool:
    return value is None or (
        type(value) is int and 0 <= value <= 100_000
    )


def _positive_time(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value > 0
    )


def _is_true(value: str | None) -> bool:
    return bool(value) and value.strip().lower() == "true"
