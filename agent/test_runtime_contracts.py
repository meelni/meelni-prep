#!/usr/bin/env python3
"""Runtime contract tests for the LiveKit interview agent."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.config import parse_room_metadata
from shared.runtime_config import DEFAULT_INTERVIEW_RUNTIME_CONFIG, get_model_config, get_tts_config
from shared.transcript_events import TRANSCRIPT_DATA_TOPIC, create_transcript_event


class RuntimeContractTests(unittest.TestCase):
    def test_parse_room_metadata_accepts_production_question_shape(self):
        metadata = parse_room_metadata(json.dumps({
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

    def test_parse_room_metadata_uses_consistent_defaults_on_bad_json(self):
        metadata = parse_room_metadata("not-json")

        self.assertEqual(metadata["round_type"], "product_sense")
        self.assertIsNone(metadata["question"])
        self.assertEqual(metadata["config"], DEFAULT_INTERVIEW_RUNTIME_CONFIG)

    def test_runtime_helpers_extract_model_and_tts_config(self):
        config = {
            **DEFAULT_INTERVIEW_RUNTIME_CONFIG,
            "voice": "voice-1",
            "tts_model": "elevenlabs/model:voice-1",
            "speed": 1.15,
        }

        self.assertEqual(get_model_config(config), {
            "stt_model": DEFAULT_INTERVIEW_RUNTIME_CONFIG["stt_model"],
            "llm_model": DEFAULT_INTERVIEW_RUNTIME_CONFIG["llm_model"],
            "tts_model": "elevenlabs/model:voice-1",
        })
        self.assertEqual(get_tts_config(config)["voice"], "voice-1")
        self.assertEqual(get_tts_config(config)["speed"], 1.15)

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


if __name__ == "__main__":
    unittest.main()
