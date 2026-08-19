"""Synchronous, fail-safe gate for already-ready Director advice."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from shared.interview_controller import ControllerState, list_probe_candidates
from shared.interview_director import DirectorError, DirectorRecommendationStore
from shared.interviewer_contract_assessment import assess_director_recommendation
from shared.interviewer_contracts import (
    DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
    parse_director_recommendation,
)


DIRECTOR_INFLUENCE_FEATURE_ENV = "MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED"
DIRECTOR_INFLUENCE_CONTRACT_VERSION = "interview-director-influence.v1"
DIRECTOR_INFLUENCE_POLICY_VERSION = "interview-director-influence-policy.v1"
DIRECTOR_INFLUENCE_CONFIG_VERSION = "interview-director-influence-config.v1"
MAX_CONSUMED_RECOMMENDATIONS_PER_AUTHORITY = 32
MAX_PENDING_INFLUENCED_MOVES = 8

InfluenceOutcome = Literal["accepted", "rejected", "ignored"]
InfluenceStage = Literal[
    "evaluated",
    "planned",
    "admitted",
    "canonically_delivered",
    "interrupted",
    "aborted",
]

INFLUENCE_DECISION_REASONS = frozenset(
    {
        "accepted",
        "flag_disabled",
        "director_unavailable",
        "recommendation_missing",
        "malformed",
        "repeated",
        "capacity",
        "session_mismatch",
        "brief_mismatch",
        "stale_state",
        "stale_lifecycle",
        "source_not_final",
        "source_turn_mismatch",
        "source_transcript_revision_mismatch",
        "question_mismatch",
        "not_yet_valid",
        "expired",
        "deadline_elapsed",
        "lifecycle_not_active",
        "speech_fenced",
        "move_not_allowed",
        "target_mismatch",
        "probe_ineligible",
        "already_delivered",
        "tool_kind_mismatch",
        "controller_denied",
    }
)


@dataclass(frozen=True)
class DirectorInfluenceDecision:
    outcome: InfluenceOutcome
    reason: str
    recommendation: dict[str, Any] | None

    @property
    def accepted(self) -> bool:
        return self.outcome == "accepted" and self.recommendation is not None


@dataclass(frozen=True)
class _PendingInfluence:
    recommendation_id: str
    model_adapter_version: str
    director_policy_version: str
    move_type: str
    created_at: str
    flag_state: str


class DirectorInfluenceGate:
    """Apply pure policy to a synchronous recommendation-provider snapshot."""

    def __init__(
        self,
        *,
        env: Mapping[str, str],
        session_id: str,
        recommendation_store: DirectorRecommendationStore | None,
        observability: object | None = None,
        max_consumed_per_authority: int = (
            MAX_CONSUMED_RECOMMENDATIONS_PER_AUTHORITY
        ),
    ) -> None:
        if (
            type(max_consumed_per_authority) is not int
            or not 1
            <= max_consumed_per_authority
            <= MAX_CONSUMED_RECOMMENDATIONS_PER_AUTHORITY
        ):
            raise ValueError("invalid Director influence capacity")
        self._env = env
        self._session_id = session_id
        self._store = recommendation_store
        self._observability = observability
        self._max_consumed = max_consumed_per_authority
        self._authority: tuple[str | None, str | None] | None = None
        self._consumed: dict[str, None] = {}
        self._pending: dict[str, _PendingInfluence] = {}

    @property
    def enabled(self) -> bool:
        """Read live policy; never cache revocation at session construction."""
        return self._env.get(DIRECTOR_INFLUENCE_FEATURE_ENV) == "true"

    @property
    def consumed_count(self) -> int:
        return len(self._consumed)

    @property
    def pending_count(self) -> int:
        return len(self._pending)

    def evaluate(
        self,
        *,
        state: ControllerState,
        tool_name: str,
        now: datetime,
    ) -> DirectorInfluenceDecision:
        """Inspect one already-ready value without waiting or starting work."""
        if not self.enabled:
            return self._decision("ignored", "flag_disabled", None, now=now)
        if tool_name not in (
            "commit_interviewer_move",
            "request_graceful_close",
        ):
            return self._decision(
                "ignored", "tool_kind_mismatch", None, now=now
            )
        store = self._store
        if store is None:
            return self._decision(
                "ignored", "director_unavailable", None, now=now
            )
        try:
            raw = store.peek_latest(session_id=self._session_id)
        except DirectorError:
            return self._decision(
                "ignored", "director_unavailable", None, now=now
            )
        if raw is None:
            return self._decision(
                "ignored", "recommendation_missing", None, now=now
            )
        try:
            recommendation = parse_director_recommendation(raw)
        except Exception:
            return self._decision("rejected", "malformed", None, now=now)

        authority = (
            state.last_finalized_candidate_turn_id,
            state.last_finalized_candidate_transcript_revision,
        )
        if authority != self._authority:
            self._authority = authority
            self._consumed.clear()
            self._pending.clear()

        recommendation_id = recommendation["recommendation_id"]
        if recommendation_id in self._consumed:
            return self._decision(
                "ignored", "repeated", recommendation, now=now
            )

        eligibility = assess_director_recommendation(
            recommendation,
            state.to_runtime_state(),
            now,
        )
        if eligibility != "eligible":
            if eligibility == "move_not_allowed" and self._was_delivered(
                recommendation, state
            ):
                eligibility = "already_delivered"
            return self._decision(
                "rejected", eligibility, recommendation, now=now
            )

        target_reason = self._assess_target(recommendation, state)
        if target_reason != "eligible":
            return self._decision(
                "rejected", target_reason, recommendation, now=now
            )
        tool_accepts_move = (
            tool_name == "commit_interviewer_move"
            and recommendation["move_type"]
            in ("probe", "clarify", "challenge", "transition")
        ) or (
            tool_name == "request_graceful_close"
            and recommendation["move_type"] == "close"
        )
        if not tool_accepts_move:
            return self._decision(
                "ignored", "tool_kind_mismatch", recommendation, now=now
            )
        if len(self._consumed) >= self._max_consumed:
            return self._decision(
                "ignored", "capacity", recommendation, now=now
            )

        self._consumed[recommendation_id] = None
        return self._decision(
            "accepted",
            "accepted",
            recommendation,
            now=now,
            stage="planned",
        )

    def record_controller_result(
        self,
        decision: DirectorInfluenceDecision,
        *,
        move_id: str,
        admitted: bool,
        now: datetime,
    ) -> None:
        recommendation = decision.recommendation
        if not decision.accepted or recommendation is None:
            return
        if not admitted:
            self._emit(
                outcome="rejected",
                reason="controller_denied",
                stage="evaluated",
                recommendation=recommendation,
                now=now,
                delivered_move_type=None,
            )
            return
        if len(self._pending) >= MAX_PENDING_INFLUENCED_MOVES:
            self._pending.pop(next(iter(self._pending)))
        self._pending[move_id] = _PendingInfluence(
            recommendation_id=recommendation["recommendation_id"],
            model_adapter_version=recommendation["model_adapter_version"],
            director_policy_version=recommendation["policy_version"],
            move_type=recommendation["move_type"],
            created_at=recommendation["created_at"],
            flag_state="enabled",
        )
        self._emit(
            outcome="accepted",
            reason="accepted",
            stage="admitted",
            recommendation=recommendation,
            now=now,
            delivered_move_type=None,
        )

    def observe_controller_state(
        self,
        state: ControllerState | None,
        *,
        now: datetime,
    ) -> None:
        """Record terminal delivery stages from the controller's own ledger."""
        if state is None or not self._pending:
            return
        by_id = {move.move_id: move for move in state.move_ledger}
        for move_id, pending in tuple(self._pending.items()):
            move = by_id.get(move_id)
            if move is None or move.stage not in (
                "canonically_delivered",
                "interrupted",
                "aborted",
            ):
                continue
            recommendation = {
                "contract_version": DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
                "policy_version": pending.director_policy_version,
                "model_adapter_version": pending.model_adapter_version,
                "move_type": pending.move_type,
                "created_at": pending.created_at,
            }
            self._emit(
                outcome="accepted",
                reason="accepted",
                stage=move.stage,
                recommendation=recommendation,
                now=now,
                delivered_move_type=move.move_type,
                flag_state=pending.flag_state,
            )
            self._pending.pop(move_id, None)

    def close(self) -> None:
        self._authority = None
        self._consumed.clear()
        self._pending.clear()

    @staticmethod
    def _assess_target(
        recommendation: Mapping[str, Any], state: ControllerState
    ) -> str:
        move_type = recommendation["move_type"]
        target = recommendation["target"]
        if (
            target["question_id"] != state.active_question_id
            or target["source_turn_id"]
            != state.last_finalized_candidate_turn_id
        ):
            return "target_mismatch"
        if move_type in ("probe", "clarify", "challenge"):
            if target["topic"] != state.current_topic:
                return "target_mismatch"
            if any(
                move.stage == "canonically_delivered"
                and move.move_type == move_type
                and move.question_id == state.active_question_id
                and move.topic == state.current_topic
                for move in state.move_ledger
            ):
                return "already_delivered"
            candidates = list_probe_candidates(state)
            return (
                "eligible"
                if any(
                    candidate["probe_candidate_id"]
                    == target["probe_candidate_id"]
                    and candidate["move_type"] == move_type
                    and candidate["question_id"] == target["question_id"]
                    and candidate["topic"] == target["topic"]
                    and candidate["reason_code"]
                    == recommendation["reason_code"]
                    for candidate in candidates
                )
                else "probe_ineligible"
            )
        if move_type == "transition":
            if state.topic_index + 1 >= len(state.topic_catalog):
                return "move_not_allowed"
            next_topic = state.topic_catalog[
                state.topic_index + 1
            ]
            return (
                "eligible"
                if target["topic"] == next_topic
                and target["probe_candidate_id"] is None
                else "target_mismatch"
            )
        return (
            "eligible"
            if target["topic"] == state.current_topic
            and target["probe_candidate_id"] is None
            else "target_mismatch"
        )

    @staticmethod
    def _was_delivered(
        recommendation: Mapping[str, Any], state: ControllerState
    ) -> bool:
        target = recommendation["target"]
        return any(
            move.stage == "canonically_delivered"
            and move.move_type == recommendation["move_type"]
            and move.question_id == target["question_id"]
            and move.topic == target["topic"]
            for move in state.move_ledger
        )

    def _decision(
        self,
        outcome: InfluenceOutcome,
        reason: str,
        recommendation: dict[str, Any] | None,
        *,
        now: datetime,
        stage: InfluenceStage = "evaluated",
    ) -> DirectorInfluenceDecision:
        if reason not in INFLUENCE_DECISION_REASONS:
            reason = "malformed"
            outcome = "rejected"
        self._emit(
            outcome=outcome,
            reason=reason,
            stage=stage,
            recommendation=recommendation,
            now=now,
            delivered_move_type=None,
        )
        return DirectorInfluenceDecision(outcome, reason, recommendation)

    def _emit(
        self,
        *,
        outcome: InfluenceOutcome,
        reason: str,
        stage: InfluenceStage,
        recommendation: Mapping[str, Any] | None,
        now: datetime,
        delivered_move_type: str | None,
        flag_state: str | None = None,
    ) -> None:
        recorder = getattr(self._observability, "record", None)
        if not callable(recorder):
            return
        try:
            created_at = recommendation.get("created_at") if recommendation else None
            age_ms = _age_ms(now, created_at)
            recorder(
                "director_influence",
                turn_correlation_id=None,
                influence_contract_version=DIRECTOR_INFLUENCE_CONTRACT_VERSION,
                influence_policy_version=DIRECTOR_INFLUENCE_POLICY_VERSION,
                influence_config_version=DIRECTOR_INFLUENCE_CONFIG_VERSION,
                influence_flag_state=(
                    flag_state
                    if flag_state is not None
                    else "enabled" if self.enabled else "disabled"
                ),
                recommendation_contract_version=(
                    DIRECTOR_RECOMMENDATION_CONTRACT_VERSION
                ),
                director_policy_version=(
                    recommendation.get("policy_version")
                    if recommendation is not None
                    else None
                ),
                director_adapter_version=(
                    recommendation.get("model_adapter_version")
                    if recommendation is not None
                    else None
                ),
                decision_outcome=outcome,
                decision_reason=reason,
                influence_stage=stage,
                planned_move_type=(
                    recommendation.get("move_type")
                    if recommendation is not None
                    else None
                ),
                delivered_move_type=delivered_move_type,
                recommendation_age_ms=age_ms,
            )
        except Exception:
            return


def _age_ms(now: datetime, created_at: object) -> float | None:
    if not isinstance(now, datetime) or not isinstance(created_at, str):
        return None
    try:
        current = now if now.tzinfo is not None else now.replace(tzinfo=timezone.utc)
        created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        return round(max(0.0, (current - created).total_seconds() * 1_000), 3)
    except (TypeError, ValueError):
        return None
