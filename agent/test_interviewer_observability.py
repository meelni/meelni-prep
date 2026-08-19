import asyncio
import json
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.interviewer_observability import (
    DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
    INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION,
    INTERVIEWER_TOOL_CONTRACT_VERSION,
    InterviewerTurnLatencyTracker,
    create_interviewer_observability,
    drain_transcript_before_observability_close,
    is_interviewer_observability_event,
)


RUNTIME_UUID = "11111111-1111-1111-1111-111111111111"
TURN_UUID = "22222222-2222-2222-2222-222222222222"
RECOVERY_UUID = "33333333-3333-3333-3333-333333333333"


def configured_env(**overrides):
    value = {
        "OPIK_TRACING_ENABLED": "true",
        "OPIK_API_KEY": "synthetic-secret",
        "OPIK_WORKSPACE": "synthetic-workspace",
        "OPIK_PROJECT_NAME": "synthetic-project",
        "VERCEL_ENV": "preview",
    }
    value.update(overrides)
    return value


class FakeSpan:
    def __init__(self, name, attributes):
        self.name = name
        self.attributes = attributes
        self.ended = False

    def end(self):
        self.ended = True


class FakeTracer:
    def __init__(self, fail_after=None):
        self.spans = []
        self.fail_after = fail_after

    def start_span(self, name, *, attributes, context=None):
        if self.fail_after is not None and len(self.spans) >= self.fail_after:
            raise RuntimeError("synthetic telemetry failure")
        span = FakeSpan(name, attributes)
        self.spans.append(span)
        return span


class InterviewerObservabilityTests(unittest.TestCase):
    def test_closed_event_shape_rejects_content_identity_provider_and_reasoning(self):
        safe = {
            "contract_version": INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION,
            "event_kind": "tool",
            "runtime_correlation_id": f"run:{RUNTIME_UUID}",
            "turn_correlation_id": f"turn:{TURN_UUID}",
            "runtime_version": "director-shadow.v1",
            "rollout_cohort": "shadow",
            "emitted_at": "2026-08-19T01:20:00.000Z",
            "tool_contract_version": INTERVIEWER_TOOL_CONTRACT_VERSION,
            "tool_name": "read_interview_state",
            "tool_outcome": "timeout",
            "latency_ms": 100,
        }
        self.assertTrue(is_interviewer_observability_event(safe))
        for key, value in {
            "transcript": "synthetic candidate answer",
            "tool_payload": {"content": "synthetic tool result"},
            "candidate_identity": "candidate@example.test",
            "provider_identity": "provider-request-123",
            "hidden_reasoning": "private plan",
        }.items():
            with self.subTest(key=key):
                self.assertFalse(
                    is_interviewer_observability_event({**safe, key: value})
                )

    def test_emitter_records_timeout_and_stale_recommendation_as_child_spans(self):
        tracer = FakeTracer()
        observability = create_interviewer_observability(
            configured_env(
                MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED="true"
            ),
            tracer=tracer,
            clock=lambda: 1787102400.0,
            id_factory=lambda: RUNTIME_UUID,
        )

        self.assertTrue(
            observability.record(
                "tool",
                turn_correlation_id=f"turn:{TURN_UUID}",
                tool_contract_version=INTERVIEWER_TOOL_CONTRACT_VERSION,
                tool_name="read_interview_state",
                tool_outcome="timeout",
                latency_ms=125,
            )
        )
        self.assertTrue(
            observability.record(
                "director",
                turn_correlation_id=f"turn:{TURN_UUID}",
                recommendation_contract_version=(
                    DIRECTOR_RECOMMENDATION_CONTRACT_VERSION
                ),
                recommendation_outcome="stale",
                recommendation_freshness="stale",
                ready_latency_ms=80,
                recommendation_age_ms=500,
            )
        )

        self.assertEqual(observability.rollout_cohort, "shadow")
        self.assertEqual(observability.runtime_version, "director-shadow.v1")
        serialized = json.dumps([span.attributes for span in tracer.spans])
        self.assertIn("meelni.interviewer.tool_outcome", serialized)
        self.assertIn("meelni.interviewer.recommendation_freshness", serialized)
        for forbidden in (
            "transcript",
            "tool_payload",
            "candidate_identity",
            "provider_identity",
            "hidden_reasoning",
        ):
            self.assertNotIn(forbidden, serialized)

    def test_measured_turn_and_interruption_recovery_use_opaque_correlation(self):
        tracer = FakeTracer()
        observability = create_interviewer_observability(
            configured_env(),
            tracer=tracer,
            clock=lambda: 1787102400.0,
            id_factory=lambda: RUNTIME_UUID,
        )
        ids = iter((TURN_UUID, RECOVERY_UUID))
        tracker = InterviewerTurnLatencyTracker(
            observability, id_factory=lambda: next(ids)
        )

        tracker.observe_user_speech_end("private-message-id", 100.0)
        tracker.observe_interviewer_audio("private-response-id", 100.25)
        tracker.observe_interruption(
            occurred_at=101.0,
            confirmed_message_ids=("private-interrupted-response",),
            has_confirmed_prefix=True,
        )
        tracker.observe_interviewer_audio("private-interrupted-response", 101.1)
        tracker.observe_interviewer_audio("private-recovery-response", 101.4)

        event_attributes = [
            span.attributes
            for span in tracer.spans
            if span.name == "interviewer_semantic_event"
        ]
        self.assertEqual(
            event_attributes[0]["meelni.interviewer.latency_ms"], 250.0
        )
        self.assertAlmostEqual(
            event_attributes[-1]["meelni.interviewer.recovery_latency_ms"],
            400.0,
        )
        serialized = json.dumps(event_attributes)
        self.assertNotIn("private-message-id", serialized)
        self.assertNotIn("private-response-id", serialized)
        self.assertNotIn("private-interrupted-response", serialized)
        self.assertNotIn("private-recovery-response", serialized)

    def test_telemetry_failure_never_raises_or_changes_callers(self):
        tracer = FakeTracer(fail_after=1)
        observability = create_interviewer_observability(
            configured_env(),
            tracer=tracer,
            clock=lambda: 1787102400.0,
            id_factory=lambda: RUNTIME_UUID,
        )

        self.assertFalse(observability.record_phase("opening"))
        observability.record_fallback("provider_failure", source="runtime")
        observability.record_close(reason="runtime_closed", outcome="observed")
        observability.close()
        observability.close()

    def test_tracing_remains_default_off_under_existing_opik_gate(self):
        observability = create_interviewer_observability(
            {}, id_factory=lambda: RUNTIME_UUID
        )
        self.assertFalse(observability.enabled)
        self.assertFalse(observability.record_phase("opening"))

    def test_shared_wire_parity_rejects_year_zero_and_unicode_case_fold(self):
        fixtures_path = (
            Path(__file__).parent.parent
            / "packages"
            / "test-fixtures"
            / "interviewer-observability-wire.json"
        )
        fixtures = json.loads(fixtures_path.read_text(encoding="utf-8"))

        for fixture in fixtures:
            with self.subTest(name=fixture["name"]):
                self.assertEqual(
                    is_interviewer_observability_event(fixture["event"]),
                    fixture["valid"],
                )

    def test_transcript_drain_settles_before_slow_failing_tracer_close(self):
        sequence = []

        async def drain():
            sequence.append("drain_started")
            await asyncio.sleep(0)
            sequence.append("transcript_settled")

        def slow_failing_tracer_close():
            sequence.append("tracer_close_started")
            time.sleep(0.01)
            sequence.append("tracer_close_failed")
            raise RuntimeError("synthetic slow tracer failure")

        asyncio.run(
            drain_transcript_before_observability_close(
                drain=drain,
                close=slow_failing_tracer_close,
            )
        )

        self.assertEqual(
            sequence,
            [
                "drain_started",
                "transcript_settled",
                "tracer_close_started",
                "tracer_close_failed",
            ],
        )


if __name__ == "__main__":
    unittest.main()
