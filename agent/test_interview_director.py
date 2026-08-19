#!/usr/bin/env python3
"""Behavior tests for the provider-free read-only Interview Director shadow."""

import asyncio
import copy
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.interview_controller import (  # noqa: E402
    CandidateTurnCompleted,
    DeliveryEvidence,
    MoveStageAdvanced,
    PersistedTranscriptEvidence,
    WriterReconnected,
    create_controller_state,
    reduce_controller,
)
from shared.interview_director import (  # noqa: E402
    DIRECTOR_SHADOW_FEATURE_ENV,
    DeliveredInterviewerMove,
    DeterministicFakeDirectorAdapter,
    DirectorAdapterResult,
    DirectorError,
    DirectorLimits,
    DirectorRecommendationStore,
    DirectorShadowConfig,
    DirectorShadowTraceEvent,
    DirectorTurnObservation,
    InterviewDirectorShadowSession,
    MemoryDirectorTraceSink,
    Sav469DirectorTraceSink,
    _shadow_move_vocabulary,
    resolve_director_shadow_config,
)
from shared.interviewer_contracts import (  # noqa: E402
    DIRECTOR_FAKE_ADAPTER_VERSION,
    DIRECTOR_POLICY_CONTRACT_VERSION,
    DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
    parse_director_recommendation,
)


FIXED_NOW = datetime(2026, 8, 19, 12, 1, tzinfo=timezone.utc).timestamp()


def iso(offset_seconds: int = 0) -> str:
    return datetime.fromtimestamp(FIXED_NOW + offset_seconds, timezone.utc).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")


class DirectorHarness:
    def __init__(
        self,
        *,
        adapter=None,
        limits: DirectorLimits | None = None,
        enabled: bool = True,
    ) -> None:
        self.state = self.make_state()
        self.trace = MemoryDirectorTraceSink()
        self.adapter = adapter or DeterministicFakeDirectorAdapter()
        self.session = InterviewDirectorShadowSession(
            config=DirectorShadowConfig(
                enabled=enabled,
                limits=limits or DirectorLimits(),
            ),
            session_id="session-474",
            adapter=self.adapter,
            state_provider=lambda: self.state.to_runtime_state(),
            delivery_topic_provider=self.delivery_topic,
            trace_sink=self.trace,
            clock=lambda: FIXED_NOW,
        )

    def delivery_topic(self, move_id: str) -> str | None:
        return next(
            (move.topic for move in self.state.move_ledger if move.move_id == move_id),
            None,
        )

    @staticmethod
    def make_state():
        initial = create_controller_state(
            session_id="session-474",
            brief_id="brief:474",
            writer_id="writer-1",
            writer_generation=1,
            lifecycle_state="active",
            lifecycle_version=1,
            started_at="2026-08-19T12:00:00.000Z",
            deadline_at="2026-08-19T12:30:00.000Z",
            observed_at="2026-08-19T12:00:00.000Z",
            monotonic_anchor_ms=1_000,
            round_objectives=("clarify_product_goal", "identify_core_problem"),
            topic_catalog=("objective_and_scope", "problem_evidence"),
            active_question_id="question-474",
        )
        return reduce_controller(
            initial,
            CandidateTurnCompleted(
                expected_state_revision=initial.state_revision,
                turn_id="turn-1",
                transcript_revision="event:user:1",
                text="I would clarify the product goal and first target user.",
                duration_ms=8_000,
                monotonic_ms=2_000,
                requested_clarification=False,
                requested_exit=False,
            ),
        ).state

    def user_event(
        self,
        *,
        event_id: str = "event:user:1",
        text: str = "I would clarify the product goal and first target user.",
        sequence: int = 1,
    ) -> dict[str, object]:
        return {
            "contract_version": 2,
            "event_id": event_id,
            "session_id": "session-474",
            "speaker": "user",
            "text": text,
            "is_final": True,
            "delivery_state": "delivered",
            "sequence": sequence,
            "writer_id": "writer-1",
            "writer_generation": 1,
            "ended_at": iso(),
        }

    async def run_final(self) -> dict[str, object] | None:
        result = self.session.observe_persisted_transcript(
            self.user_event(),
            source_turn_id="turn-1",
        )
        assert result == "scheduled"
        assert await self.session.wait_idle()
        assert self.session.store is not None
        return self.session.store.latest_valid(
            session_id="session-474",
            source_turn_id="turn-1",
            source_transcript_revision="event:user:1",
            now=iso(),
        )


class InterviewDirectorSchemaAndStoreTests(unittest.TestCase):
    def recommendation(
        self,
        *,
        recommendation_id="recommendation:1",
        revision="event:user:1",
        created_offset=0,
    ):
        return {
            "contract_version": DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
            "policy_version": DIRECTOR_POLICY_CONTRACT_VERSION,
            "model_adapter_version": DIRECTOR_FAKE_ADAPTER_VERSION,
            "recommendation_id": recommendation_id,
            "session_id": "session-474",
            "brief_id": "brief:474",
            "writer_id": "writer-1",
            "writer_generation": 1,
            "based_on_state_revision": 1,
            "based_on_lifecycle_version": 1,
            "source_turn_id": "turn-1",
            "source_transcript_revision": revision,
            "source_finality": "finalized",
            "move_type": "probe",
            "target": {
                "question_id": "question-474",
                "topic": "objective_and_scope",
                "source_turn_id": "turn-1",
                "probe_candidate_id": "probe:objective",
            },
            "reason_code": "deepen_reasoning",
            "created_at": iso(created_offset),
            "expires_at": iso(created_offset + 5),
        }

    def test_config_is_exact_default_off_and_has_hard_caps(self):
        self.assertFalse(resolve_director_shadow_config({}).enabled)
        self.assertFalse(
            resolve_director_shadow_config(
                {DIRECTOR_SHADOW_FEATURE_ENV: "TRUE"}
            ).enabled
        )
        self.assertTrue(
            resolve_director_shadow_config(
                {DIRECTOR_SHADOW_FEATURE_ENV: "true"}
            ).enabled
        )
        with self.assertRaisesRegex(DirectorError, "invalid_config"):
            DirectorLimits(max_concurrency=5)
        with self.assertRaisesRegex(DirectorError, "invalid_config"):
            DirectorLimits(deadline_ms=5_001)

    def test_versioned_recommendation_fails_closed_without_hidden_reasoning(self):
        parsed = parse_director_recommendation(self.recommendation())
        self.assertEqual(parsed["policy_version"], DIRECTOR_POLICY_CONTRACT_VERSION)
        self.assertNotIn("reasoning", parsed)
        with self.assertRaisesRegex(Exception, "invalid_payload"):
            parse_director_recommendation({**parsed, "chain_of_thought": "hidden"})
        with self.assertRaisesRegex(Exception, "invalid_payload"):
            parse_director_recommendation({**parsed, "policy_version": "unknown.v1"})

    def test_counterfactual_vocabulary_closes_at_every_authority_fence(self):
        active = DirectorHarness.make_state().to_runtime_state()
        self.assertEqual(
            _shadow_move_vocabulary(active),
            ("probe", "clarify", "challenge", "transition", "close"),
        )
        self.assertEqual(active["allowed_moves"], [])

        elapsed = copy.deepcopy(active)
        elapsed["clock"]["band"] = "elapsed"
        elapsed["clock"]["remaining_ms"] = 0
        self.assertEqual(_shadow_move_vocabulary(elapsed), ())

        terminal = copy.deepcopy(active)
        terminal["speech_fenced"] = True
        self.assertEqual(_shadow_move_vocabulary(terminal), ())

        for lifecycle_state in ("created", "ending", "completed", "abandoned", "failed"):
            non_active = copy.deepcopy(active)
            non_active["lifecycle_snapshot"]["state"] = lifecycle_state
            self.assertEqual(_shadow_move_vocabulary(non_active), ())

    def test_store_is_session_local_latest_valid_and_replay_safe(self):
        store = DirectorRecommendationStore(
            session_id="session-474",
            writer_id="writer-1",
            writer_generation=1,
            capacity=4,
        )
        recommendation = self.recommendation()
        self.assertEqual(store.publish(recommendation, now=iso()).outcome, "ready")
        self.assertEqual(store.publish(recommendation, now=iso()).outcome, "duplicate")
        with self.assertRaisesRegex(DirectorError, "replay_conflict"):
            store.publish(
                {
                    **recommendation,
                    "target": {**recommendation["target"], "topic": "another_topic"},
                },
                now=iso(),
            )
        with self.assertRaisesRegex(DirectorError, "session_mismatch"):
            store.latest_valid(
                session_id="another-session",
                source_turn_id="turn-1",
                source_transcript_revision="event:user:1",
                now=iso(),
            )
        self.assertIsNone(
            store.latest_valid(
                session_id="session-474",
                source_turn_id="turn-1",
                source_transcript_revision="event:user:2",
                now=iso(),
            )
        )
        self.assertIsNone(
            store.latest_valid(
                session_id="session-474",
                source_turn_id="turn-1",
                source_transcript_revision="event:user:1",
                now=iso(6),
            )
        )

    def test_store_capacity_rollover_and_delivery_comparison_are_bounded(self):
        store = DirectorRecommendationStore(
            session_id="session-474",
            writer_id="writer-1",
            writer_generation=1,
            capacity=2,
        )
        recommendation = self.recommendation()
        store.publish(recommendation, now=iso())
        delivery = DeliveredInterviewerMove(
            session_id="session-474",
            writer_id="writer-1",
            writer_generation=1,
            move_id="move:1",
            delivery_event_id="event:interviewer:1",
            source_turn_id="turn-1",
            source_transcript_revision="event:user:1",
            move_type="probe",
            target_topic="objective_and_scope",
            delivered_at=iso(1),
        )
        result = store.record_delivery(delivery, now=iso(1))
        self.assertEqual(result.comparison.outcome, "exact_match")
        self.assertEqual(store.record_delivery(delivery, now=iso(1)).outcome, "duplicate")
        with self.assertRaisesRegex(DirectorError, "capacity"):
            store.publish(
                self.recommendation(
                    recommendation_id="recommendation:2",
                    revision="event:user:2",
                ),
                now=iso(),
            )
        store.rollover(writer_id="writer-2", writer_generation=2)
        self.assertEqual(store.entry_count, 0)
        self.assertIsNone(
            store.latest_valid(
                session_id="session-474",
                source_turn_id="turn-1",
                source_transcript_revision="event:user:1",
                now=iso(),
            )
        )

    def test_out_of_order_completion_cannot_replace_a_newer_source_result(self):
        store = DirectorRecommendationStore(
            session_id="session-474",
            writer_id="writer-1",
            writer_generation=1,
            capacity=4,
        )
        newer = self.recommendation(
            recommendation_id="recommendation:newer",
            revision="event:user:2",
            created_offset=2,
        )
        older = self.recommendation(
            recommendation_id="recommendation:older",
            revision="event:user:1",
            created_offset=1,
        )
        self.assertEqual(store.publish(newer, now=iso(3)).outcome, "ready")
        self.assertEqual(store.publish(older, now=iso(3)).outcome, "stale")
        self.assertEqual(
            store.latest_valid(
                session_id="session-474",
                source_turn_id="turn-1",
                source_transcript_revision="event:user:2",
                now=iso(3),
            )["recommendation_id"],
            "recommendation:newer",
        )

    def test_context_is_turn_and_byte_bounded_before_adapter_execution(self):
        limits = DirectorLimits(max_context_turns=3, max_context_bytes=4_096)
        harness = DirectorHarness(limits=limits)
        for index in range(8):
            harness.session._remember_final(
                DirectorTurnObservation(
                    session_id="session-474",
                    writer_id="writer-1",
                    writer_generation=1,
                    turn_id=f"history-{index}",
                    transcript_revision=f"revision-{index}",
                    sequence=index,
                    speaker="candidate" if index % 2 else "interviewer",
                    finality="finalized",
                    text="bounded synthetic context " * 40,
                    observed_at=iso(),
                )
            )
        source = DirectorTurnObservation(
            session_id="session-474",
            writer_id="writer-1",
            writer_generation=1,
            turn_id="turn-1",
            transcript_revision="event:user:1",
            sequence=9,
            speaker="candidate",
            finality="finalized",
            text="authoritative final",
            observed_at=iso(),
        )
        context = harness.session._build_context(source, harness.state.to_runtime_state())
        self.assertLessEqual(len(context.turns), 3)
        self.assertLessEqual(
            len(json.dumps(context.to_wire(), separators=(",", ":")).encode()),
            limits.max_context_bytes,
        )

    def test_sav469_projection_publishes_only_versioned_safe_shadow_metrics(self):
        captured = []

        def recorder(event_kind, **fields):
            captured.append((event_kind, fields))
            return True

        sink = Sav469DirectorTraceSink(recorder)
        outcome = DirectorShadowTraceEvent(
            contract_version="interview-director-shadow-trace.v1",
            event_kind="outcome",
            policy_version=DIRECTOR_POLICY_CONTRACT_VERSION,
            model_adapter_version=DIRECTOR_FAKE_ADAPTER_VERSION,
            recommendation_contract_version=(
                DIRECTOR_RECOMMENDATION_CONTRACT_VERSION
            ),
            outcome="ready",
            freshness="fresh",
            comparison=None,
            recommended_move_type=None,
            delivered_move_type=None,
            ready_latency_ms=25,
            recommendation_age_ms=5,
            estimated_cost_microusd=12,
            emitted_at=iso(),
        )
        comparison = DirectorShadowTraceEvent(
            **{
                **outcome.__dict__,
                "event_kind": "comparison",
                "comparison": "exact_match",
                "recommended_move_type": "probe",
                "delivered_move_type": "probe",
                "ready_latency_ms": None,
                "recommendation_age_ms": None,
                "estimated_cost_microusd": None,
            }
        )
        self.assertTrue(sink.emit(outcome))
        self.assertTrue(sink.emit(comparison))
        self.assertEqual(captured[0][0], "director")
        self.assertEqual(captured[0][1]["estimated_cost_microusd"], 12)
        self.assertEqual(
            captured[1][1]["recommendation_comparison"], "exact_match"
        )
        serialized = json.dumps(captured)
        for forbidden in ("text", "transcript", "prompt", "secret", "reasoning"):
            self.assertNotIn(forbidden, serialized)


class InterviewDirectorRunnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_finalized_turn_produces_typed_bounded_recommendation(self):
        harness = DirectorHarness()
        harness.session.start()
        recommendation = await harness.run_final()
        self.assertIsNotNone(recommendation)
        parsed = parse_director_recommendation(recommendation)
        self.assertEqual(parsed["source_finality"], "finalized")
        self.assertEqual(parsed["source_turn_id"], "turn-1")
        self.assertLessEqual(
            len(json.dumps(parsed, separators=(",", ":")).encode()),
            harness.session.config.limits.max_output_bytes,
        )
        self.assertTrue(any(event["outcome"] == "ready" for event in harness.trace.events))
        self.assertEqual(
            harness.session.observe_persisted_transcript(
                harness.user_event(), source_turn_id="turn-1"
            ),
            "duplicate",
        )
        await harness.session.shutdown()

    async def test_matching_speculative_text_reconciles_only_after_final_authority(self):
        harness = DirectorHarness()
        final_text = str(harness.user_event()["text"])
        self.assertEqual(
            harness.session.observe_interim(
                turn_id="turn-1",
                transcript_revision="interim:1",
                sequence=1,
                text=final_text,
                observed_at=iso(),
            ),
            "scheduled",
        )
        self.assertTrue(await harness.session.wait_idle())
        self.assertIsNone(
            harness.session.store.latest_valid(
                session_id="session-474",
                source_turn_id="turn-1",
                source_transcript_revision="event:user:1",
                now=iso(),
            )
        )
        self.assertEqual(
            harness.session.observe_persisted_transcript(
                harness.user_event(), source_turn_id="turn-1"
            ),
            "reconciled",
        )
        recommendation = harness.session.store.latest_valid(
            session_id="session-474",
            source_turn_id="turn-1",
            source_transcript_revision="event:user:1",
            now=iso(),
        )
        self.assertIsNotNone(recommendation)
        await harness.session.shutdown()

    async def test_speculative_work_reconciles_or_discards_without_persisting_interim(self):
        adapter = DeterministicFakeDirectorAdapter()
        harness = DirectorHarness(adapter=adapter)
        self.assertEqual(
            harness.session.observe_interim(
                turn_id="turn-1",
                transcript_revision="interim:1",
                sequence=1,
                text="raw interim that must disappear",
                observed_at=iso(),
            ),
            "scheduled",
        )
        self.assertTrue(await harness.session.wait_idle())
        self.assertEqual(
            harness.session.observe_persisted_transcript(
                harness.user_event(text="final text differs"),
                source_turn_id="turn-1",
            ),
            "scheduled",
        )
        self.assertTrue(await harness.session.wait_idle())
        serialized_trace = json.dumps(harness.trace.events)
        self.assertNotIn("raw interim", serialized_trace)
        self.assertTrue(
            any(event["outcome"] == "discarded_revision" for event in harness.trace.events)
        )
        recommendation = harness.session.store.latest_valid(
            session_id="session-474",
            source_turn_id="turn-1",
            source_transcript_revision="event:user:1",
            now=iso(),
        )
        self.assertIsNotNone(recommendation)
        await harness.session.shutdown()

    async def test_timeout_failure_retry_and_malformed_output_have_zero_result(self):
        limits = DirectorLimits(deadline_ms=10, max_retries=1)
        never_release = asyncio.Event()
        slow = DirectorHarness(
            adapter=DeterministicFakeDirectorAdapter(gates={"turn-1": never_release}),
            limits=limits,
        )
        await slow.run_final()
        self.assertTrue(any(event["outcome"] == "timeout" for event in slow.trace.events))
        self.assertIsNone(
            slow.session.store.latest_valid(
                session_id="session-474",
                source_turn_id="turn-1",
                source_transcript_revision="event:user:1",
                now=iso(),
            )
        )
        await slow.session.shutdown()

        malformed_result = DirectorAdapterResult(
            move_type="probe",
            topic="objective_and_scope",
            probe_candidate_id=None,
            reason_code="deepen_reasoning",
            output_bytes=10,
            reasoning_units=257,
            estimated_cost_microusd=0,
        )
        malformed = DirectorHarness(
            adapter=DeterministicFakeDirectorAdapter({"turn-1": malformed_result})
        )
        await malformed.run_final()
        self.assertTrue(
            any(event["outcome"] == "malformed" for event in malformed.trace.events)
        )
        self.assertEqual(malformed.adapter.recovery_calls, 1)
        await malformed.session.shutdown()

    async def test_delivery_before_result_is_compared_without_changing_delivery(self):
        adapter = DeterministicFakeDirectorAdapter()
        harness = DirectorHarness(adapter=adapter)
        delivery = DeliveredInterviewerMove(
            session_id="session-474",
            writer_id="writer-1",
            writer_generation=1,
            move_id="move:canonical:1",
            delivery_event_id="event:interviewer:1",
            source_turn_id="turn-1",
            source_transcript_revision="event:user:1",
            move_type="challenge",
            target_topic="objective_and_scope",
            delivered_at=iso(),
        )
        self.assertEqual(harness.session.record_delivered_move(delivery), "ready")
        await harness.run_final()
        comparisons = [
            event for event in harness.trace.events if event["event_kind"] == "comparison"
        ]
        self.assertEqual(comparisons[-1]["comparison"], "arrived_after_delivery")
        self.assertEqual(comparisons[-1]["delivered_move_type"], "challenge")
        await harness.session.shutdown()

    async def test_persisted_delivery_uses_exact_canonical_ledger_topic(self):
        harness = DirectorHarness()
        recommendation = await harness.run_final()
        self.assertIsNotNone(recommendation)
        move_id = harness.state.pending_move_id
        self.assertIsNotNone(move_id)
        for offset, stage in enumerate(("generated", "scheduled", "spoken"), 1):
            harness.state = reduce_controller(
                harness.state,
                MoveStageAdvanced(
                    expected_state_revision=harness.state.state_revision,
                    move_id=move_id,
                    stage=stage,
                    monotonic_ms=2_000 + offset,
                ),
            ).state
        harness.state = reduce_controller(
            harness.state,
            PersistedTranscriptEvidence(
                expected_state_revision=harness.state.state_revision,
                move_id=move_id,
                evidence=DeliveryEvidence(
                    evidence_type="transcript_event",
                    event_id="event:interviewer:1",
                    writer_id="writer-1",
                    writer_generation=1,
                    sequence=2,
                    delivery_state="delivered",
                    reason=None,
                ),
                monotonic_ms=2_004,
            ),
        ).state
        canonical_topic = next(
            move.topic for move in harness.state.move_ledger if move.move_id == move_id
        )
        self.assertEqual(
            harness.session.observe_persisted_transcript(
                {
                    **harness.user_event(
                        event_id="event:interviewer:1",
                        text="What evidence would test that assumption?",
                        sequence=2,
                    ),
                    "speaker": "interviewer",
                },
                source_turn_id="assistant-item-1",
            ),
            "ready",
        )
        comparison = [
            event for event in harness.trace.events if event["event_kind"] == "comparison"
        ][-1]
        self.assertEqual(comparison["delivered_move_type"], harness.state.move_ledger[-1].move_type)
        expected = (
            "exact_match"
            if recommendation["move_type"] == harness.state.move_ledger[-1].move_type
            and recommendation["target"]["topic"] == canonical_topic
            else "move_mismatch"
            if recommendation["move_type"] != harness.state.move_ledger[-1].move_type
            else "move_match_target_mismatch"
        )
        self.assertEqual(comparison["comparison"], expected)
        await harness.session.shutdown()

    async def test_reconnect_settlement_cancellation_and_capacity_leave_no_tasks(self):
        limits = DirectorLimits(max_pending_tasks=1, deadline_ms=100)
        gate = asyncio.Event()
        started = asyncio.Event()
        harness = DirectorHarness(
            adapter=DeterministicFakeDirectorAdapter(
                gates={"turn-1": gate},
                started_events={"turn-1": started},
            ),
            limits=limits,
        )
        self.assertEqual(
            harness.session.observe_persisted_transcript(
                harness.user_event(), source_turn_id="turn-1"
            ),
            "scheduled",
        )
        await asyncio.wait_for(started.wait(), timeout=0.2)
        self.assertEqual(
            harness.session.observe_interim(
                turn_id="turn-2",
                transcript_revision="interim:2",
                sequence=2,
                text="bounded second request",
                observed_at=iso(),
            ),
            "capacity",
        )
        harness.state = reduce_controller(
            harness.state,
            WriterReconnected(
                expected_state_revision=harness.state.state_revision,
                writer_id="writer-2",
                writer_generation=2,
                lifecycle_version=2,
                monotonic_ms=3_000,
            ),
        ).state
        self.assertEqual(harness.session.rollover(), "scheduled")
        self.assertTrue(await harness.session.wait_idle())
        self.assertEqual(harness.session.store.writer_generation, 2)
        harness.session.settle()
        await harness.session.shutdown()
        self.assertEqual(harness.session.pending_task_count, 0)
        self.assertFalse(harness.session.enabled)

    async def test_observer_cannot_mutate_live_or_customer_artifacts(self):
        harness = DirectorHarness()
        live_artifacts = {
            "chat_context": [{"role": "user", "content": "candidate answer"}],
            "controller_snapshot": harness.state.to_runtime_state(),
            "transcript": [harness.user_event()],
            "answer_blocks": [{"id": "block-1", "evidence": ["quote"]}],
            "feedback": {"eligible": True, "score": None},
            "customer_output": {"visible": ["canonical interviewer speech"]},
        }
        frozen = copy.deepcopy(live_artifacts)
        await harness.run_final()
        self.assertEqual(live_artifacts, frozen)
        trace_json = json.dumps(harness.trace.events)
        for forbidden in (
            "candidate answer",
            "canonical interviewer speech",
            "quote",
            "prompt",
            "chain_of_thought",
            "tool_payload",
            "secret",
        ):
            self.assertNotIn(forbidden, trace_json)
        await harness.session.shutdown()

    async def test_application_boundary_can_never_run_without_an_injected_adapter(self):
        state = DirectorHarness.make_state()
        session = InterviewDirectorShadowSession(
            config=DirectorShadowConfig(enabled=True),
            session_id="session-474",
            adapter=None,
            state_provider=lambda: state.to_runtime_state(),
        )
        self.assertFalse(session.enabled)
        self.assertEqual(session.failure_reason, "adapter_unavailable")
        self.assertEqual(session.start(), "disabled")
        await session.shutdown()


if __name__ == "__main__":
    unittest.main()
