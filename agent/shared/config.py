"""Load interview configuration from LiveKit room metadata."""

import json
import logging
from typing import Dict, Any

from shared.runtime_config import (
    DEFAULT_INTERVIEW_RUNTIME_CONFIG,
    get_tts_config,
    normalize_runtime_config,
)

logger = logging.getLogger("agent-config")


def parse_room_metadata(metadata: str) -> Dict[str, Any]:
    """
    Parse room metadata to extract interview configuration.

    Expected format:
    {
        "round_type": "product_sense",
        "question": {
            "id": "uuid",
            "text": "How do you improve Slack?",
            "company": "Dropbox",
            "type": "Product design/strategy"
        },
        "config": {
            "difficulty": "intermediate",
            "voice": "6ccbfb76...",
            "speed": 1.0,
            "emotion": "professional",
            "volume": 1.0,
            "duration": 30,
            "feedback_mode": "end_only",
            "persona": null,
            "stt_model": "deepgram/nova-3",
            "llm_model": "openai/gpt-5",
            "tts_model": "cartesia/sonic-3:6ccbfb76..."
        }
    }

    Args:
        metadata: JSON string from room.metadata

    Returns:
        Dict with round_type, question, and config keys
    """
    try:
        data = json.loads(metadata)

        round_type = data.get("round_type", "product_sense")
        config_with_defaults = normalize_runtime_config(data.get("config", {}))
        question = normalize_question(data.get("question"))

        # Log question info if provided
        if question:
            question_text = question.get("text", "")[:50]
            logger.info(f"Parsed metadata: round_type={round_type}, difficulty={config_with_defaults['difficulty']}, question='{question_text}...'")
        else:
            logger.info(f"Parsed metadata: round_type={round_type}, difficulty={config_with_defaults['difficulty']}, question=None")

        return {
            "session_id": data.get("session_id"),
            "round_type": round_type,
            "mode": data.get("mode"),
            "question": question,
            "config": config_with_defaults,
        }

    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse room metadata: {e}. Using defaults.")
        return get_fallback_room_metadata()
    except Exception as e:
        logger.error(f"Unexpected error parsing metadata: {e}. Using defaults.")
        return get_fallback_room_metadata()


def normalize_question(question: Dict[str, Any] | None) -> Dict[str, Any] | None:
    """Normalize production and legacy question-bank field names."""
    if not isinstance(question, dict):
        return None

    question_id = question.get("id") or question.get("question_id") or ""
    text = question.get("text") or question.get("question_text") or ""
    question_type = question.get("type") or question.get("question_type") or ""

    return {
        "id": question_id,
        "question_id": question_id,
        "text": text,
        "question_text": text,
        "company": question.get("company"),
        "type": question_type,
        "question_type": question_type,
        "askedAt": question.get("askedAt"),
    }


def get_fallback_room_metadata() -> Dict[str, Any]:
    """Return the default metadata shape used when room metadata is missing."""
    return {
        "session_id": None,
        "round_type": "product_sense",
        "mode": None,
        "question": None,
        "config": DEFAULT_INTERVIEW_RUNTIME_CONFIG.copy(),
    }


def extract_tts_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract TTS-specific configuration from interview config.

    Args:
        config: Interview configuration dict

    Returns:
        Dict with TTS parameters (voice, speed, emotion, volume)
    """
    return get_tts_config(config)
