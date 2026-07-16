"""Load interview configuration from LiveKit room metadata."""

import json
import logging
from typing import Dict, Any

from shared.runtime_config import (
    get_tts_config,
    normalize_runtime_config,
)
from shared.session_deadline import normalize_deadline_at
from shared.safe_logging import log_exception_class
from shared.transcript_ingest import validate_internal_ingest_url

logger = logging.getLogger("agent-config")

INTERVIEW_ROOM_METADATA_CONTRACT_VERSION = 1


def parse_room_metadata(metadata: str) -> Dict[str, Any]:
    """
    Parse room metadata to extract interview configuration.

    Expected format:
    {
        "contract_version": 1,
        "session_id": "uuid",
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
        if not isinstance(data, dict):
            raise ValueError("Interview room metadata must be an object")
        if data.get("contract_version") != INTERVIEW_ROOM_METADATA_CONTRACT_VERSION:
            raise ValueError("Unsupported interview room metadata contract")
        session_id = data.get("session_id")
        if not isinstance(session_id, str) or not session_id.strip():
            raise ValueError("Interview room metadata requires session_id")
        transcript_ingest_url = validate_internal_ingest_url(
            data.get("transcript_ingest_url")
        )

        round_type = data.get("round_type")
        if round_type not in {"behavioral", "product_sense", "execution", "strategy"}:
            raise ValueError("Interview room metadata has invalid round_type")
        raw_config = data.get("config", {})
        config_with_defaults = normalize_runtime_config(
            raw_config if isinstance(raw_config, dict) else {}
        )
        question = normalize_question(data.get("question"))

        logger.info(
            "Parsed interview room metadata",
            extra={
                "round_type": round_type,
                "difficulty": config_with_defaults["difficulty"],
                "has_question": question is not None,
            },
        )

        return {
            "contract_version": INTERVIEW_ROOM_METADATA_CONTRACT_VERSION,
            "session_id": session_id,
            "transcript_ingest_url": transcript_ingest_url,
            "deadline_at": normalize_deadline_at(data.get("deadline_at")),
            "round_type": round_type,
            "mode": data.get("mode") if data.get("mode") in {"text", "voice_video"} else None,
            "question": question,
            "config": config_with_defaults,
        }

    except (json.JSONDecodeError, ValueError, TypeError) as error:
        log_exception_class(
            logger,
            logging.ERROR,
            "Invalid interview room metadata",
            error,
        )
        raise ValueError("Invalid interview room metadata") from error


def normalize_question(question: Dict[str, Any] | None) -> Dict[str, Any] | None:
    """Normalize production and legacy question-bank field names."""
    if not isinstance(question, dict):
        return None

    question_id = _string_or_default(
        question.get("id") or question.get("question_id")
    )
    text = _string_or_default(
        question.get("text") or question.get("question_text")
    )
    question_type = _string_or_default(
        question.get("type") or question.get("question_type")
    )

    return {
        "id": question_id,
        "question_id": question_id,
        "text": text,
        "question_text": text,
        "company": question.get("company") if isinstance(question.get("company"), str) else None,
        "type": question_type,
        "question_type": question_type,
        "askedAt": question.get("askedAt") if isinstance(question.get("askedAt"), str) else None,
    }


def _string_or_default(value: Any) -> str:
    return value if isinstance(value, str) and value.strip() else ""


def extract_tts_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract TTS-specific configuration from interview config.

    Args:
        config: Interview configuration dict

    Returns:
        Dict with TTS parameters (voice, speed, emotion, volume)
    """
    return get_tts_config(config)
