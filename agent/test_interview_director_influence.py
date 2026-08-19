#!/usr/bin/env python3
"""Behavior tests for synchronous, controller-gated Director influence."""

from __future__ import annotations

import asyncio
import copy
import sys
import unittest
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))

from shared.interview_controller import (  # noqa: E402
    CandidateTurnPrepared,
    DeliveryEvidence,
    InterviewerMoveAdmitted,
    LifecycleSnapshotRefreshed,
    MoveStageAdvanced,
    PersistedTranscriptEvidence,
    create_controller_state,
    derive_allowed_moves,
    list_probe_candidates,
    reduce_controller,
)
from shared.interview_director import (  # noqa: E402
    DirectorRecommendationStore,
)
from shared.interview_director_influence import (  # noqa: E402
    DIRECTOR_INFLUENCE_FEATURE_ENV,
    DirectorInfluenceGate,
)
from shared.interviewer_contracts import (  # noqa: E402
    DIRECTOR_FAKE_ADAPTER_VERSION,
    DIRECTOR_POLICY_CONTRACT_VERSION,
    DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
)


NOW = datetime(2026, 8, 19, 12, 1, tzinfo=timezone.utc)


def iso(second_offset: int = 0) -> str:
    return datetime.fromtimestamp(
        NOW.timestamp() + second_offset, timezone.utc
    ).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def make_state(
    *,
    deadline_at="2026-08-19T12:30:00.000Z",
    topic_catalog=("objective_and_scope", "problem_evidence"),
):
    initial = create_controller_state(
        session_id="session-475",
        brief_id="brief:475",
        writer_id="writer-1",
        writer_generation=1,
        lifecycle_state="active",
        lifecycle_version=1,
        started_at="2026-08-19T12:00:00.000Z",
        deadline_at=deadline_at,
        observed_at="2026-08-19T12:00:00.000Z",
        monotonic_anchor_ms=1_000,
        round_objectives=("clarify_product_goal", "identify_core_problem"),
        topic_catalog=topic_catalog,
        active_question_id="question-475",
    )
    return reduce_controller(
        initial,
        CandidateTurnPrepared(
            expected_state_revision=initial.state_revision,
            turn_id="turn-1",
            transcript_revision="event:user:1",
            text="I would clarify the product goal and first target user.",
            duration_ms=8_000,
            monotonic_ms=2_000,
        ),
    ).state


def recommendation(state=None, *, move_type="probe", recommendation_id="rec:1"):
    state = state or make_state()
    target_topic = state.current_topic
    probe_candidate_id = None
    reasons = {
        "probe": "deepen_reasoning",
        "clarify": "resolve_ambiguity",
        "challenge": "test_tradeoff",
        "transition": "advance_round",
        "close": "controller_fallback",
    }
    if move_type in ("probe", "clarify", "challenge"):
        candidate = next(
            item
            for item in list_probe_candidates(state)
            if item["move_type"] == move_type
        )
        probe_candidate_id = candidate["probe_candidate_id"]
    if move_type == "transition":
        target_topic = state.topic_catalog[
            min(state.topic_index + 1, len(state.topic_catalog) - 1)
        ]
    return {
        "contract_version": DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
        "policy_version": DIRECTOR_POLICY_CONTRACT_VERSION,
        "model_adapter_version": DIRECTOR_FAKE_ADAPTER_VERSION,
        "recommendation_id": recommendation_id,
        "session_id": state.session_id,
        "brief_id": state.brief_id,
        "writer_id": state.writer_id,
        "writer_generation": state.writer_generation,
        "based_on_state_revision": state.state_revision,
        "based_on_lifecycle_version": state.lifecycle_version,
        "source_turn_id": state.last_finalized_candidate_turn_id,
        "source_transcript_revision": (
            state.last_finalized_candidate_transcript_revision
        ),
        "source_finality": "finalized",
        "move_type": move_type,
        "target": {
            "question_id": state.active_question_id,
            "topic": target_topic,
            "source_turn_id": state.last_finalized_candidate_turn_id,
            "probe_candidate_id": probe_candidate_id,
        },
        "reason_code": reasons[move_type],
        "created_at": iso(-1),
        "expires_at": iso(0),
    }


class MemoryObservability:
    def __init__(self):
        self.events = []

    def record(self, event_kind, **fields):
        self.events.append({"event_kind": event_kind, **fields})
        return True


class DirectorInfluencePolicyTests(unittest.TestCase):
    def setUp(self):
        self.state = make_state()
        self.env = {DIRECTOR_INFLUENCE_FEATURE_ENV: "true"}
        self.raw = recommendation(self.state)
        self.observability = MemoryObservability()
        self.install(self.raw)

    def install(self, raw):
        self.raw = raw
        self.store = DirectorRecommendationStore(
            session_id="session-475",
            writer_id="writer-1",
            writer_generation=1,
            capacity=32,
        )
        self.store.publish(raw, now=raw["created_at"])
        self.gate = DirectorInfluenceGate(
            env=self.env,
            session_id="session-475",
            recommendation_store=self.store,
            observability=self.observability,
        )

    def evaluate(self, *, tool_name="commit_interviewer_move"):
        return self.gate.evaluate(
            state=self.state,
            tool_name=tool_name,
            now=NOW,
        )

    def evaluate_raw(self, raw, *, tool_name="commit_interviewer_move"):
        with mock.patch.object(self.store, "peek_latest", return_value=raw):
            return self.evaluate(tool_name=tool_name)

    def test_ready_recommendation_is_accepted_synchronously(self):
        decision = self.evaluate()
        self.assertTrue(decision.accepted)
        self.assertEqual(decision.reason, "accepted")
        self.assertFalse(asyncio.iscoroutine(decision))
        self.assertEqual(self.gate.consumed_count, 1)
        self.assertEqual(self.observability.events[-1]["influence_stage"], "planned")

    def test_exact_policy_is_read_on_every_admission_and_revokes_ready_advice(self):
        self.env[DIRECTOR_INFLUENCE_FEATURE_ENV] = "false"
        with mock.patch.object(
            self.store, "peek_latest", wraps=self.store.peek_latest
        ) as peek:
            decision = self.evaluate()
            peek.assert_not_called()
        self.assertEqual((decision.outcome, decision.reason), ("ignored", "flag_disabled"))
        self.env[DIRECTOR_INFLUENCE_FEATURE_ENV] = "true"
        self.assertTrue(self.evaluate().accepted)
        self.env.pop(DIRECTOR_INFLUENCE_FEATURE_ENV)
        self.install(
            recommendation(self.state, recommendation_id="rec:ready-before-revoke")
        )
        decision = self.evaluate()
        self.assertEqual(decision.reason, "flag_disabled")

    def test_missing_unavailable_and_malformed_are_safe(self):
        gate = DirectorInfluenceGate(
            env=self.env,
            session_id="session-475",
            recommendation_store=None,
        )
        self.assertEqual(
            gate.evaluate(
                state=self.state,
                tool_name="commit_interviewer_move",
                now=NOW,
            ).reason,
            "director_unavailable",
        )
        empty = DirectorRecommendationStore(
            session_id="session-475",
            writer_id="writer-1",
            writer_generation=1,
            capacity=4,
        )
        gate = DirectorInfluenceGate(
            env=self.env,
            session_id="session-475",
            recommendation_store=empty,
        )
        self.assertEqual(
            gate.evaluate(
                state=self.state,
                tool_name="commit_interviewer_move",
                now=NOW,
            ).reason,
            "recommendation_missing",
        )
        with mock.patch.object(
            empty,
            "peek_latest",
            return_value={"contract_version": "director-recommendation.v1"},
        ):
            self.assertEqual(
                gate.evaluate(
                    state=self.state,
                    tool_name="commit_interviewer_move",
                    now=NOW,
                ).reason,
                "malformed",
            )

    def test_current_authority_and_freshness_fail_closed(self):
        mutations = (
            ("session_id", "session-other", "session_mismatch"),
            ("brief_id", "brief:other", "brief_mismatch"),
            ("based_on_state_revision", 0, "stale_state"),
            ("based_on_lifecycle_version", 2, "stale_lifecycle"),
            ("source_finality", "speculative", "source_not_final"),
            ("source_turn_id", "turn-other", "source_turn_mismatch"),
            (
                "source_transcript_revision",
                "event:user:other",
                "source_transcript_revision_mismatch",
            ),
        )
        for field, value, expected in mutations:
            with self.subTest(field=field):
                self.raw = recommendation(self.state, recommendation_id=f"rec:{field}")
                self.raw[field] = value
                if field == "source_turn_id":
                    self.raw["target"]["source_turn_id"] = value
                self.assertEqual(self.evaluate_raw(self.raw).reason, expected)

        self.raw = recommendation(self.state, recommendation_id="rec:not-yet")
        self.raw["created_at"] = iso(1)
        self.raw["expires_at"] = iso(2)
        self.assertEqual(self.evaluate_raw(self.raw).reason, "not_yet_valid")
        self.raw = recommendation(self.state, recommendation_id="rec:expired")
        self.raw["created_at"] = iso(-2)
        self.raw["expires_at"] = iso(-1)
        self.assertEqual(self.evaluate_raw(self.raw).reason, "expired")

    def test_target_probe_tool_kind_and_repeat_are_bounded(self):
        self.raw["target"]["topic"] = "problem_evidence"
        self.assertEqual(self.evaluate_raw(self.raw).reason, "target_mismatch")
        self.raw = recommendation(self.state, recommendation_id="rec:probe-bad")
        self.raw["target"]["probe_candidate_id"] = "probe:000000000000000000000000"
        self.assertEqual(self.evaluate_raw(self.raw).reason, "probe_ineligible")
        self.raw = recommendation(self.state, recommendation_id="rec:close-tool")
        self.assertEqual(
            self.evaluate_raw(
                self.raw, tool_name="request_graceful_close"
            ).reason,
            "tool_kind_mismatch",
        )
        self.install(recommendation(self.state, recommendation_id="rec:repeat"))
        self.assertTrue(self.evaluate().accepted)
        self.assertEqual(self.evaluate().reason, "repeated")
        self.assertEqual(self.gate.consumed_count, 1)

    def test_transition_and_close_targets_are_exact(self):
        self.install(recommendation(self.state, move_type="transition"))
        self.assertTrue(self.evaluate().accepted)
        close = recommendation(
            self.state, move_type="close", recommendation_id="rec:commit-close"
        )
        self.install(close)
        self.assertEqual(self.evaluate().reason, "tool_kind_mismatch")
        close_store = DirectorRecommendationStore(
            session_id="session-475",
            writer_id="writer-1",
            writer_generation=1,
            capacity=4,
        )
        close_store.publish(close, now=close["created_at"])
        gate = DirectorInfluenceGate(
            env=self.env,
            session_id="session-475",
            recommendation_store=close_store,
        )
        self.assertTrue(
            gate.evaluate(
                state=self.state,
                tool_name="request_graceful_close",
                now=NOW,
            ).accepted
        )

    def test_controller_and_canonical_delivery_stages_are_correlated(self):
        decision = self.evaluate()
        self.gate.record_controller_result(
            decision,
            move_id="move:session-475:1",
            admitted=True,
            now=NOW,
        )
        admitted = reduce_controller(
            self.state,
            InterviewerMoveAdmitted(
                expected_state_revision=self.state.state_revision,
                move_id="move:session-475:1",
                move_type="probe",
                reason_code="deepen_reasoning",
                question_id="question-475",
                topic="objective_and_scope",
                source_turn_id="turn-1",
                probe_candidate_id=self.raw["target"]["probe_candidate_id"],
                monotonic_ms=2_100,
            ),
        ).state
        spoken = admitted
        for offset, stage in enumerate(("generated", "scheduled", "spoken"), 1):
            spoken = reduce_controller(
                spoken,
                MoveStageAdvanced(
                    expected_state_revision=spoken.state_revision,
                    move_id="move:session-475:1",
                    stage=stage,
                    monotonic_ms=2_100 + offset * 100,
                ),
            ).state
        delivered = reduce_controller(
            spoken,
            PersistedTranscriptEvidence(
                expected_state_revision=spoken.state_revision,
                move_id="move:session-475:1",
                evidence=DeliveryEvidence(
                    evidence_type="transcript_event",
                    event_id="event:interviewer:1",
                    writer_id="writer-1",
                    writer_generation=1,
                    sequence=2,
                    delivery_state="delivered",
                ),
                monotonic_ms=2_500,
            ),
        ).state
        self.env[DIRECTOR_INFLUENCE_FEATURE_ENV] = "false"
        self.gate.observe_controller_state(delivered, now=NOW)
        self.assertEqual(
            [event["influence_stage"] for event in self.observability.events],
            ["planned", "admitted", "canonically_delivered"],
        )
        self.assertEqual(self.gate.pending_count, 0)
        self.assertEqual(
            self.observability.events[-1]["influence_flag_state"],
            "enabled",
        )

    def test_controller_denial_is_traced_and_recommendation_stays_consumed(self):
        decision = self.evaluate()
        self.gate.record_controller_result(
            decision,
            move_id="move:session-475:1",
            admitted=False,
            now=NOW,
        )
        self.assertEqual(self.observability.events[-1]["decision_reason"], "controller_denied")
        self.assertEqual(self.evaluate().reason, "repeated")

    def test_close_clears_bounded_consumed_and_pending_state(self):
        decision = self.evaluate()
        self.gate.record_controller_result(
            decision,
            move_id="move:session-475:1",
            admitted=True,
            now=NOW,
        )
        self.assertEqual((self.gate.consumed_count, self.gate.pending_count), (1, 1))
        self.gate.close()
        self.assertEqual((self.gate.consumed_count, self.gate.pending_count), (0, 0))

    def test_deadline_lifecycle_and_final_topic_phase_fences(self):
        deadline_state = make_state(deadline_at="2026-08-19T12:01:00.000Z")
        deadline_raw = recommendation(deadline_state)
        with mock.patch.object(self.store, "peek_latest", return_value=deadline_raw):
            self.assertEqual(
                self.gate.evaluate(
                    state=deadline_state,
                    tool_name="commit_interviewer_move",
                    now=NOW,
                ).reason,
                "deadline_elapsed",
            )

        reconnecting = reduce_controller(
            self.state,
            LifecycleSnapshotRefreshed(
                expected_state_revision=self.state.state_revision,
                lifecycle_state="reconnecting",
                lifecycle_version=2,
                monotonic_ms=2_100,
            ),
        ).state
        lifecycle_raw = recommendation(self.state, recommendation_id="rec:lifecycle")
        lifecycle_raw["based_on_state_revision"] = reconnecting.state_revision
        lifecycle_raw["based_on_lifecycle_version"] = reconnecting.lifecycle_version
        with mock.patch.object(self.store, "peek_latest", return_value=lifecycle_raw):
            self.assertEqual(
                self.gate.evaluate(
                    state=reconnecting,
                    tool_name="commit_interviewer_move",
                    now=NOW,
                ).reason,
                "lifecycle_not_active",
            )

        final_topic = replace(make_state(), topic_index=1)
        final_topic = replace(
            final_topic,
            allowed_moves=derive_allowed_moves(final_topic),
        )
        final_raw = recommendation(final_topic, move_type="transition")
        with mock.patch.object(self.store, "peek_latest", return_value=final_raw):
            self.assertEqual(
                self.gate.evaluate(
                    state=final_topic,
                    tool_name="commit_interviewer_move",
                    now=NOW,
                ).reason,
                "move_not_allowed",
            )

        closing = replace(
            self.state,
            phase="closing",
            close_state="requested",
            allowed_moves=("close",),
        )
        closing_raw = recommendation(self.state, recommendation_id="rec:phase")
        closing_raw["based_on_state_revision"] = closing.state_revision
        with mock.patch.object(self.store, "peek_latest", return_value=closing_raw):
            self.assertEqual(
                self.gate.evaluate(
                    state=closing,
                    tool_name="commit_interviewer_move",
                    now=NOW,
                ).reason,
                "move_not_allowed",
            )

    def test_authoritative_delivered_ledger_rejects_repeated_probe(self):
        candidate = list_probe_candidates(self.state)[0]
        admitted = reduce_controller(
            self.state,
            InterviewerMoveAdmitted(
                expected_state_revision=self.state.state_revision,
                move_id="move:session-475:1",
                move_type="probe",
                reason_code="deepen_reasoning",
                question_id=self.state.active_question_id,
                topic=self.state.current_topic,
                source_turn_id="turn-1",
                probe_candidate_id=candidate["probe_candidate_id"],
                monotonic_ms=2_100,
            ),
        ).state
        delivered = admitted
        for offset, stage in enumerate(("generated", "scheduled", "spoken"), 1):
            delivered = reduce_controller(
                delivered,
                MoveStageAdvanced(
                    expected_state_revision=delivered.state_revision,
                    move_id="move:session-475:1",
                    stage=stage,
                    monotonic_ms=2_100 + offset * 100,
                ),
            ).state
        delivered = reduce_controller(
            delivered,
            PersistedTranscriptEvidence(
                expected_state_revision=delivered.state_revision,
                move_id="move:session-475:1",
                evidence=DeliveryEvidence(
                    evidence_type="transcript_event",
                    event_id="event:interviewer:1",
                    writer_id="writer-1",
                    writer_generation=1,
                    sequence=2,
                    delivery_state="delivered",
                ),
                monotonic_ms=2_500,
            ),
        ).state
        next_turn = reduce_controller(
            delivered,
            CandidateTurnPrepared(
                expected_state_revision=delivered.state_revision,
                turn_id="turn-2",
                transcript_revision="event:user:2",
                text="I would validate the scope with a focused experiment.",
                duration_ms=8_000,
                monotonic_ms=2_600,
            ),
        ).state
        repeated = recommendation(self.state, recommendation_id="rec:delivered")
        repeated["based_on_state_revision"] = next_turn.state_revision
        repeated["source_turn_id"] = "turn-2"
        repeated["source_transcript_revision"] = "event:user:2"
        repeated["target"]["source_turn_id"] = "turn-2"
        with mock.patch.object(self.store, "peek_latest", return_value=repeated):
            self.assertEqual(
                self.gate.evaluate(
                    state=next_turn,
                    tool_name="commit_interviewer_move",
                    now=NOW,
                ).reason,
                "already_delivered",
            )

    def test_consumed_replay_fence_is_scoped_to_current_source_authority(self):
        self.assertTrue(self.evaluate().accepted)
        next_turn = reduce_controller(
            self.state,
            CandidateTurnPrepared(
                expected_state_revision=self.state.state_revision,
                turn_id="turn-2",
                transcript_revision="event:user:2",
                text="I would test the next assumption with target users.",
                duration_ms=8_000,
                monotonic_ms=2_100,
            ),
        ).state
        next_raw = recommendation(next_turn, recommendation_id="rec:next")
        self.store.publish(next_raw, now=next_raw["created_at"])
        decision = self.gate.evaluate(
            state=next_turn,
            tool_name="commit_interviewer_move",
            now=NOW,
        )
        self.assertTrue(decision.accepted)
        self.assertEqual(self.gate.consumed_count, 1)


class DirectorInfluenceStoreTests(unittest.TestCase):
    def test_raw_peek_preserves_expired_value_for_policy_classification(self):
        state = make_state()
        store = DirectorRecommendationStore(
            session_id=state.session_id,
            writer_id=state.writer_id,
            writer_generation=state.writer_generation,
            capacity=4,
        )
        raw = recommendation(state)
        self.assertEqual(store.publish(raw, now=iso(-1)).outcome, "ready")
        self.assertEqual(
            store.peek_latest(session_id=state.session_id)["recommendation_id"],
            raw["recommendation_id"],
        )
        self.assertIsNone(
            store.latest_valid(
                session_id=state.session_id,
                source_turn_id="turn-1",
                source_transcript_revision="event:user:1",
                now=iso(1),
            )
        )
        store.close()
        with self.assertRaises(Exception):
            store.peek_latest(session_id=state.session_id)


if __name__ == "__main__":
    unittest.main()
