"""Canonical UTF-8 payload rules for stateful interviewer contracts."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from shared.interviewer_contract_errors import InterviewerContractError


def canonicalize_interview_brief_v2_payload(brief: dict[str, Any]) -> str:
    if not isinstance(brief, dict) or not _unicode_scalar_tree(brief):
        raise InterviewerContractError("interview_brief_v2", "invalid_payload")
    payload = {
        key: value
        for key, value in brief.items()
        if key not in {"brief_id", "payload_digest"}
    }
    try:
        return json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError, UnicodeError) as error:
        raise InterviewerContractError(
            "interview_brief_v2", "invalid_payload"
        ) from error


def calculate_interview_brief_v2_payload_digest(brief: dict[str, Any]) -> str:
    try:
        material = canonicalize_interview_brief_v2_payload(brief).encode("utf-8")
    except UnicodeError as error:
        raise InterviewerContractError(
            "interview_brief_v2", "invalid_payload"
        ) from error
    return f"sha256:{hashlib.sha256(material).hexdigest()}"


def canonicalize_interviewer_mutation_request_payload(
    request: dict[str, Any],
) -> str:
    if not isinstance(request, dict) or request.get("tool_name") not in (
        "commit_interviewer_move",
        "request_graceful_close",
    ):
        raise InterviewerContractError(
            "interviewer_tool_request", "invalid_payload"
        )
    common = {
        "contract_version": request.get("contract_version"),
        "tool_name": request.get("tool_name"),
        "session_id": request.get("session_id"),
        "writer_id": request.get("writer_id"),
        "writer_generation": request.get("writer_generation"),
        "deadline_at": request.get("deadline_at"),
        "expected_state_revision": request.get("expected_state_revision"),
        "expected_lifecycle_version": request.get(
            "expected_lifecycle_version"
        ),
    }
    payload = (
        {**common, "move": request.get("move")}
        if request["tool_name"] == "commit_interviewer_move"
        else {**common, "reason": request.get("reason")}
    )
    if not _unicode_scalar_tree(payload):
        raise InterviewerContractError(
            "interviewer_tool_request", "invalid_payload"
        )
    try:
        return json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError, UnicodeError) as error:
        raise InterviewerContractError(
            "interviewer_tool_request", "invalid_payload"
        ) from error


def calculate_interviewer_mutation_request_digest(
    request: dict[str, Any],
) -> str:
    try:
        material = canonicalize_interviewer_mutation_request_payload(
            request
        ).encode("utf-8")
    except UnicodeError as error:
        raise InterviewerContractError(
            "interviewer_tool_request", "invalid_payload"
        ) from error
    return f"sha256:{hashlib.sha256(material).hexdigest()}"


def assess_interviewer_mutation_replay(
    original: dict[str, Any], replay: dict[str, Any]
) -> str:
    mutation_names = (
        "commit_interviewer_move",
        "request_graceful_close",
    )
    if (
        not isinstance(original, dict)
        or not isinstance(replay, dict)
        or original.get("tool_name") not in mutation_names
        or replay.get("tool_name") not in mutation_names
        or original.get("idempotency_key") != replay.get("idempotency_key")
    ):
        return "different_key"
    return (
        "duplicate"
        if calculate_interviewer_mutation_request_digest(original)
        == calculate_interviewer_mutation_request_digest(replay)
        else "idempotency_conflict"
    )


def _unicode_scalar_tree(value: Any) -> bool:
    if isinstance(value, str):
        return all(
            not 0xD800 <= ord(character) <= 0xDFFF for character in value
        )
    if isinstance(value, list):
        return all(_unicode_scalar_tree(item) for item in value)
    if isinstance(value, dict):
        return all(
            isinstance(key, str)
            and _unicode_scalar_tree(key)
            and _unicode_scalar_tree(item)
            for key, item in value.items()
        )
    return True
