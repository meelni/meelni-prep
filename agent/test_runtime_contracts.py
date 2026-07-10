#!/usr/bin/env python3
"""Runtime contract tests for the LiveKit interview agent."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.config import parse_room_metadata
from shared.runtime_events import create_runtime_event
from shared.runtime_config import DEFAULT_INTERVIEW_RUNTIME_CONFIG, get_model_config, get_tts_config
from shared.transcript_events import TRANSCRIPT_DATA_TOPIC, create_transcript_event


class RuntimeContractTests(unittest.TestCase):
    def test_parse_room_metadata_accepts_production_question_shape(self):
        metadata = parse_room_metadata(json.dumps({
            "contract_version": 1,
            "session_id": "session-1",
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

    def test_create_transcript_event_matches_frontend_contract(self):
        event = create_transcript_event(
            speaker="interviewer",
            text="Let's start with the product goal.",
            timestamp=1782600000,
        )

        self.assertEqual(TRANSCRIPT_DATA_TOPIC, "transcript")
        self.assertEqual(event, {
            "speaker": "interviewer",
            "text": "Let's start with the product goal.",
            "timestamp": 1782600000,
            "is_final": True,
        })

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


if __name__ == "__main__":
    unittest.main()
