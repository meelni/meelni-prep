"""Provider-neutral, read-only shadow Director for full interviews."""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import re
import time
from collections import deque
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Protocol

from shared.interviewer_contracts import (
    DIRECTOR_FAKE_ADAPTER_VERSION,
    DIRECTOR_POLICY_CONTRACT_VERSION,
    DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
    INTERVIEWER_MOVE_REASON_CODES,
    INTERVIEWER_MOVE_TYPES,
    is_interview_runtime_state,
    parse_director_recommendation,
)

DIRECTOR_CONTEXT_CONTRACT_VERSION = "interview-director-context.v1"
DIRECTOR_RUNNER_CONTRACT_VERSION = "interview-director-runner.v1"
DIRECTOR_STORE_CONTRACT_VERSION = "interview-director-store.v1"
DIRECTOR_TRACE_CONTRACT_VERSION = "interview-director-shadow-trace.v1"
DIRECTOR_SHADOW_FEATURE_ENV = "MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED"

_CANONICAL_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
_VERSION_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$")
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")

_HARD_MAX_CONTEXT_TURNS = 12
_HARD_MAX_CONTEXT_BYTES = 16_384
_HARD_MAX_TURN_BYTES = 4_096
_HARD_MAX_OUTPUT_BYTES = 4_096
_HARD_MAX_REASONING_UNITS = 1_024
_HARD_MAX_DEADLINE_MS = 5_000
_HARD_MAX_RETRIES = 2
_HARD_MAX_CONCURRENCY = 4
_HARD_MAX_ESTIMATED_COST_MICROUSD = 100_000
_HARD_MAX_STORE_ENTRIES = 64
_HARD_MAX_PENDING_TASKS = 16
_RECOMMENDATION_TTL_MAX_MS = 10_000

DirectorFinality = Literal["speculative", "finalized"]
DirectorSpeaker = Literal["candidate", "interviewer"]
DirectorTraceKind = Literal["outcome", "comparison"]

DIRECTOR_OUTCOMES = frozenset(
    {
        "prewarmed",
        "ready",
        "speculative_ready",
        "reconciled",
        "discarded_revision",
        "duplicate",
        "stale",
        "malformed",
        "timeout",
        "failed",
        "cancelled",
        "capacity",
        "recovered",
        "settled",
        "after_delivery",
    }
)
DIRECTOR_FRESHNESS = frozenset({"fresh", "stale", "speculative", "missing"})
DIRECTOR_COMPARISONS = frozenset(
    {
        "exact_match",
        "move_match_target_mismatch",
        "move_mismatch",
        "recommendation_missing",
        "recommendation_expired",
        "arrived_after_delivery",
    }
)


class DirectorError(ValueError):
    """Content-safe Director failure with a closed machine-readable code."""

    _CODES = frozenset(
        {
            "invalid_config",
            "invalid_context",
            "invalid_observation",
            "invalid_adapter_result",
            "invalid_recommendation",
            "session_mismatch",
            "writer_mismatch",
            "stale_generation",
            "stale_result",
            "duplicate",
            "replay_conflict",
            "capacity",
            "closed",
            "deadline_elapsed",
        }
    )

    def __init__(self, code: str):
        safe_code = code if code in self._CODES else "invalid_context"
        self.code = safe_code
        super().__init__(f"Interview Director rejected input: {safe_code}")


@dataclass(frozen=True)
class DirectorLimits:
    max_context_turns: int = 8
    max_context_bytes: int = 8_192
    max_turn_bytes: int = 2_048
    max_output_bytes: int = 2_048
    max_reasoning_units: int = 256
    deadline_ms: int = 750
    max_retries: int = 1
    max_concurrency: int = 2
    max_estimated_cost_microusd: int = 1_000
    max_store_entries: int = 32
    max_pending_tasks: int = 8
    recommendation_ttl_ms: int = 5_000

    def __post_init__(self) -> None:
        fields_and_bounds = (
            (self.max_context_turns, 1, _HARD_MAX_CONTEXT_TURNS),
            (self.max_context_bytes, 256, _HARD_MAX_CONTEXT_BYTES),
            (self.max_turn_bytes, 64, _HARD_MAX_TURN_BYTES),
            (self.max_output_bytes, 128, _HARD_MAX_OUTPUT_BYTES),
            (self.max_reasoning_units, 1, _HARD_MAX_REASONING_UNITS),
            (self.deadline_ms, 1, _HARD_MAX_DEADLINE_MS),
            (self.max_retries, 0, _HARD_MAX_RETRIES),
            (self.max_concurrency, 1, _HARD_MAX_CONCURRENCY),
            (
                self.max_estimated_cost_microusd,
                0,
                _HARD_MAX_ESTIMATED_COST_MICROUSD,
            ),
            (self.max_store_entries, 1, _HARD_MAX_STORE_ENTRIES),
            (self.max_pending_tasks, 1, _HARD_MAX_PENDING_TASKS),
            (self.recommendation_ttl_ms, 1, _RECOMMENDATION_TTL_MAX_MS),
        )
        if any(
            type(value) is not int or not minimum <= value <= maximum
            for value, minimum, maximum in fields_and_bounds
        ):
            raise DirectorError("invalid_config")
        if self.max_turn_bytes > self.max_context_bytes:
            raise DirectorError("invalid_config")


@dataclass(frozen=True)
class DirectorShadowConfig:
    enabled: bool
    policy_version: str = DIRECTOR_POLICY_CONTRACT_VERSION
    adapter_version: str = DIRECTOR_FAKE_ADAPTER_VERSION
    limits: DirectorLimits = field(default_factory=DirectorLimits)

    def __post_init__(self) -> None:
        if (
            type(self.enabled) is not bool
            or self.policy_version != DIRECTOR_POLICY_CONTRACT_VERSION
            or _VERSION_TOKEN.fullmatch(self.adapter_version) is None
        ):
            raise DirectorError("invalid_config")


def resolve_director_shadow_config(
    env: Mapping[str, str],
    *,
    adapter_version: str = DIRECTOR_FAKE_ADAPTER_VERSION,
    limits: DirectorLimits | None = None,
) -> DirectorShadowConfig:
    """Resolve only the exact server-owned shadow flag; no provider is selected."""
    return DirectorShadowConfig(
        enabled=env.get(DIRECTOR_SHADOW_FEATURE_ENV) == "true",
        adapter_version=adapter_version,
        limits=limits or DirectorLimits(),
    )


@dataclass(frozen=True)
class DirectorTurnObservation:
    session_id: str
    writer_id: str
    writer_generation: int
    turn_id: str
    transcript_revision: str
    sequence: int
    speaker: DirectorSpeaker
    finality: DirectorFinality
    text: str
    observed_at: str

    def validate(self, limits: DirectorLimits) -> None:
        if (
            not _identifier(self.session_id)
            or not _identifier(self.writer_id)
            or type(self.writer_generation) is not int
            or self.writer_generation <= 0
            or not _identifier(self.turn_id)
            or not _identifier(self.transcript_revision)
            or type(self.sequence) is not int
            or self.sequence < 0
            or self.speaker not in ("candidate", "interviewer")
            or self.finality not in ("speculative", "finalized")
            or self.speaker == "interviewer"
            and self.finality != "finalized"
            or not _bounded_text(self.text, limits.max_turn_bytes, allow_empty=True)
            or not _canonical_timestamp(self.observed_at)
        ):
            raise DirectorError("invalid_observation")


@dataclass(frozen=True)
class DirectorContextTurn:
    turn_id: str
    transcript_revision: str
    sequence: int
    speaker: DirectorSpeaker
    finality: DirectorFinality
    text: str

    def to_wire(self) -> dict[str, object]:
        return {
            "turn_id": self.turn_id,
            "transcript_revision": self.transcript_revision,
            "sequence": self.sequence,
            "speaker": self.speaker,
            "finality": self.finality,
            "text": self.text,
        }


@dataclass(frozen=True)
class DirectorContext:
    contract_version: str
    policy_version: str
    model_adapter_version: str
    affinity_key: str
    session_id: str
    brief_id: str
    writer_id: str
    writer_generation: int
    state_revision: int
    lifecycle_version: int
    active_question_id: str
    round_objective_id: str
    current_topic: str
    allowed_moves: tuple[str, ...]
    source_turn_id: str
    source_transcript_revision: str
    source_finality: DirectorFinality
    turns: tuple[DirectorContextTurn, ...]

    def to_wire(self) -> dict[str, object]:
        return {
            "contract_version": self.contract_version,
            "policy_version": self.policy_version,
            "model_adapter_version": self.model_adapter_version,
            "affinity_key": self.affinity_key,
            "session_id": self.session_id,
            "brief_id": self.brief_id,
            "writer_id": self.writer_id,
            "writer_generation": self.writer_generation,
            "state_revision": self.state_revision,
            "lifecycle_version": self.lifecycle_version,
            "active_question_id": self.active_question_id,
            "round_objective_id": self.round_objective_id,
            "current_topic": self.current_topic,
            "allowed_moves": list(self.allowed_moves),
            "source_turn_id": self.source_turn_id,
            "source_transcript_revision": self.source_transcript_revision,
            "source_finality": self.source_finality,
            "turns": [turn.to_wire() for turn in self.turns],
        }


@dataclass(frozen=True)
class DirectorAdapterResult:
    move_type: str
    topic: str
    probe_candidate_id: str | None
    reason_code: str
    output_bytes: int
    reasoning_units: int
    estimated_cost_microusd: int

    def validate(self, limits: DirectorLimits) -> None:
        if (
            self.move_type not in INTERVIEWER_MOVE_TYPES
            or not _bounded_text(self.topic, 240)
            or self.probe_candidate_id is not None
            and not _identifier(self.probe_candidate_id)
            or self.reason_code not in INTERVIEWER_MOVE_REASON_CODES
            or not _move_reason_allowed(self.move_type, self.reason_code)
            or type(self.output_bytes) is not int
            or not 0 <= self.output_bytes <= limits.max_output_bytes
            or type(self.reasoning_units) is not int
            or not 0 <= self.reasoning_units <= limits.max_reasoning_units
            or type(self.estimated_cost_microusd) is not int
            or not 0
            <= self.estimated_cost_microusd
            <= limits.max_estimated_cost_microusd
        ):
            raise DirectorError("invalid_adapter_result")


class DirectorAdapter(Protocol):
    version: str

    async def prewarm(self, *, affinity_key: str, limits: DirectorLimits) -> None: ...

    async def recommend(
        self,
        context: DirectorContext,
        *,
        limits: DirectorLimits,
    ) -> DirectorAdapterResult: ...

    async def recover(
        self,
        *,
        affinity_key: str,
        writer_generation: int,
        limits: DirectorLimits,
    ) -> None: ...

    async def close(self, *, affinity_key: str) -> None: ...


class DeterministicFakeDirectorAdapter:
    """Synthetic-only adapter with no provider, credential, or network access."""

    version = DIRECTOR_FAKE_ADAPTER_VERSION

    def __init__(
        self,
        script: Mapping[str, DirectorAdapterResult | BaseException] | None = None,
        *,
        delays_ms: Mapping[str, int] | None = None,
        gates: Mapping[str, asyncio.Event] | None = None,
        started_events: Mapping[str, asyncio.Event] | None = None,
    ) -> None:
        self._script = dict(script or {})
        self._delays_ms = dict(delays_ms or {})
        self._gates = dict(gates or {})
        self._started_events = dict(started_events or {})
        self.prewarm_calls = 0
        self.recovery_calls = 0
        self.closed = False

    async def prewarm(self, *, affinity_key: str, limits: DirectorLimits) -> None:
        _require_affinity(affinity_key)
        self.prewarm_calls += 1

    async def recommend(
        self,
        context: DirectorContext,
        *,
        limits: DirectorLimits,
    ) -> DirectorAdapterResult:
        if self.closed:
            raise RuntimeError("fake adapter closed")
        started_event = self._started_events.get(context.source_turn_id)
        if started_event is not None:
            started_event.set()
        gate = self._gates.get(context.source_turn_id)
        if gate is not None:
            await gate.wait()
        delay_ms = self._delays_ms.get(context.source_turn_id, 0)
        if type(delay_ms) is not int or delay_ms < 0:
            raise DirectorError("invalid_config")
        if delay_ms:
            await asyncio.sleep(delay_ms / 1_000)
        scripted = self._script.get(context.source_turn_id)
        if isinstance(scripted, BaseException):
            raise scripted
        if scripted is not None:
            return scripted
        move_type = context.allowed_moves[0] if context.allowed_moves else "close"
        reason_code = _default_reason(move_type)
        topic = context.current_topic
        return DirectorAdapterResult(
            move_type=move_type,
            topic=topic,
            probe_candidate_id=None,
            reason_code=reason_code,
            output_bytes=len(f"{move_type}:{topic}".encode("utf-8")),
            reasoning_units=1,
            estimated_cost_microusd=0,
        )

    async def recover(
        self,
        *,
        affinity_key: str,
        writer_generation: int,
        limits: DirectorLimits,
    ) -> None:
        _require_affinity(affinity_key)
        if type(writer_generation) is not int or writer_generation <= 0:
            raise DirectorError("stale_generation")
        self.recovery_calls += 1

    async def close(self, *, affinity_key: str) -> None:
        _require_affinity(affinity_key)
        self.closed = True


@dataclass(frozen=True)
class DeliveredInterviewerMove:
    session_id: str
    writer_id: str
    writer_generation: int
    move_id: str
    delivery_event_id: str
    source_turn_id: str
    source_transcript_revision: str
    move_type: str
    target_topic: str
    delivered_at: str

    def validate(self) -> None:
        if (
            not _identifier(self.session_id)
            or not _identifier(self.writer_id)
            or type(self.writer_generation) is not int
            or self.writer_generation <= 0
            or not _identifier(self.move_id)
            or not _identifier(self.delivery_event_id)
            or not _identifier(self.source_turn_id)
            or not _identifier(self.source_transcript_revision)
            or self.move_type not in INTERVIEWER_MOVE_TYPES
            or not _bounded_text(self.target_topic, 240)
            or not _canonical_timestamp(self.delivered_at)
        ):
            raise DirectorError("invalid_observation")


@dataclass(frozen=True)
class DirectorComparison:
    session_id: str
    source_turn_id: str
    source_transcript_revision: str
    recommendation_id: str | None
    delivered_move_id: str
    delivery_event_id: str
    recommended_move_type: str | None
    delivered_move_type: str
    outcome: str


@dataclass(frozen=True)
class StoreResult:
    outcome: str
    recommendation: dict[str, Any] | None = None
    comparison: DirectorComparison | None = None


class DirectorRecommendationStore:
    """Bounded memory-only store owned by exactly one session and writer."""

    def __init__(
        self,
        *,
        session_id: str,
        writer_id: str,
        writer_generation: int,
        capacity: int,
    ) -> None:
        if (
            not _identifier(session_id)
            or not _identifier(writer_id)
            or type(writer_generation) is not int
            or writer_generation <= 0
            or type(capacity) is not int
            or not 1 <= capacity <= _HARD_MAX_STORE_ENTRIES
        ):
            raise DirectorError("invalid_config")
        self.contract_version = DIRECTOR_STORE_CONTRACT_VERSION
        self.session_id = session_id
        self.writer_id = writer_id
        self.writer_generation = writer_generation
        self.capacity = capacity
        self._recommendations: dict[str, dict[str, Any]] = {}
        self._seen_recommendations: dict[str, str] = {}
        self._deliveries: dict[tuple[str, str], DeliveredInterviewerMove] = {}
        self._seen_delivery_ids: dict[str, str] = {}
        self._closed = False

    @property
    def entry_count(self) -> int:
        return len(self._seen_recommendations) + len(self._seen_delivery_ids)

    def publish(self, raw: object, *, now: str) -> StoreResult:
        self._require_open()
        if not _canonical_timestamp(now):
            raise DirectorError("invalid_recommendation")
        try:
            recommendation = parse_director_recommendation(raw)
        except Exception as error:
            raise DirectorError("invalid_recommendation") from error
        self._require_recommendation_identity(recommendation)
        if recommendation["source_finality"] != "finalized":
            return StoreResult("stale")
        signature = _canonical_digest(recommendation)
        recommendation_id = recommendation["recommendation_id"]
        seen = self._seen_recommendations.get(recommendation_id)
        if seen is not None:
            if seen != signature:
                raise DirectorError("replay_conflict")
            return StoreResult("duplicate")
        self._reserve_entry()
        self._seen_recommendations[recommendation_id] = signature
        now_ms = _timestamp_ms(now)
        if now_ms < _timestamp_ms(recommendation["created_at"]):
            return StoreResult("stale")
        if now_ms > _timestamp_ms(recommendation["expires_at"]):
            return StoreResult("stale")

        source_key = (
            recommendation["source_turn_id"],
            recommendation["source_transcript_revision"],
        )
        delivery = self._deliveries.get(source_key)
        if delivery is not None:
            return StoreResult(
                "after_delivery",
                recommendation=recommendation,
                comparison=_compare(recommendation, delivery, after_delivery=True),
            )

        previous = self._recommendations.get(recommendation["source_turn_id"])
        if previous is not None:
            previous_created = _timestamp_ms(previous["created_at"])
            if _timestamp_ms(recommendation["created_at"]) < previous_created:
                return StoreResult("stale")
        self._recommendations[recommendation["source_turn_id"]] = recommendation
        return StoreResult("ready", recommendation=recommendation)

    def latest_valid(
        self,
        *,
        session_id: str,
        source_turn_id: str,
        source_transcript_revision: str,
        now: str,
    ) -> dict[str, Any] | None:
        self._require_open()
        if session_id != self.session_id:
            raise DirectorError("session_mismatch")
        recommendation = self._recommendations.get(source_turn_id)
        if recommendation is None:
            return None
        if recommendation["source_transcript_revision"] != source_transcript_revision:
            return None
        now_ms = _timestamp_ms(now)
        if not _canonical_timestamp(now) or now_ms > _timestamp_ms(
            recommendation["expires_at"]
        ):
            return None
        return dict(recommendation)

    def record_delivery(self, delivery: DeliveredInterviewerMove, *, now: str) -> StoreResult:
        self._require_open()
        delivery.validate()
        if (
            not _canonical_timestamp(now)
            or _timestamp_ms(now) < _timestamp_ms(delivery.delivered_at)
        ):
            raise DirectorError("invalid_observation")
        if delivery.session_id != self.session_id:
            raise DirectorError("session_mismatch")
        if (
            delivery.writer_id != self.writer_id
            or delivery.writer_generation != self.writer_generation
        ):
            raise DirectorError("writer_mismatch")
        signature = _canonical_digest(delivery.__dict__)
        seen = self._seen_delivery_ids.get(delivery.delivery_event_id)
        if seen is not None:
            if seen != signature:
                raise DirectorError("replay_conflict")
            return StoreResult("duplicate")
        self._reserve_entry()
        self._seen_delivery_ids[delivery.delivery_event_id] = signature
        source_key = (delivery.source_turn_id, delivery.source_transcript_revision)
        self._deliveries[source_key] = delivery
        recommendation = self._recommendations.get(delivery.source_turn_id)
        if (
            recommendation is None
            or recommendation["source_transcript_revision"]
            != delivery.source_transcript_revision
        ):
            return StoreResult(
                "ready",
                comparison=_missing_comparison(delivery, "recommendation_missing"),
            )
        if _timestamp_ms(now) > _timestamp_ms(recommendation["expires_at"]):
            return StoreResult(
                "stale",
                comparison=_missing_comparison(delivery, "recommendation_expired"),
            )
        return StoreResult(
            "ready",
            recommendation=recommendation,
            comparison=_compare(recommendation, delivery, after_delivery=False),
        )

    def has_delivery(
        self,
        *,
        source_turn_id: str,
        source_transcript_revision: str,
    ) -> bool:
        self._require_open()
        return (source_turn_id, source_transcript_revision) in self._deliveries

    def rollover(self, *, writer_id: str, writer_generation: int) -> None:
        self._require_open()
        if (
            not _identifier(writer_id)
            or type(writer_generation) is not int
            or writer_generation <= self.writer_generation
        ):
            raise DirectorError("stale_generation")
        self.writer_id = writer_id
        self.writer_generation = writer_generation
        self._recommendations.clear()
        self._seen_recommendations.clear()
        self._deliveries.clear()
        self._seen_delivery_ids.clear()

    def close(self) -> None:
        self._closed = True
        self._recommendations.clear()
        self._seen_recommendations.clear()
        self._deliveries.clear()
        self._seen_delivery_ids.clear()

    def _require_recommendation_identity(self, recommendation: Mapping[str, Any]) -> None:
        if recommendation["session_id"] != self.session_id:
            raise DirectorError("session_mismatch")
        if (
            recommendation["writer_id"] != self.writer_id
            or recommendation["writer_generation"] != self.writer_generation
        ):
            raise DirectorError("writer_mismatch")

    def _reserve_entry(self) -> None:
        if self.entry_count >= self.capacity:
            raise DirectorError("capacity")

    def _require_open(self) -> None:
        if self._closed:
            raise DirectorError("closed")


@dataclass(frozen=True)
class DirectorShadowTraceEvent:
    contract_version: str
    event_kind: DirectorTraceKind
    policy_version: str
    model_adapter_version: str
    recommendation_contract_version: str
    outcome: str
    freshness: str
    comparison: str | None
    recommended_move_type: str | None
    delivered_move_type: str | None
    ready_latency_ms: float | None
    recommendation_age_ms: float | None
    estimated_cost_microusd: int | None
    emitted_at: str

    def to_wire(self) -> dict[str, object]:
        return dict(self.__dict__)


def is_director_shadow_trace_event(value: object) -> bool:
    if not isinstance(value, dict) or set(value) != {
        "contract_version",
        "event_kind",
        "policy_version",
        "model_adapter_version",
        "recommendation_contract_version",
        "outcome",
        "freshness",
        "comparison",
        "recommended_move_type",
        "delivered_move_type",
        "ready_latency_ms",
        "recommendation_age_ms",
        "estimated_cost_microusd",
        "emitted_at",
    }:
        return False
    return bool(
        value["contract_version"] == DIRECTOR_TRACE_CONTRACT_VERSION
        and value["event_kind"] in ("outcome", "comparison")
        and value["policy_version"] == DIRECTOR_POLICY_CONTRACT_VERSION
        and _version(value["model_adapter_version"])
        and value["recommendation_contract_version"]
        == DIRECTOR_RECOMMENDATION_CONTRACT_VERSION
        and value["outcome"] in DIRECTOR_OUTCOMES
        and value["freshness"] in DIRECTOR_FRESHNESS
        and (value["comparison"] is None or value["comparison"] in DIRECTOR_COMPARISONS)
        and (
            value["recommended_move_type"] is None
            or value["recommended_move_type"] in INTERVIEWER_MOVE_TYPES
        )
        and (
            value["delivered_move_type"] is None
            or value["delivered_move_type"] in INTERVIEWER_MOVE_TYPES
        )
        and _nullable_measurement(value["ready_latency_ms"])
        and _nullable_measurement(value["recommendation_age_ms"])
        and (
            value["estimated_cost_microusd"] is None
            or type(value["estimated_cost_microusd"]) is int
            and 0
            <= value["estimated_cost_microusd"]
            <= _HARD_MAX_ESTIMATED_COST_MICROUSD
        )
        and _canonical_timestamp(value["emitted_at"])
    )


class DirectorTraceSink(Protocol):
    def emit(self, event: DirectorShadowTraceEvent) -> bool: ...


class NullDirectorTraceSink:
    def emit(self, event: DirectorShadowTraceEvent) -> bool:
        return False


class MemoryDirectorTraceSink:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    def emit(self, event: DirectorShadowTraceEvent) -> bool:
        value = event.to_wire()
        if not is_director_shadow_trace_event(value):
            return False
        self.events.append(value)
        return True


class Sav469DirectorTraceSink:
    """Project safe outcome/readiness fields into interviewer-observability.v1."""

    def __init__(self, recorder: Callable[..., bool]) -> None:
        self._recorder = recorder

    def emit(self, event: DirectorShadowTraceEvent) -> bool:
        value = event.to_wire()
        if not is_director_shadow_trace_event(value):
            return False
        if event.event_kind == "comparison":
            return bool(
                self._recorder(
                    "director",
                    recommendation_contract_version=(
                        DIRECTOR_RECOMMENDATION_CONTRACT_VERSION
                    ),
                    director_policy_version=event.policy_version,
                    director_adapter_version=event.model_adapter_version,
                    recommendation_outcome=(
                        "stale"
                        if event.comparison == "recommendation_expired"
                        else "ready"
                    ),
                    recommendation_freshness=event.freshness,
                    recommendation_comparison=event.comparison,
                    ready_latency_ms=None,
                    recommendation_age_ms=None,
                    estimated_cost_microusd=None,
                )
            )
        outcome = {
            "ready": "ready",
            "after_delivery": "ready",
            "stale": "stale",
            "malformed": "malformed",
            "timeout": "timeout",
            "failed": "unavailable",
            "capacity": "unavailable",
            "cancelled": "unavailable",
        }.get(event.outcome)
        if outcome is None:
            return False
        freshness = event.freshness
        return bool(
            self._recorder(
                "director",
                recommendation_contract_version=(
                    DIRECTOR_RECOMMENDATION_CONTRACT_VERSION
                ),
                director_policy_version=event.policy_version,
                director_adapter_version=event.model_adapter_version,
                recommendation_outcome=outcome,
                recommendation_freshness=freshness,
                recommendation_comparison=None,
                ready_latency_ms=event.ready_latency_ms,
                recommendation_age_ms=event.recommendation_age_ms,
                estimated_cost_microusd=event.estimated_cost_microusd,
            )
        )


class MultiplexDirectorTraceSink:
    def __init__(self, sinks: Sequence[DirectorTraceSink]) -> None:
        self._sinks = tuple(sinks)

    def emit(self, event: DirectorShadowTraceEvent) -> bool:
        emitted = False
        for sink in self._sinks:
            try:
                emitted = sink.emit(event) or emitted
            except Exception:
                continue
        return emitted


@dataclass
class _SpeculativeWork:
    digest: str
    observation: DirectorTurnObservation | None
    task: asyncio.Task[None] | None = None
    final_observation: DirectorTurnObservation | None = None
    final_state: Mapping[str, object] | None = None
    finalized_available_at: float | None = None
    completed_result: DirectorAdapterResult | None = None


class InterviewDirectorShadowSession:
    """One-way session observer; it exposes no controller or prompt mutation API."""

    def __init__(
        self,
        *,
        config: DirectorShadowConfig,
        session_id: str,
        adapter: DirectorAdapter | None,
        state_provider: Callable[[], Mapping[str, object] | None],
        delivery_topic_provider: Callable[[str], str | None] | None = None,
        trace_sink: DirectorTraceSink | None = None,
        clock: Callable[[], float] = time.time,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self.contract_version = DIRECTOR_RUNNER_CONTRACT_VERSION
        self.config = config
        self.session_id = session_id
        self._adapter = adapter
        self._state_provider = state_provider
        self._delivery_topic_provider = delivery_topic_provider
        self._trace = trace_sink or NullDirectorTraceSink()
        self._clock = clock
        self._monotonic = monotonic
        self._tasks: set[asyncio.Task[None]] = set()
        self._history: deque[DirectorTurnObservation] = deque(
            maxlen=config.limits.max_context_turns * 2
        )
        self._seen_observations: dict[tuple[str, str], str] = {}
        self._speculative: dict[str, _SpeculativeWork] = {}
        self._semaphore = asyncio.Semaphore(config.limits.max_concurrency)
        self._closed = False
        self._prewarmed = False
        self._affinity_key = _affinity_key(session_id)
        self._store: DirectorRecommendationStore | None = None
        self.enabled = False
        self.failure_reason: str | None = None

        if not config.enabled:
            self.failure_reason = "flag_disabled"
            return
        if adapter is None or adapter.version != config.adapter_version:
            self.failure_reason = "adapter_unavailable"
            return
        state = self._read_state()
        if state is None:
            self.failure_reason = "authority_unavailable"
            return
        if not _shadow_move_vocabulary(state):
            self.failure_reason = "authority_closed"
            return
        self._store = DirectorRecommendationStore(
            session_id=session_id,
            writer_id=str(state["active_writer"]["writer_id"]),
            writer_generation=int(state["active_writer"]["writer_generation"]),
            capacity=config.limits.max_store_entries,
        )
        self.enabled = True

    @property
    def pending_task_count(self) -> int:
        return sum(
            not task.done() and task.cancelling() == 0 for task in self._tasks
        )

    @property
    def store(self) -> DirectorRecommendationStore | None:
        return self._store

    def start(self) -> str:
        if not self.enabled or self._adapter is None:
            return "disabled"
        if self._prewarmed:
            return "duplicate"

        async def prewarm() -> None:
            assert self._adapter is not None
            try:
                await asyncio.wait_for(
                    self._adapter.prewarm(
                        affinity_key=self._affinity_key,
                        limits=self.config.limits,
                    ),
                    timeout=self.config.limits.deadline_ms / 1_000,
                )
                self._prewarmed = True
                self._emit_outcome("prewarmed", freshness="missing")
            except asyncio.CancelledError:
                self._emit_outcome("cancelled", freshness="missing")
                raise
            except Exception:
                self._emit_outcome("failed", freshness="missing")

        return self._schedule(prewarm())

    async def wait_idle(self, timeout_seconds: float = 0.5) -> bool:
        """Bounded synchronization seam for shutdown and deterministic tests."""
        if (
            not isinstance(timeout_seconds, (int, float))
            or isinstance(timeout_seconds, bool)
            or not math.isfinite(timeout_seconds)
            or timeout_seconds <= 0
            or timeout_seconds > 5
        ):
            raise DirectorError("invalid_config")
        loop = asyncio.get_running_loop()
        deadline = loop.time() + float(timeout_seconds)
        while True:
            pending = tuple(task for task in self._tasks if not task.done())
            if not pending:
                return True
            remaining = deadline - loop.time()
            if remaining <= 0:
                return False
            await asyncio.wait(
                pending,
                timeout=remaining,
                return_when=asyncio.ALL_COMPLETED,
            )

    def observe_interim(
        self,
        *,
        turn_id: str,
        transcript_revision: str,
        sequence: int,
        text: str,
        observed_at: str,
    ) -> str:
        state = self._read_state()
        if not self.enabled or state is None:
            return "disabled"
        observation = DirectorTurnObservation(
            session_id=self.session_id,
            writer_id=str(state["active_writer"]["writer_id"]),
            writer_generation=int(state["active_writer"]["writer_generation"]),
            turn_id=turn_id,
            transcript_revision=transcript_revision,
            sequence=sequence,
            speaker="candidate",
            finality="speculative",
            text=text,
            observed_at=observed_at,
        )
        return self._observe_candidate(observation, state)

    def observe_persisted_transcript(
        self,
        transcript_event: Mapping[str, object],
        *,
        source_turn_id: str | None,
    ) -> str:
        finalized_available_at = self._monotonic()
        state = self._read_state()
        if not self.enabled or state is None:
            return "disabled"
        try:
            event_id = transcript_event.get("event_id")
            sequence = transcript_event.get("sequence")
            text = transcript_event.get("text")
            ended_at = transcript_event.get("ended_at")
            writer_generation = transcript_event.get("writer_generation")
            if (
                transcript_event.get("contract_version") != 2
                or transcript_event.get("is_final") is not True
                or transcript_event.get("delivery_state")
                not in ("delivered", "partially_delivered")
                or transcript_event.get("session_id") != self.session_id
                or transcript_event.get("writer_id")
                != state["active_writer"]["writer_id"]
                or transcript_event.get("writer_generation")
                != state["active_writer"]["writer_generation"]
                or not _identifier(source_turn_id)
                or not _identifier(event_id)
                or type(sequence) is not int
                or not isinstance(text, str)
                or not isinstance(ended_at, str)
                or type(writer_generation) is not int
            ):
                raise DirectorError("invalid_observation")
            speaker = transcript_event.get("speaker")
            observation = DirectorTurnObservation(
                session_id=self.session_id,
                writer_id=str(transcript_event["writer_id"]),
                writer_generation=writer_generation,
                turn_id=source_turn_id,
                transcript_revision=event_id,
                sequence=sequence,
                speaker="candidate" if speaker == "user" else "interviewer",
                finality="finalized",
                text=text,
                observed_at=ended_at,
            )
            observation.validate(self.config.limits)
            if speaker == "user":
                return self._observe_candidate(
                    observation,
                    state,
                    finalized_available_at=finalized_available_at,
                )
            if speaker == "interviewer":
                self._remember_final(observation)
                return self._observe_delivered_from_state(transcript_event, state)
            raise DirectorError("invalid_observation")
        except DirectorError:
            self._emit_outcome("malformed", freshness="missing")
            return "malformed"
        except Exception:
            self._emit_outcome("malformed", freshness="missing")
            return "malformed"

    def record_delivered_move(self, delivery: DeliveredInterviewerMove) -> str:
        if not self.enabled or self._store is None:
            return "disabled"
        try:
            result = self._store.record_delivery(
                delivery,
                now=_canonical_time(self._clock()),
            )
            if result.comparison is not None:
                self._emit_comparison(result.comparison)
            return result.outcome
        except DirectorError as error:
            outcome = "capacity" if error.code == "capacity" else "malformed"
            self._emit_outcome(outcome, freshness="missing")
            return outcome

    def rollover(self) -> str:
        if not self.enabled or self._store is None or self._adapter is None:
            return "disabled"
        state = self._read_state()
        if state is None:
            return "stale"
        writer = state["active_writer"]
        try:
            self._cancel_tasks()
            self._store.rollover(
                writer_id=str(writer["writer_id"]),
                writer_generation=int(writer["writer_generation"]),
            )
            self._history.clear()
            self._seen_observations.clear()
            self._speculative.clear()

            async def recover() -> None:
                assert self._adapter is not None
                try:
                    await asyncio.wait_for(
                        self._adapter.recover(
                            affinity_key=self._affinity_key,
                            writer_generation=int(writer["writer_generation"]),
                            limits=self.config.limits,
                        ),
                        timeout=self.config.limits.deadline_ms / 1_000,
                    )
                    self._emit_outcome("recovered", freshness="missing")
                except asyncio.CancelledError:
                    raise
                except Exception:
                    self._emit_outcome("failed", freshness="missing")

            return self._schedule(recover())
        except DirectorError:
            return "stale"

    def settle(self) -> None:
        if self._closed:
            return
        self._closed = True
        self.enabled = False
        self._cancel_tasks()
        self._history.clear()
        self._seen_observations.clear()
        self._speculative.clear()
        if self._store is not None:
            self._store.close()
        self._emit_outcome("settled", freshness="missing")

    async def shutdown(self) -> None:
        adapter = self._adapter
        self.settle()
        pending = tuple(self._tasks)
        if pending:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*pending, return_exceptions=True),
                    timeout=0.05,
                )
            except asyncio.TimeoutError:
                pass
        self._tasks.clear()
        if adapter is not None:
            try:
                await asyncio.wait_for(
                    adapter.close(affinity_key=self._affinity_key),
                    timeout=0.05,
                )
            except Exception:
                pass

    def _observe_candidate(
        self,
        observation: DirectorTurnObservation,
        state: Mapping[str, object],
        *,
        finalized_available_at: float | None = None,
    ) -> str:
        if self._closed:
            return "settled"
        try:
            observation.validate(self.config.limits)
            self._require_observation_identity(observation, state)
            if not _shadow_move_vocabulary(state):
                raise DirectorError("deadline_elapsed")
            digest = _text_digest(observation.text)
            key = (observation.turn_id, observation.transcript_revision)
            seen = self._seen_observations.get(key)
            if seen is not None:
                if seen != digest:
                    raise DirectorError("replay_conflict")
                self._emit_outcome("duplicate", freshness=observation.finality)
                return "duplicate"
            if len(self._seen_observations) >= self.config.limits.max_store_entries:
                raise DirectorError("capacity")
            self._seen_observations[key] = digest

            if observation.finality == "speculative":
                previous = self._speculative.get(observation.turn_id)
                if previous is not None:
                    if previous.digest == digest:
                        return "duplicate"
                    if previous.task is not None:
                        previous.task.cancel()
                    self._speculative.pop(observation.turn_id, None)
                    self._emit_outcome("discarded_revision", freshness="speculative")
                work = _SpeculativeWork(digest=digest, observation=observation)
                self._speculative[observation.turn_id] = work
                task_result = self._schedule(
                    self._run_observation(observation, dict(state), work=work),
                    work=work,
                )
                return task_result

            finalized_available_at = (
                finalized_available_at
                if finalized_available_at is not None
                else self._monotonic()
            )
            self._remember_final(observation)
            speculative = self._speculative.get(observation.turn_id)
            if speculative is not None:
                if speculative.digest == digest:
                    speculative.final_observation = observation
                    speculative.final_state = dict(state)
                    speculative.finalized_available_at = finalized_available_at
                    speculative.observation = None
                    if speculative.completed_result is not None:
                        self._publish_adapter_result(
                            observation,
                            state,
                            speculative.completed_result,
                            finalized_available_at,
                        )
                        self._speculative.pop(observation.turn_id, None)
                    self._emit_outcome("reconciled", freshness="fresh")
                    return "reconciled"
                if speculative.task is not None:
                    speculative.task.cancel()
                self._speculative.pop(observation.turn_id, None)
                self._emit_outcome("discarded_revision", freshness="speculative")
            return self._schedule(
                self._run_observation(
                    observation,
                    dict(state),
                    finalized_available_at=finalized_available_at,
                )
            )
        except DirectorError as error:
            outcome = (
                "capacity"
                if error.code == "capacity"
                else "stale"
                if error.code in ("deadline_elapsed", "stale_generation", "stale_result")
                else "malformed"
            )
            self._emit_outcome(outcome, freshness="stale")
            return outcome

    async def _run_observation(
        self,
        observation: DirectorTurnObservation,
        state: Mapping[str, object],
        *,
        work: _SpeculativeWork | None = None,
        finalized_available_at: float | None = None,
    ) -> None:
        try:
            async with self._semaphore:
                context = self._build_context(observation, state)
                result = await self._execute(context)
                if work is not None:
                    work.observation = None
                    if work.final_observation is None:
                        work.completed_result = result
                        self._emit_outcome(
                            "speculative_ready",
                            freshness="speculative",
                            estimated_cost_microusd=result.estimated_cost_microusd,
                        )
                        return
                    final_observation = work.final_observation
                    final_state = work.final_state
                    final_available = work.finalized_available_at
                    self._speculative.pop(observation.turn_id, None)
                    if final_state is None or final_available is None:
                        raise DirectorError("stale_result")
                    self._publish_adapter_result(
                        final_observation,
                        final_state,
                        result,
                        final_available,
                    )
                    return
                if finalized_available_at is None:
                    raise DirectorError("stale_result")
                self._publish_adapter_result(
                    observation,
                    state,
                    result,
                    finalized_available_at,
                )
        except asyncio.TimeoutError:
            self._emit_outcome("timeout", freshness="stale")
        except asyncio.CancelledError:
            self._emit_outcome("cancelled", freshness="stale")
            raise
        except DirectorError:
            self._emit_outcome("malformed", freshness="stale")
        except Exception:
            self._emit_outcome("failed", freshness="stale")
        finally:
            if (
                work is not None
                and work.completed_result is None
            ):
                work.observation = None
                work.final_observation = None
                work.final_state = None
                work.finalized_available_at = None
                if self._speculative.get(observation.turn_id) is work:
                    self._speculative.pop(observation.turn_id, None)

    async def _execute(self, context: DirectorContext) -> DirectorAdapterResult:
        adapter = self._adapter
        if adapter is None:
            raise DirectorError("invalid_config")
        deadline_seconds = self._adapter_deadline_seconds(context)
        started = self._monotonic()
        hard_deadline = started + deadline_seconds
        last_error: BaseException | None = None
        for attempt in range(self.config.limits.max_retries + 1):
            try:
                result = await asyncio.wait_for(
                    adapter.recommend(context, limits=self.config.limits),
                    timeout=self._remaining_runner_time(hard_deadline),
                )
                result.validate(self.config.limits)
                return result
            except asyncio.CancelledError:
                raise
            except asyncio.TimeoutError:
                raise
            except Exception as error:
                last_error = error
                if attempt >= self.config.limits.max_retries:
                    break
                await asyncio.wait_for(
                    adapter.recover(
                        affinity_key=self._affinity_key,
                        writer_generation=context.writer_generation,
                        limits=self.config.limits,
                    ),
                    timeout=self._remaining_runner_time(hard_deadline),
                )
        raise DirectorError("invalid_adapter_result") from last_error

    def _remaining_runner_time(self, hard_deadline: float) -> float:
        remaining = hard_deadline - self._monotonic()
        if remaining <= 0:
            raise asyncio.TimeoutError
        return remaining

    def _publish_adapter_result(
        self,
        observation: DirectorTurnObservation,
        source_state: Mapping[str, object],
        result: DirectorAdapterResult,
        finalized_available_at: float,
    ) -> None:
        if self._closed or self._store is None:
            return
        recommendation = self._materialize_recommendation(
            observation,
            source_state,
            result,
        )
        current_state = self._read_state()
        delivery_already_exists = self._store.has_delivery(
            source_turn_id=observation.turn_id,
            source_transcript_revision=observation.transcript_revision,
        )
        if not delivery_already_exists and not _same_source_authority(
            source_state,
            current_state,
            observation,
        ):
            self._emit_outcome(
                "stale",
                freshness="stale",
                ready_latency_ms=self._ready_latency_ms(finalized_available_at),
                estimated_cost_microusd=result.estimated_cost_microusd,
            )
            return
        try:
            store_result = self._store.publish(
                recommendation,
                now=_canonical_time(self._clock()),
            )
        except DirectorError as error:
            outcome = "capacity" if error.code == "capacity" else "malformed"
            self._emit_outcome(outcome, freshness="stale")
            return
        outcome = (
            "after_delivery"
            if store_result.outcome == "after_delivery"
            else store_result.outcome
        )
        ready_latency_ms = self._ready_latency_ms(finalized_available_at)
        self._emit_outcome(
            outcome if outcome in DIRECTOR_OUTCOMES else "stale",
            freshness="fresh" if store_result.outcome in ("ready", "after_delivery") else "stale",
            ready_latency_ms=ready_latency_ms,
            recommendation_age_ms=max(
                0.0,
                _timestamp_ms(_canonical_time(self._clock()))
                - _timestamp_ms(recommendation["created_at"]),
            ),
            estimated_cost_microusd=result.estimated_cost_microusd,
        )
        if store_result.comparison is not None:
            self._emit_comparison(store_result.comparison)

    def _ready_latency_ms(self, finalized_available_at: float) -> float:
        return max(0.0, (self._monotonic() - finalized_available_at) * 1_000)

    def _materialize_recommendation(
        self,
        observation: DirectorTurnObservation,
        state: Mapping[str, object],
        result: DirectorAdapterResult,
    ) -> dict[str, Any]:
        result.validate(self.config.limits)
        if result.move_type not in _shadow_move_vocabulary(state):
            raise DirectorError("stale_result")
        created_at = _canonical_time(self._clock())
        deadline_at = str(state["clock"]["deadline_at"])
        created = _parse_timestamp(created_at)
        deadline = _parse_timestamp(deadline_at)
        expires = min(
            created + timedelta(milliseconds=self.config.limits.recommendation_ttl_ms),
            deadline,
        )
        if expires <= created:
            raise DirectorError("deadline_elapsed")
        expires_at = _canonical_datetime(expires)
        target = {
            "question_id": state["active_question_id"],
            "topic": result.topic,
            "source_turn_id": observation.turn_id,
            "probe_candidate_id": result.probe_candidate_id,
        }
        identity_payload = {
            "contract_version": DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
            "policy_version": self.config.policy_version,
            "model_adapter_version": self.config.adapter_version,
            "session_id": self.session_id,
            "brief_id": state["brief_id"],
            "writer_id": observation.writer_id,
            "writer_generation": observation.writer_generation,
            "based_on_state_revision": state["state_revision"],
            "based_on_lifecycle_version": state["lifecycle_snapshot"]["version"],
            "source_turn_id": observation.turn_id,
            "source_transcript_revision": observation.transcript_revision,
            "source_finality": "finalized",
            "move_type": result.move_type,
            "target": target,
            "reason_code": result.reason_code,
            "created_at": created_at,
            "expires_at": expires_at,
        }
        recommendation = {
            **identity_payload,
            "recommendation_id": f"recommendation:{_canonical_digest(identity_payload)}",
        }
        try:
            parsed = parse_director_recommendation(recommendation)
        except Exception as error:
            raise DirectorError("invalid_recommendation") from error
        if len(_canonical_json(parsed).encode("utf-8")) > self.config.limits.max_output_bytes:
            raise DirectorError("invalid_adapter_result")
        return parsed

    def _build_context(
        self,
        observation: DirectorTurnObservation,
        state: Mapping[str, object],
    ) -> DirectorContext:
        turns = [
            DirectorContextTurn(
                turn_id=turn.turn_id,
                transcript_revision=turn.transcript_revision,
                sequence=turn.sequence,
                speaker=turn.speaker,
                finality=turn.finality,
                text=_truncate_utf8(turn.text, self.config.limits.max_turn_bytes),
            )
            for turn in self._history
        ]
        if not any(
            turn.turn_id == observation.turn_id
            and turn.transcript_revision == observation.transcript_revision
            for turn in turns
        ):
            turns.append(
                DirectorContextTurn(
                    turn_id=observation.turn_id,
                    transcript_revision=observation.transcript_revision,
                    sequence=observation.sequence,
                    speaker=observation.speaker,
                    finality=observation.finality,
                    text=_truncate_utf8(
                        observation.text,
                        self.config.limits.max_turn_bytes,
                    ),
                )
            )
        turns = turns[-self.config.limits.max_context_turns :]
        context = self._context_from_turns(state, observation, turns)
        while (
            len(_canonical_json(context.to_wire()).encode("utf-8"))
            > self.config.limits.max_context_bytes
        ):
            if len(turns) <= 1:
                raise DirectorError("invalid_context")
            turns.pop(0)
            context = self._context_from_turns(state, observation, turns)
        return context

    def _context_from_turns(
        self,
        state: Mapping[str, object],
        observation: DirectorTurnObservation,
        turns: Sequence[DirectorContextTurn],
    ) -> DirectorContext:
        context = DirectorContext(
            contract_version=DIRECTOR_CONTEXT_CONTRACT_VERSION,
            policy_version=self.config.policy_version,
            model_adapter_version=self.config.adapter_version,
            affinity_key=self._affinity_key,
            session_id=self.session_id,
            brief_id=str(state["brief_id"]),
            writer_id=observation.writer_id,
            writer_generation=observation.writer_generation,
            state_revision=int(state["state_revision"]),
            lifecycle_version=int(state["lifecycle_snapshot"]["version"]),
            active_question_id=str(state["active_question_id"]),
            round_objective_id=str(state["round_objective_id"]),
            current_topic=str(state["current_topic"]),
            allowed_moves=_shadow_move_vocabulary(state),
            source_turn_id=observation.turn_id,
            source_transcript_revision=observation.transcript_revision,
            source_finality=observation.finality,
            turns=tuple(turns),
        )
        if (
            not _version(context.contract_version)
            or not _version(context.policy_version)
            or not _version(context.model_adapter_version)
            or not _identifier(context.session_id)
            or not _identifier(context.brief_id)
            or not _identifier(context.writer_id)
            or not _identifier(context.active_question_id)
            or not _bounded_text(context.current_topic, 240)
            or any(move not in INTERVIEWER_MOVE_TYPES for move in context.allowed_moves)
        ):
            raise DirectorError("invalid_context")
        return context

    def _adapter_deadline_seconds(self, context: DirectorContext) -> float:
        state = self._read_state()
        deadline = _parse_timestamp(
            str(state["clock"]["deadline_at"])
            if state is not None
            else _canonical_time(self._clock())
        )
        remaining = (deadline.timestamp() - self._clock())
        if remaining <= 0:
            raise DirectorError("deadline_elapsed")
        return min(self.config.limits.deadline_ms / 1_000, remaining)

    def _observe_delivered_from_state(
        self,
        transcript_event: Mapping[str, object],
        state: Mapping[str, object],
    ) -> str:
        event_id = transcript_event.get("event_id")
        for entry in state["probe_ledger"]:
            evidence = entry.get("delivery_evidence")
            if not isinstance(evidence, Mapping) or evidence.get("event_id") != event_id:
                continue
            source_ids = entry.get("target_turn_ids")
            if not isinstance(source_ids, list) or not source_ids:
                return "malformed"
            source_turn_id = source_ids[-1]
            revision = self._revision_for_source(source_turn_id)
            move_id = entry.get("move_id")
            target_topic = self._read_delivery_topic(move_id)
            if revision is None or not _identifier(move_id) or target_topic is None:
                return "stale"
            return self.record_delivered_move(
                DeliveredInterviewerMove(
                    session_id=self.session_id,
                    writer_id=str(evidence["writer_id"]),
                    writer_generation=int(evidence["writer_generation"]),
                    move_id=move_id,
                    delivery_event_id=str(event_id),
                    source_turn_id=str(source_turn_id),
                    source_transcript_revision=revision,
                    move_type=str(entry["move_type"]),
                    target_topic=target_topic,
                    delivered_at=str(transcript_event["ended_at"]),
                )
            )
        return "stale"

    def _read_delivery_topic(self, move_id: object) -> str | None:
        if not _identifier(move_id) or self._delivery_topic_provider is None:
            return None
        try:
            topic = self._delivery_topic_provider(move_id)
            return topic if _bounded_text(topic, 240) else None
        except Exception:
            return None

    def _revision_for_source(self, source_turn_id: object) -> str | None:
        if not isinstance(source_turn_id, str):
            return None
        for turn in reversed(self._history):
            if turn.speaker == "candidate" and turn.turn_id == source_turn_id:
                return turn.transcript_revision
        return None

    def _remember_final(self, observation: DirectorTurnObservation) -> None:
        if observation.finality != "finalized":
            return
        if any(
            turn.turn_id == observation.turn_id
            and turn.transcript_revision == observation.transcript_revision
            for turn in self._history
        ):
            return
        self._history.append(observation)

    def _read_state(self) -> Mapping[str, object] | None:
        try:
            state = self._state_provider()
            if state is None or not is_interview_runtime_state(state):
                return None
            if state["session_id"] != self.session_id:
                return None
            return state
        except Exception:
            return None

    def _require_observation_identity(
        self,
        observation: DirectorTurnObservation,
        state: Mapping[str, object],
    ) -> None:
        if observation.session_id != self.session_id:
            raise DirectorError("session_mismatch")
        writer = state["active_writer"]
        if (
            observation.writer_id != writer["writer_id"]
            or observation.writer_generation != writer["writer_generation"]
        ):
            raise DirectorError("writer_mismatch")
        if _timestamp_ms(observation.observed_at) >= _timestamp_ms(
            state["clock"]["deadline_at"]
        ):
            raise DirectorError("deadline_elapsed")

    def _schedule(
        self,
        coroutine: Any,
        *,
        work: _SpeculativeWork | None = None,
    ) -> str:
        if self._closed:
            coroutine.close()
            return "settled"
        if self.pending_task_count >= self.config.limits.max_pending_tasks:
            coroutine.close()
            self._emit_outcome("capacity", freshness="missing")
            return "capacity"
        try:
            task = asyncio.create_task(coroutine)
        except RuntimeError:
            coroutine.close()
            self._emit_outcome("failed", freshness="missing")
            return "failed"
        self._tasks.add(task)
        if work is not None:
            work.task = task
        task.add_done_callback(self._tasks.discard)
        return "scheduled"

    def _cancel_tasks(self) -> None:
        for task in tuple(self._tasks):
            if not task.done():
                task.cancel()

    def _emit_outcome(
        self,
        outcome: str,
        *,
        freshness: str,
        ready_latency_ms: float | None = None,
        recommendation_age_ms: float | None = None,
        estimated_cost_microusd: int | None = None,
    ) -> None:
        if outcome not in DIRECTOR_OUTCOMES:
            return
        self._trace.emit(
            DirectorShadowTraceEvent(
                contract_version=DIRECTOR_TRACE_CONTRACT_VERSION,
                event_kind="outcome",
                policy_version=self.config.policy_version,
                model_adapter_version=self.config.adapter_version,
                recommendation_contract_version=(
                    DIRECTOR_RECOMMENDATION_CONTRACT_VERSION
                ),
                outcome=outcome,
                freshness=freshness,
                comparison=None,
                recommended_move_type=None,
                delivered_move_type=None,
                ready_latency_ms=ready_latency_ms,
                recommendation_age_ms=recommendation_age_ms,
                estimated_cost_microusd=estimated_cost_microusd,
                emitted_at=_canonical_time(self._clock()),
            )
        )

    def _emit_comparison(self, comparison: DirectorComparison) -> None:
        self._trace.emit(
            DirectorShadowTraceEvent(
                contract_version=DIRECTOR_TRACE_CONTRACT_VERSION,
                event_kind="comparison",
                policy_version=self.config.policy_version,
                model_adapter_version=self.config.adapter_version,
                recommendation_contract_version=(
                    DIRECTOR_RECOMMENDATION_CONTRACT_VERSION
                ),
                outcome=(
                    "after_delivery"
                    if comparison.outcome == "arrived_after_delivery"
                    else "ready"
                ),
                freshness="missing" if comparison.recommendation_id is None else "fresh",
                comparison=comparison.outcome,
                recommended_move_type=comparison.recommended_move_type,
                delivered_move_type=comparison.delivered_move_type,
                ready_latency_ms=None,
                recommendation_age_ms=None,
                estimated_cost_microusd=None,
                emitted_at=_canonical_time(self._clock()),
            )
        )


def _compare(
    recommendation: Mapping[str, Any],
    delivery: DeliveredInterviewerMove,
    *,
    after_delivery: bool,
) -> DirectorComparison:
    if after_delivery:
        outcome = "arrived_after_delivery"
    elif recommendation["move_type"] != delivery.move_type:
        outcome = "move_mismatch"
    elif recommendation["target"]["topic"] != delivery.target_topic:
        outcome = "move_match_target_mismatch"
    else:
        outcome = "exact_match"
    return DirectorComparison(
        session_id=delivery.session_id,
        source_turn_id=delivery.source_turn_id,
        source_transcript_revision=delivery.source_transcript_revision,
        recommendation_id=str(recommendation["recommendation_id"]),
        delivered_move_id=delivery.move_id,
        delivery_event_id=delivery.delivery_event_id,
        recommended_move_type=str(recommendation["move_type"]),
        delivered_move_type=delivery.move_type,
        outcome=outcome,
    )


def _missing_comparison(
    delivery: DeliveredInterviewerMove,
    outcome: str,
) -> DirectorComparison:
    return DirectorComparison(
        session_id=delivery.session_id,
        source_turn_id=delivery.source_turn_id,
        source_transcript_revision=delivery.source_transcript_revision,
        recommendation_id=None,
        delivered_move_id=delivery.move_id,
        delivery_event_id=delivery.delivery_event_id,
        recommended_move_type=None,
        delivered_move_type=delivery.move_type,
        outcome=outcome,
    )


def _same_source_authority(
    source: Mapping[str, object],
    current: Mapping[str, object] | None,
    observation: DirectorTurnObservation,
) -> bool:
    if current is None:
        return False
    return bool(
        current["session_id"] == source["session_id"]
        and current["brief_id"] == source["brief_id"]
        and current["state_revision"] == source["state_revision"]
        and current["lifecycle_snapshot"] == source["lifecycle_snapshot"]
        and current["active_writer"] == source["active_writer"]
        and current["last_finalized_candidate_turn_id"] == observation.turn_id
        and current["last_finalized_candidate_transcript_revision"]
        == observation.transcript_revision
        and current["speech_fenced"] is False
    )


def _shadow_move_vocabulary(state: Mapping[str, object]) -> tuple[str, ...]:
    """Return the counterfactual vocabulary without granting live authority."""
    lifecycle = state.get("lifecycle_snapshot")
    lifecycle_state = lifecycle.get("state") if isinstance(lifecycle, Mapping) else None
    clock = state.get("clock")
    clock_band = clock.get("band") if isinstance(clock, Mapping) else None
    remaining_ms = clock.get("remaining_ms") if isinstance(clock, Mapping) else None
    if (
        state.get("speech_fenced") is True
        or clock_band == "elapsed"
        or remaining_ms == 0
        or lifecycle_state not in (
            "connecting",
            "active",
            "reconnecting",
        )
    ):
        return ()
    return tuple(INTERVIEWER_MOVE_TYPES)


def _move_reason_allowed(move_type: str, reason_code: str) -> bool:
    if reason_code == "controller_fallback":
        return True
    return {
        "probe": "deepen_reasoning",
        "clarify": "resolve_ambiguity",
        "challenge": "test_tradeoff",
        "transition": "advance_round",
        "close": "deadline_close",
    }.get(move_type) == reason_code or (
        move_type == "close" and reason_code == "candidate_requested_close"
    )


def _default_reason(move_type: str) -> str:
    return {
        "probe": "deepen_reasoning",
        "clarify": "resolve_ambiguity",
        "challenge": "test_tradeoff",
        "transition": "advance_round",
        "close": "deadline_close",
    }[move_type]


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _canonical_digest(value: object) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _text_digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _affinity_key(session_id: str) -> str:
    if not _identifier(session_id):
        raise DirectorError("invalid_config")
    return f"affinity:{hashlib.sha256(session_id.encode('utf-8')).hexdigest()}"


def _require_affinity(value: str) -> None:
    if re.fullmatch(r"affinity:[a-f0-9]{64}", value) is None:
        raise DirectorError("invalid_context")


def _identifier(value: object) -> bool:
    return isinstance(value, str) and _IDENTIFIER.fullmatch(value) is not None


def _version(value: object) -> bool:
    return isinstance(value, str) and _VERSION_TOKEN.fullmatch(value) is not None


def _bounded_text(value: object, maximum_bytes: int, *, allow_empty: bool = False) -> bool:
    if not isinstance(value, str) or value.strip() != value:
        return False
    if not allow_empty and not value:
        return False
    try:
        encoded = value.encode("utf-8")
    except UnicodeError:
        return False
    return len(encoded) <= maximum_bytes


def _truncate_utf8(value: str, maximum_bytes: int) -> str:
    encoded = value.encode("utf-8")
    if len(encoded) <= maximum_bytes:
        return value
    return encoded[:maximum_bytes].decode("utf-8", errors="ignore").rstrip()


def _canonical_time(value: float) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise DirectorError("invalid_context")
    return _canonical_datetime(datetime.fromtimestamp(value, timezone.utc))


def _canonical_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def _canonical_timestamp(value: object) -> bool:
    if not isinstance(value, str) or _CANONICAL_UTC.fullmatch(value) is None:
        return False
    try:
        return _canonical_datetime(_parse_timestamp(value)) == value
    except (TypeError, ValueError):
        return False


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _timestamp_ms(value: object) -> float:
    if not isinstance(value, str) or not _canonical_timestamp(value):
        return math.nan
    return _parse_timestamp(value).timestamp() * 1_000


def _nullable_measurement(value: object) -> bool:
    return value is None or (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and 0 <= value <= 86_400_000
    )
