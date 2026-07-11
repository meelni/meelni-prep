"""Provider-neutral lifecycle fact contract emitted by interview runtimes."""

from datetime import datetime
import re
from typing import Any, Awaitable, Callable, Dict, Optional


INTERVIEW_RUNTIME_EVENT_CONTRACT_VERSION = 1
INTERVIEW_RUNTIME_EVENT_TOPIC = "interview.lifecycle.v1"
INTERVIEW_RUNTIME_EVENT_TYPES = {
    "runtime_provisioned",
    "runtime_activated",
    "connection_lost",
    "connection_restored",
    "provider_failed",
}
SAFE_FAILURE_CODE = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,63}$")
PROVIDER_FAILURE_CODES = {
    "stt_error": "stt_provider_failed",
    "llm_error": "llm_provider_failed",
    "tts_error": "tts_provider_failed",
    "realtime_model_error": "realtime_model_provider_failed",
    "interruption_detection_error": "turn_detection_provider_failed",
}
DEFAULT_PROVIDER_FAILURE_CODE = "voice_runtime_provider_failed"
ALLOWED_PROVIDER_FAILURE_RUNTIMES = {"livekit"}
ALLOWED_PROVIDER_FAILURE_CODES = set(PROVIDER_FAILURE_CODES.values()) | {
    DEFAULT_PROVIDER_FAILURE_CODE,
    "voice_session_construction_failed",
    "voice_session_start_failed",
    "deadline_enforcement_failed",
    "initial_greeting_failed",
}


def provider_failure_code(error_type: object) -> str:
    """Map LiveKit's typed error category without retaining provider payloads."""
    if not isinstance(error_type, str):
        return DEFAULT_PROVIDER_FAILURE_CODE
    return PROVIDER_FAILURE_CODES.get(
        error_type,
        DEFAULT_PROVIDER_FAILURE_CODE,
    )


async def stop_provider_runtime_then_report(
    *,
    disable_input: Callable[[], None],
    close_session: Callable[[], Awaitable[None]],
    terminate_room: Callable[[], Awaitable[None]],
    shutdown: Callable[[], None],
    report_failure: Callable[[], Awaitable[bool]],
) -> bool:
    """Stop every local runtime boundary before awaiting durable reporting."""
    stop_error: BaseException | None = None
    try:
        disable_input()
    except BaseException as error:
        stop_error = error
    try:
        await close_session()
    except BaseException as error:
        if stop_error is None:
            stop_error = error
    try:
        await terminate_room()
    except BaseException as error:
        if stop_error is None:
            stop_error = error
    try:
        shutdown()
    except BaseException as error:
        if stop_error is None:
            stop_error = error

    report_error: BaseException | None = None
    persisted = False
    try:
        persisted = await report_failure()
    except BaseException as error:
        report_error = error

    if stop_error is not None:
        if report_error is not None:
            raise stop_error from report_error
        raise stop_error
    if report_error is not None:
        raise report_error
    return persisted


def create_runtime_event(
    *,
    event_id: str,
    session_id: str,
    event_type: str,
    occurred_at: str,
    runtime_ref: Optional[Dict[str, str]] = None,
    failure: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build and validate one versioned runtime lifecycle fact."""
    event: Dict[str, Any] = {
        "contract_version": INTERVIEW_RUNTIME_EVENT_CONTRACT_VERSION,
        "event_id": event_id,
        "session_id": session_id,
        "type": event_type,
        "occurred_at": occurred_at,
    }
    if runtime_ref is not None:
        event["runtime_ref"] = runtime_ref
    if failure is not None:
        event["failure"] = failure
    if not is_runtime_event(event):
        if event_type == "provider_failed" and not failure:
            raise ValueError("Provider failure events require failure details")
        raise ValueError("Runtime lifecycle event is malformed")
    return event


def is_runtime_event(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    base_fields = {
        "contract_version", "event_id", "session_id", "type", "occurred_at"
    }
    optional_fields = {"runtime_ref", "failure"}
    if not set(value).issubset(base_fields | optional_fields) or not base_fields.issubset(value):
        return False
    if (
        value.get("contract_version") != INTERVIEW_RUNTIME_EVENT_CONTRACT_VERSION
        or not isinstance(value.get("event_id"), str)
        or not value["event_id"].strip()
        or not isinstance(value.get("session_id"), str)
        or not value["session_id"].strip()
        or value.get("type") not in INTERVIEW_RUNTIME_EVENT_TYPES
    ):
        return False
    try:
        _validate_iso_timestamp(value.get("occurred_at"))
    except ValueError:
        return False
    runtime_ref = value.get("runtime_ref")
    if runtime_ref is not None and (
        not isinstance(runtime_ref, dict)
        or set(runtime_ref) != {"provider", "id"}
        or not isinstance(runtime_ref.get("provider"), str)
        or not runtime_ref["provider"].strip()
        or not isinstance(runtime_ref.get("id"), str)
        or not runtime_ref["id"].strip()
    ):
        return False
    failure = value.get("failure")
    if value.get("type") == "provider_failed":
        return (
            isinstance(runtime_ref, dict)
            and runtime_ref.get("provider") in ALLOWED_PROVIDER_FAILURE_RUNTIMES
            and isinstance(failure, dict)
            and set(failure) == {"reason", "code", "retryable"}
            and failure.get("reason") == "provider_failure"
            and isinstance(failure.get("code"), str)
            and SAFE_FAILURE_CODE.fullmatch(failure["code"]) is not None
            and failure["code"] in ALLOWED_PROVIDER_FAILURE_CODES
            and isinstance(failure.get("retryable"), bool)
        )
    return failure is None


def _validate_iso_timestamp(value: str) -> None:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise ValueError("Runtime lifecycle events require an ISO timestamp") from error
