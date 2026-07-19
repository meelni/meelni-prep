"""Runtime defaults and config helpers for the interview agent."""

import math
import os
import re
from typing import Any, Dict

from shared.session_deadline import normalize_duration_minutes

DEFAULT_INTERVIEW_RUNTIME_CONFIG: Dict[str, Any] = {
    "difficulty": "intermediate",
    "voice": "cgSgspJ2msm6clMCkdW9",
    "speed": 1.0,
    "emotion": "professional",
    "volume": 1.0,
    "duration": 30,
    "feedback_mode": "end_only",
    "hintMode": "off",
    "questionPreference": {"recency": "very_recent", "recentDays": 365},
    "stt_model": "deepgram/nova-3",
    "llm_model": "openai/gpt-4.1-mini",
    "tts_model": "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
}

RUNTIME_ENV = {
    "voice": "MEELNI_INTERVIEW_VOICE",
    "speed": "MEELNI_INTERVIEW_TTS_SPEED",
    "emotion": "MEELNI_INTERVIEW_TTS_EMOTION",
    "volume": "MEELNI_INTERVIEW_TTS_VOLUME",
    "stt_model": "MEELNI_INTERVIEW_STT_MODEL",
    "llm_model": "MEELNI_INTERVIEW_LLM_MODEL",
    "tts_model": "MEELNI_INTERVIEW_TTS_MODEL",
}

RUNTIME_NUMERIC_RANGES = {
    "speed": (0.6, 1.5),
    "volume": (0.5, 2.0),
}

DECIMAL_NUMBER_PATTERN = re.compile(
    r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$"
)


def normalize_runtime_config(config: Dict[str, Any] | None) -> Dict[str, Any]:
    """Combine accepted metadata preferences with server-owned runtime settings."""
    source = config or {}
    normalized = dict(DEFAULT_INTERVIEW_RUNTIME_CONFIG)

    if source.get("difficulty") in {"beginner", "intermediate", "advanced"}:
        normalized["difficulty"] = source["difficulty"]
    if source.get("duration") in {15, 30, 45}:
        normalized["duration"] = source["duration"]
    # Full mock interviews never use in-session hints. Legacy non-off values
    # remain readable but normalize to the canonical off behavior.
    normalized["hintMode"] = "off"
    normalized["questionPreference"] = _normalize_question_preference(
        source.get("questionPreference")
    )

    for key, env_name in RUNTIME_ENV.items():
        value = os.getenv(env_name)
        if key in RUNTIME_NUMERIC_RANGES:
            minimum, maximum = RUNTIME_NUMERIC_RANGES[key]
            normalized[key] = _env_number(
                value,
                DEFAULT_INTERVIEW_RUNTIME_CONFIG[key],
                minimum,
                maximum,
            )
        else:
            normalized[key] = _env_string(
                value, DEFAULT_INTERVIEW_RUNTIME_CONFIG[key]
            )
    normalized["duration"] = normalize_duration_minutes(normalized.get("duration"))

    return normalized


def _env_string(value: str | None, fallback: str) -> str:
    trimmed = value.strip() if value else ""
    return trimmed or fallback


def _env_number(
    value: str | None, fallback: float, minimum: float, maximum: float
) -> float:
    trimmed = value.strip() if value else ""
    if not DECIMAL_NUMBER_PATTERN.fullmatch(trimmed):
        return fallback
    try:
        parsed = float(trimmed)
    except ValueError:
        return fallback
    return (
        parsed
        if math.isfinite(parsed) and minimum <= parsed <= maximum
        else fallback
    )


def _normalize_question_preference(value: Any) -> Dict[str, Any]:
    fallback = dict(DEFAULT_INTERVIEW_RUNTIME_CONFIG["questionPreference"])
    if not isinstance(value, dict):
        return fallback
    recency = value.get("recency")
    if recency not in {"all", "recent", "very_recent"}:
        recency = fallback["recency"]
    days = value.get("recentDays")
    if isinstance(days, bool) or not isinstance(days, int) or not 0 < days <= 3650:
        days = None
    return {"recency": recency, **({"recentDays": days} if days else {})}


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
