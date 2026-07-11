"""Runtime defaults and config helpers for the interview agent."""

import math
import os
from typing import Any, Dict

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
    "persona": None,
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


def normalize_runtime_config(config: Dict[str, Any] | None) -> Dict[str, Any]:
    """Combine accepted metadata preferences with server-owned runtime settings."""
    source = config or {}
    normalized = dict(DEFAULT_INTERVIEW_RUNTIME_CONFIG)

    if source.get("difficulty") in {"beginner", "intermediate", "advanced"}:
        normalized["difficulty"] = source["difficulty"]
    if source.get("duration") in {15, 30, 45}:
        normalized["duration"] = source["duration"]
    if source.get("hintMode") in {"off", "gentle", "coach"}:
        normalized["hintMode"] = source["hintMode"]
    if source.get("persona") is None or isinstance(source.get("persona"), str):
        normalized["persona"] = source.get("persona")
    normalized["questionPreference"] = _normalize_question_preference(
        source.get("questionPreference")
    )

    for key, env_name in RUNTIME_ENV.items():
        value = os.getenv(env_name)
        if key in {"speed", "volume"}:
            normalized[key] = _env_number(value, DEFAULT_INTERVIEW_RUNTIME_CONFIG[key])
        elif value and value.strip():
            normalized[key] = value.strip()

    return normalized


def _env_number(value: str | None, fallback: float) -> float:
    try:
        parsed = float(value) if value else fallback
    except ValueError:
        return fallback
    return parsed if math.isfinite(parsed) else fallback


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
