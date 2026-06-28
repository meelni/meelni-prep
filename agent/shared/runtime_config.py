"""Runtime defaults and config helpers for the interview agent."""

from copy import deepcopy
from typing import Any, Dict

DEFAULT_INTERVIEW_RUNTIME_CONFIG: Dict[str, Any] = {
    "difficulty": "intermediate",
    "voice": "cgSgspJ2msm6clMCkdW9",
    "speed": 1.0,
    "emotion": "professional",
    "volume": 1.0,
    "duration": 30,
    "feedback_mode": "end_only",
    "persona": None,
    "stt_model": "deepgram/nova-3",
    "llm_model": "openai/gpt-4.1-mini",
    "tts_model": "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
}


def normalize_runtime_config(config: Dict[str, Any] | None) -> Dict[str, Any]:
    """Apply stable defaults while preserving extra runtime fields."""
    source = config or {}
    normalized = deepcopy(DEFAULT_INTERVIEW_RUNTIME_CONFIG)
    normalized.update({key: value for key, value in source.items() if value is not None})

    for key in ("difficulty", "voice", "feedback_mode", "stt_model", "llm_model", "tts_model"):
        if not isinstance(normalized.get(key), str) or not normalized[key].strip():
            normalized[key] = DEFAULT_INTERVIEW_RUNTIME_CONFIG[key]

    for key in ("speed", "volume", "duration"):
        value = normalized.get(key)
        if not isinstance(value, (int, float)):
            normalized[key] = DEFAULT_INTERVIEW_RUNTIME_CONFIG[key]

    return normalized


def get_model_config(config: Dict[str, Any]) -> Dict[str, str]:
    """Extract LiveKit inference model names from normalized runtime config."""
    normalized = normalize_runtime_config(config)
    return {
        "stt_model": normalized["stt_model"],
        "llm_model": normalized["llm_model"],
        "tts_model": normalized["tts_model"],
    }


def get_tts_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """Extract voice parameters used for logging and future TTS adapters."""
    normalized = normalize_runtime_config(config)
    return {
        "voice": normalized["voice"],
        "speed": normalized["speed"],
        "emotion": normalized["emotion"],
        "volume": normalized["volume"],
    }
