"""Load interview configuration from LiveKit room metadata"""

import json
import logging
from typing import Dict, Any

logger = logging.getLogger("agent-config")


def parse_room_metadata(metadata: str) -> Dict[str, Any]:
    """
    Parse room metadata to extract interview configuration.

    Expected format:
    {
        "round_type": "product_sense",
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
            "llm_model": "openai/gpt-4.1-mini",
            "tts_model": "cartesia/sonic-3:6ccbfb76..."
        }
    }

    Args:
        metadata: JSON string from room.metadata

    Returns:
        Dict with round_type and config keys
    """
    try:
        data = json.loads(metadata)

        round_type = data.get("round_type", "product_sense")
        config = data.get("config", {})

        # Ensure all required config keys have defaults
        config_with_defaults = {
            "difficulty": config.get("difficulty", "intermediate"),
            "voice": config.get("voice", "6ccbfb76-1fc6-48f7-b71d-91ac6298247b"),  # Tessa
            "speed": config.get("speed", 1.0),
            "emotion": config.get("emotion", "professional"),
            "volume": config.get("volume", 1.0),
            "duration": config.get("duration", 30),
            "feedback_mode": config.get("feedback_mode", "end_only"),
            "persona": config.get("persona"),  # Optional
            "stt_model": config.get("stt_model", "deepgram/nova-3"),
            "llm_model": config.get("llm_model", "openai/gpt-4.1-mini"),
            "tts_model": config.get("tts_model", "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"),
        }

        logger.info(f"Parsed metadata: round_type={round_type}, difficulty={config_with_defaults['difficulty']}")

        return {
            "round_type": round_type,
            "config": config_with_defaults,
        }

    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse room metadata: {e}. Using defaults.")
        # Fallback to defaults
        return {
            "round_type": "product_sense",
            "config": {
                "difficulty": "intermediate",
                "voice": "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
                "speed": 1.0,
                "emotion": "professional",
                "volume": 1.0,
                "duration": 30,
                "feedback_mode": "end_only",
                "persona": None,
                "stt_model": "deepgram/nova-3",
                "llm_model": "openai/gpt-4.1-mini",
                "tts_model": "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
            },
        }
    except Exception as e:
        logger.error(f"Unexpected error parsing metadata: {e}. Using defaults.")
        return {
            "round_type": "product_sense",
            "config": {
                "difficulty": "intermediate",
                "voice": "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
                "speed": 1.0,
                "emotion": "professional",
                "volume": 1.0,
                "duration": 30,
                "feedback_mode": "end_only",
                "persona": None,
                "stt_model": "deepgram/nova-3",
                "llm_model": "openai/gpt-4.1-mini",
                "tts_model": "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
            },
        }


def extract_tts_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract TTS-specific configuration from interview config.

    Args:
        config: Interview configuration dict

    Returns:
        Dict with TTS parameters (voice, speed, emotion, volume)
    """
    return {
        "voice": config.get("voice", "6ccbfb76-1fc6-48f7-b71d-91ac6298247b"),
        "speed": config.get("speed", 1.0),
        "emotion": config.get("emotion", "professional"),
        "volume": config.get("volume", 1.0),
    }
