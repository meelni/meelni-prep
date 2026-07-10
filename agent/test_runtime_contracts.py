#!/usr/bin/env python3
"""Runtime contract tests for the LiveKit interview agent."""

import asyncio
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))

from shared.config import parse_room_metadata
from shared.runtime_events import create_runtime_event
from shared.runtime_config import DEFAULT_INTERVIEW_RUNTIME_CONFIG, get_model_config, get_tts_config
from shared.session_deadline import (
    DeadlineEnforcer,
    cancel_deadline_watchdog,
    is_deadline_reached,
    normalize_duration_minutes,
    parse_deadline_at,
    watch_session_deadline,
)
from shared.transcript_events import (
    TRANSCRIPT_DATA_TOPIC,
    create_transcript_event,
    create_transcript_event_from_message,
    is_transcript_event,
    publish_transcript_event,
)
from demo.runtime import (
    create_demo_deadline,
    resolve_demo_timing,
    run_bounded,
    stop_then_run_bounded,
)


class RuntimeContractTests(unittest.TestCase):
    def test_interview_agent_keeps_room_io_open_for_reconnect_grace(self):
        source = (Path(__file__).parent / "interview" / "agent.py").read_text()

        self.assertIn(
            "room_options=room_io.RoomOptions(close_on_disconnect=False)",
            source,
        )

    def test_public_demo_timing_is_server_configured_but_hard_capped(self):
        self.assertEqual(resolve_demo_timing({"duration_seconds": 120}).duration_seconds, 120)
        self.assertEqual(resolve_demo_timing({"duration_seconds": 120}).warning_seconds, 90)
        self.assertEqual(resolve_demo_timing({"duration_seconds": 600}).duration_seconds, 120)
        self.assertEqual(resolve_demo_timing({"duration_seconds": 1}).duration_seconds, 60)
        self.assertEqual(resolve_demo_timing({"duration_seconds": True}).duration_seconds, 120)

    def test_public_demo_deadline_uses_monotonic_elapsed_time(self):
        deadline = create_demo_deadline(
            resolve_demo_timing({"duration_seconds": 120}),
            started_at=500.25,
        )
        self.assertEqual(deadline.warning_at, 590.25)
        self.assertEqual(deadline.ends_at, 620.25)
        self.assertEqual(deadline.remaining_seconds(500.25), 120)
        self.assertEqual(deadline.remaining_seconds(619.5), 1)
        self.assertEqual(deadline.remaining_seconds(621), 0)
        self.assertEqual(deadline.session_end_notify_at(0.25), 620.0)

    def test_public_demo_stops_local_spend_before_bounded_delete_timeout(self):
        events = []

        async def never_finishes():
            events.append("delete_started")
            await asyncio.Future()

        with self.assertRaises(asyncio.TimeoutError):
            asyncio.run(
                stop_then_run_bounded(
                    lambda: events.append("local_stopped"),
                    never_finishes,
                    0.01,
                )
            )
        self.assertEqual(events, ["local_stopped", "delete_started"])

    def test_public_demo_connect_operation_is_bounded(self):
        async def never_connects():
            await asyncio.Future()

        with self.assertRaises(asyncio.TimeoutError):
            asyncio.run(run_bounded(never_connects, 0.01))

    def test_parse_room_metadata_accepts_production_question_shape(self):
        metadata = parse_room_metadata(json.dumps({
            "contract_version": 1,
            "session_id": "session-1",
            "deadline_at": "2026-07-09T21:30:00.000Z",
            "round_type": "product_sense",
            "question": {
                "id": "question-1",
                "text": "Design a product for students at Meta.",
                "company": "Meta",
                "type": "Product Sense",
            },
            "config": {
                "difficulty": "advanced",
            },
        }))

        self.assertEqual(metadata["session_id"], "session-1")
        self.assertEqual(metadata["deadline_at"], "2026-07-09T21:30:00.000Z")
        self.assertEqual(metadata["round_type"], "product_sense")
        self.assertEqual(metadata["question"]["text"], "Design a product for students at Meta.")
        self.assertEqual(metadata["question"]["question_text"], "Design a product for students at Meta.")
        self.assertEqual(metadata["config"]["difficulty"], "advanced")
        self.assertEqual(metadata["config"]["llm_model"], DEFAULT_INTERVIEW_RUNTIME_CONFIG["llm_model"])

    def test_parse_room_metadata_accepts_legacy_question_shape(self):
        metadata = parse_room_metadata(json.dumps({
            "contract_version": 1,
            "session_id": "session-legacy",
            "round_type": "strategy",
            "question": {
                "question_id": "legacy-question-1",
                "question_text": "Should Notion build a calendar?",
                "company": "Notion",
                "question_type": "Strategy",
            },
            "config": {},
        }))

        self.assertEqual(metadata["question"]["id"], "legacy-question-1")
        self.assertEqual(metadata["question"]["text"], "Should Notion build a calendar?")
        self.assertEqual(metadata["question"]["type"], "Strategy")
        self.assertIsNone(metadata["deadline_at"])

    def test_parse_room_metadata_rejects_noncanonical_deadlines(self):
        for deadline_at in (
            "",
            "2026-07-09T21:30:00Z",
            "2026-07-09T21:30:00.000+00:00",
            "not-a-date",
            1783632600000,
        ):
            with self.subTest(deadline_at=deadline_at):
                with self.assertRaisesRegex(ValueError, "Invalid interview room metadata"):
                    parse_room_metadata(json.dumps({
                        "contract_version": 1,
                        "session_id": "session-invalid-deadline",
                        "deadline_at": deadline_at,
                        "round_type": "product_sense",
                        "config": {},
                    }))

    def test_parse_room_metadata_fails_closed_on_bad_json(self):
        with self.assertRaisesRegex(ValueError, "Invalid interview room metadata"):
            parse_room_metadata("not-json")

    def test_parse_room_metadata_requires_versioned_session_correlation(self):
        with self.assertRaisesRegex(ValueError, "Invalid interview room metadata"):
            parse_room_metadata(json.dumps({
                "contract_version": 1,
                "round_type": "product_sense",
                "config": {},
            }))

    def test_runtime_helpers_extract_model_and_tts_config(self):
        config = {
            **DEFAULT_INTERVIEW_RUNTIME_CONFIG,
            "voice": "voice-1",
            "tts_model": "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9",
            "speed": 1.15,
        }

        self.assertEqual(get_model_config(config), {
            "stt_model": DEFAULT_INTERVIEW_RUNTIME_CONFIG["stt_model"],
            "llm_model": DEFAULT_INTERVIEW_RUNTIME_CONFIG["llm_model"],
            "tts_model": "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9",
        })
        self.assertEqual(get_tts_config(config)["voice"], "voice-1")
        self.assertEqual(get_tts_config(config)["speed"], 1.15)

    def test_runtime_helpers_reject_unknown_model_overrides(self):
        config = {
            **DEFAULT_INTERVIEW_RUNTIME_CONFIG,
            "stt_model": "unknown/stt",
            "llm_model": "openai/expensive-model",
            "tts_model": "unknown/tts:voice",
        }

        self.assertEqual(get_model_config(config), {
            "stt_model": DEFAULT_INTERVIEW_RUNTIME_CONFIG["stt_model"],
            "llm_model": DEFAULT_INTERVIEW_RUNTIME_CONFIG["llm_model"],
            "tts_model": DEFAULT_INTERVIEW_RUNTIME_CONFIG["tts_model"],
        })

    def test_runtime_config_normalizes_invalid_cross_runtime_values(self):
        metadata = parse_room_metadata(json.dumps({
            "contract_version": 1,
            "session_id": "session-invalid-config",
            "round_type": "product_sense",
            "mode": "video_only",
            "question": {
                "id": "question-1",
                "text": "Design a product.",
                "company": 42,
                "type": "Product Sense",
                "askedAt": 123,
            },
            "config": {
                "feedback_mode": "always",
                "hintMode": "always",
                "speed": True,
                "volume": "loud",
                "duration": 60,
                "emotion": "",
                "persona": 42,
            },
        }))

        self.assertIsNone(metadata["mode"])
        self.assertIsNone(metadata["question"]["company"])
        self.assertIsNone(metadata["question"]["askedAt"])
        self.assertEqual(metadata["config"]["feedback_mode"], "end_only")
        self.assertEqual(metadata["config"]["hintMode"], "off")
        self.assertEqual(metadata["config"]["speed"], 1.0)
        self.assertEqual(metadata["config"]["volume"], 1.0)
        self.assertEqual(metadata["config"]["duration"], 30)
        self.assertEqual(metadata["config"]["emotion"], "professional")
        self.assertIsNone(metadata["config"]["persona"])

        malformed = parse_room_metadata(json.dumps({
            "contract_version": 1,
            "session_id": "session-malformed-containers",
            "round_type": "product_sense",
            "config": ["not", "an", "object"],
            "question": {"id": 42, "text": 99, "type": True, "company": None},
        }))
        self.assertEqual(malformed["config"]["feedback_mode"], "end_only")
        self.assertEqual(malformed["question"]["id"], "")
        self.assertEqual(malformed["question"]["text"], "")
        self.assertEqual(malformed["question"]["type"], "")

    def test_duration_and_deadline_policy_matches_typescript_boundaries(self):
        for duration in (15, 30, 45):
            self.assertEqual(normalize_duration_minutes(duration), duration)
        for duration in (None, True, "15", 0, 15.5, 60, float("inf")):
            self.assertEqual(normalize_duration_minutes(duration), 30)

        parsed = parse_deadline_at("2026-07-09T21:30:00.123Z")
        self.assertEqual(
            parsed,
            datetime(2026, 7, 9, 21, 30, 0, 123000, tzinfo=timezone.utc),
        )

    def test_create_transcript_event_matches_frontend_contract(self):
        event = create_transcript_event(
            event_id="transcript-event-1",
            writer_id="writer-1",
            sequence=1,
            session_id="session-1",
            room_name="interview-room-1",
            speaker="interviewer",
            text="Let's start with the product goal.",
            started_at=1782600000,
            ended_at=1782600008,
            audio_duration_ms=8000,
            section="prompt",
        )

        self.assertEqual(TRANSCRIPT_DATA_TOPIC, "transcript")
        self.assertEqual(event, {
            "contract_version": 2,
            "event_id": "transcript-event-1",
            "writer_id": "writer-1",
            "sequence": 1,
            "session_id": "session-1",
            "room_name": "interview-room-1",
            "speaker": "interviewer",
            "text": "Let's start with the product goal.",
            "is_final": True,
            "started_at": "2026-06-27T22:40:00.000Z",
            "ended_at": "2026-06-27T22:40:08.000Z",
            "audio_duration_ms": 8000,
            "section": "prompt",
            "delivery_state": "delivered",
        })

    def test_create_transcript_event_rejects_incomplete_timing(self):
        with self.assertRaisesRegex(ValueError, "invalid transcript event"):
            create_transcript_event(
                event_id="transcript-event-1",
                writer_id="writer-1",
                sequence=1,
                session_id="session-1",
                room_name="interview-room-1",
                speaker="user",
                text="A response.",
                started_at=1782600000,
                ended_at=1782600000,
                audio_duration_ms=0,
                section="response",
            )

    def test_create_transcript_event_marks_partial_delivery(self):
        event = create_transcript_event(
            event_id="transcript-event-partial",
            writer_id="writer-1",
            sequence=2,
            session_id="session-1",
            room_name="interview-room-1",
            speaker="interviewer",
            text="A heard fragment.",
            started_at=1782600000,
            ended_at=1782600002,
            audio_duration_ms=2000,
            section="follow_up",
            delivery_state="partially_delivered",
        )

        self.assertEqual(event["delivery_state"], "partially_delivered")

    def test_shared_transcript_golden_cases_match_typescript(self):
        fixture_path = (
            Path(__file__).parent.parent
            / "packages"
            / "test-fixtures"
            / "transcript-events.json"
        )
        cases = json.loads(fixture_path.read_text(encoding="utf-8"))
        for case in cases["valid"]:
            self.assertTrue(is_transcript_event(case["event"]), case["name"])
        for case in cases["invalid"]:
            self.assertFalse(is_transcript_event(case["event"]), case["name"])

    def test_committed_message_normalizer_uses_writer_scoped_identity_and_timing(self):
        message = SimpleNamespace(
            id="message-1",
            role="user",
            interrupted=False,
            text_content="A measured response.",
            metrics={
                "started_speaking_at": 1782600000,
                "stopped_speaking_at": 1782600002.5,
            },
        )
        event = create_transcript_event_from_message(
            message=message,
            writer_id="writer-1",
            sequence=1,
            session_id="session-1",
            room_name="room-1",
            section="product_sense",
        )

        self.assertIsNotNone(event)
        self.assertEqual(event["event_id"], "writer-1:message-1")
        self.assertEqual(event["writer_id"], "writer-1")
        self.assertEqual(event["audio_duration_ms"], 2500)

    def test_committed_message_normalizer_drops_interrupted_and_unmeasured_items(self):
        interrupted = SimpleNamespace(
            id="message-1",
            role="assistant",
            interrupted=True,
            text_content="Generated but not fully heard.",
            metrics={
                "started_speaking_at": 1782600000,
                "stopped_speaking_at": 1782600001,
            },
        )
        unmeasured = SimpleNamespace(
            id="message-2",
            role="user",
            interrupted=False,
            text_content="Missing timing.",
            metrics={},
        )

        for message in (interrupted, unmeasured):
            self.assertIsNone(
                create_transcript_event_from_message(
                    message=message,
                    writer_id="writer-1",
                    sequence=1,
                    session_id="session-1",
                    room_name="room-1",
                    section="product_sense",
                )
            )

    def test_replacement_writer_scopes_sequence_in_the_same_room(self):
        message = SimpleNamespace(
            id="message-1",
            role="user",
            interrupted=False,
            text_content="A response.",
            metrics={
                "started_speaking_at": 1782600000,
                "stopped_speaking_at": 1782600001,
            },
        )
        events = [
            create_transcript_event_from_message(
                message=message,
                writer_id=writer_id,
                sequence=1,
                session_id="session-1",
                room_name="room-1",
                section="product_sense",
            )
            for writer_id in ("writer-a", "writer-b")
        ]

        self.assertEqual([event["sequence"] for event in events], [1, 1])
        self.assertEqual(
            [event["writer_id"] for event in events],
            ["writer-a", "writer-b"],
        )
        self.assertNotEqual(events[0]["event_id"], events[1]["event_id"])

    def test_runtime_lifecycle_event_matches_typescript_contract(self):
        event = create_runtime_event(
            event_id="runtime-event-1",
            session_id="session-1",
            event_type="runtime_activated",
            occurred_at="2026-07-09T21:00:00.000Z",
            runtime_ref={"provider": "voice", "id": "runtime-1"},
        )

        self.assertEqual(event["contract_version"], 1)
        self.assertEqual(event["type"], "runtime_activated")

    def test_provider_failure_runtime_event_requires_failure_details(self):
        with self.assertRaisesRegex(ValueError, "failure details"):
            create_runtime_event(
                event_id="runtime-event-2",
                session_id="session-1",
                event_type="provider_failed",
                occurred_at="2026-07-09T21:00:00.000Z",
            )


class TranscriptPublisherTests(unittest.IsolatedAsyncioTestCase):
    async def test_publish_transcript_event_uses_canonical_topic_once(self):
        calls = []

        async def publish_data(payload, *, topic):
            calls.append((json.loads(payload.decode("utf-8")), topic))

        participant = SimpleNamespace(publish_data=publish_data)
        event = create_transcript_event(
            event_id="event-1",
            writer_id="writer-1",
            sequence=1,
            session_id="session-1",
            room_name="room-1",
            speaker="user",
            text="Measured.",
            started_at=1782600000,
            ended_at=1782600001,
            audio_duration_ms=1000,
            section="product_sense",
        )

        await publish_transcript_event(participant, event)

        self.assertEqual(calls, [(event, TRANSCRIPT_DATA_TOPIC)])


class SessionDeadlineWatchdogTests(unittest.IsolatedAsyncioTestCase):
    def test_deadline_boundary_rejects_runtime_before_start(self):
        deadline = datetime(2026, 7, 9, 21, 30, tzinfo=timezone.utc)

        self.assertFalse(
            is_deadline_reached(
                deadline,
                now=lambda: datetime(
                    2026, 7, 9, 21, 29, 59, 999999, tzinfo=timezone.utc
                ),
            )
        )
        self.assertTrue(is_deadline_reached(deadline, now=lambda: deadline))

    async def test_already_expired_deadline_closes_and_terminates_without_sleep(self):
        calls = []

        async def fail_if_sleeping(_delay):
            self.fail("already-expired deadlines must not sleep")

        async def close_session():
            calls.append("close")

        async def terminate_room():
            calls.append("terminate")

        enforced = await watch_session_deadline(
            deadline_at=datetime(2026, 7, 9, 21, 30, tzinfo=timezone.utc),
            close_session=close_session,
            terminate_room=terminate_room,
            enforcer=DeadlineEnforcer(),
            now=lambda: datetime(2026, 7, 9, 21, 30, 1, tzinfo=timezone.utc),
            sleep=fail_if_sleeping,
        )

        self.assertTrue(enforced)
        self.assertEqual(calls, ["close", "terminate"])

    async def test_deadline_immediately_closes_during_user_or_agent_speech_without_drain(self):
        for runtime_state in ("user_speaking", "agent_speaking"):
            calls = []

            async def close_session(*args, **kwargs):
                calls.append(("close", args, kwargs, runtime_state))

            async def terminate_room():
                calls.append(("terminate", runtime_state))

            await watch_session_deadline(
                deadline_at=datetime(2026, 7, 9, 21, 30, tzinfo=timezone.utc),
                close_session=close_session,
                terminate_room=terminate_room,
                enforcer=DeadlineEnforcer(),
                now=lambda: datetime(2026, 7, 9, 21, 30, tzinfo=timezone.utc),
            )

            self.assertEqual(
                calls,
                [
                    ("close", (), {}, runtime_state),
                    ("terminate", runtime_state),
                ],
            )

    async def test_duplicate_watchdogs_share_one_close_and_room_termination(self):
        close_started = asyncio.Event()
        release_close = asyncio.Event()
        calls = []
        enforcer = DeadlineEnforcer()
        deadline_at = datetime(2026, 7, 9, 21, 30, tzinfo=timezone.utc)

        async def close_session():
            calls.append("close")
            close_started.set()
            await release_close.wait()

        async def terminate_room():
            calls.append("terminate")

        def create_watchdog():
            return asyncio.create_task(
                watch_session_deadline(
                    deadline_at=deadline_at,
                    close_session=close_session,
                    terminate_room=terminate_room,
                    enforcer=enforcer,
                    now=lambda: deadline_at,
                )
            )

        first = create_watchdog()
        await close_started.wait()
        second = create_watchdog()
        await asyncio.sleep(0)
        release_close.set()

        results = await asyncio.gather(first, second)
        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(calls, ["close", "terminate"])

    async def test_normal_session_close_cancels_pending_watchdog_without_enforcement(self):
        sleep_started = asyncio.Event()
        never_wake = asyncio.Event()
        calls = []
        enforcer = DeadlineEnforcer()

        async def sleep(_delay):
            sleep_started.set()
            await never_wake.wait()

        async def close_session():
            calls.append("close")

        async def terminate_room():
            calls.append("terminate")

        task = asyncio.create_task(
            watch_session_deadline(
                deadline_at=datetime(2026, 7, 9, 21, 45, tzinfo=timezone.utc),
                close_session=close_session,
                terminate_room=terminate_room,
                enforcer=enforcer,
                now=lambda: datetime(2026, 7, 9, 21, 30, tzinfo=timezone.utc),
                sleep=sleep,
            )
        )
        await sleep_started.wait()

        self.assertTrue(cancel_deadline_watchdog(task, enforcer))
        with self.assertRaises(asyncio.CancelledError):
            await task

        self.assertFalse(enforcer.enforcement_started)
        self.assertEqual(calls, [])

    async def test_room_termination_runs_even_when_immediate_close_fails(self):
        calls = []

        async def close_session():
            calls.append("close")
            raise RuntimeError("close failed")

        async def terminate_room():
            calls.append("terminate")

        with self.assertRaisesRegex(RuntimeError, "close failed"):
            await watch_session_deadline(
                deadline_at=datetime(2026, 7, 9, 21, 30, tzinfo=timezone.utc),
                close_session=close_session,
                terminate_room=terminate_room,
                enforcer=DeadlineEnforcer(),
                now=lambda: datetime(2026, 7, 9, 21, 30, tzinfo=timezone.utc),
            )

        self.assertEqual(calls, ["close", "terminate"])


if __name__ == "__main__":
    unittest.main()
