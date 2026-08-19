"""Pure admission, correlation, and attribution for interviewer contracts."""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

_CANONICAL_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


def assess_director_recommendation(
    recommendation: dict[str, Any],
    state: dict[str, Any],
    now: str | datetime,
) -> str:
    if recommendation["session_id"] != state["session_id"]:
        return "session_mismatch"
    if recommendation["brief_id"] != state["brief_id"]:
        return "brief_mismatch"
    writer = state["active_writer"]
    if (
        recommendation["writer_id"] != writer["writer_id"]
        or recommendation["writer_generation"] != writer["writer_generation"]
    ):
        return "stale_state"
    if recommendation["based_on_state_revision"] != state["state_revision"]:
        return "stale_state"
    if (
        recommendation["based_on_lifecycle_version"]
        != state["lifecycle_snapshot"]["version"]
    ):
        return "stale_lifecycle"
    if recommendation["source_finality"] != "finalized":
        return "source_not_final"
    if recommendation["source_turn_id"] != state["last_finalized_candidate_turn_id"]:
        return "source_turn_mismatch"
    if (
        recommendation["source_transcript_revision"]
        != state["last_finalized_candidate_transcript_revision"]
    ):
        return "source_transcript_revision_mismatch"
    if recommendation["target"]["question_id"] != state["active_question_id"]:
        return "question_mismatch"
    now_ms = _timestamp_ms(now)
    if now_ms is None:
        return "not_yet_valid"
    if state["clock"]["remaining_ms"] == 0 or now_ms >= _timestamp_ms(
        state["clock"]["deadline_at"]
    ):
        return "deadline_elapsed"
    if now_ms < _timestamp_ms(recommendation["created_at"]):
        return "not_yet_valid"
    if now_ms > _timestamp_ms(recommendation["expires_at"]):
        return "expired"
    if state["lifecycle_snapshot"]["state"] != "active":
        return "lifecycle_not_active"
    if state["speech_fenced"]:
        return "speech_fenced"
    if recommendation["move_type"] not in state["allowed_moves"]:
        return "move_not_allowed"
    return "eligible"


def assess_interviewer_tool_result_for_request(
    request: dict[str, Any],
    result: dict[str, Any],
    now: str | datetime,
) -> str:
    for field, code in (
        ("call_id", "call_id_mismatch"),
        ("tool_name", "tool_name_mismatch"),
        ("session_id", "session_mismatch"),
        ("writer_id", "writer_mismatch"),
        ("writer_generation", "writer_generation_mismatch"),
    ):
        if result[field] != request[field]:
            return code
    now_ms = _timestamp_ms(now)
    deadline_ms = _timestamp_ms(request["deadline_at"])
    if now_ms is None or deadline_ms is None or now_ms >= deadline_ms:
        return "request_expired"
    if result["status"] not in ("ok", "duplicate"):
        return "matched"
    if request["tool_name"] in ("read_interview_state", "read_interview_clock"):
        return "matched"
    expected_state_revision = request["expected_state_revision"] + (
        1
        if request["tool_name"]
        in ("commit_interviewer_move", "request_graceful_close")
        else 0
    )
    if result["observed_state_revision"] != expected_state_revision:
        return "state_revision_mismatch"
    if (
        result["observed_lifecycle_version"]
        != request["expected_lifecycle_version"]
    ):
        return "lifecycle_version_mismatch"
    if request["tool_name"] == "get_probe_candidates" and any(
        candidate["question_id"] != request["active_question_id"]
        for candidate in result["payload"]["probe_candidates"]
    ):
        return "question_mismatch"
    return "matched"


def assess_interviewer_tool_request_against_state(
    request: dict[str, Any],
    state: dict[str, Any],
    now: str | datetime,
) -> str:
    if request["session_id"] != state["session_id"]:
        return "session_mismatch"
    writer = state["active_writer"]
    if (
        request["writer_id"] != writer["writer_id"]
        or request["writer_generation"] != writer["writer_generation"]
    ):
        return "stale_writer"
    now_ms = _timestamp_ms(now)
    deadline_ms = _timestamp_ms(request["deadline_at"])
    if now_ms is None or deadline_ms is None or now_ms >= deadline_ms:
        return "request_expired"
    if request["tool_name"] in ("read_interview_state", "read_interview_clock"):
        return "eligible"
    if request["expected_state_revision"] != state["state_revision"]:
        return "stale_state"
    if (
        request["expected_lifecycle_version"]
        != state["lifecycle_snapshot"]["version"]
    ):
        return "stale_lifecycle"
    if request["tool_name"] == "get_probe_candidates":
        return (
            "eligible"
            if request["active_question_id"] == state["active_question_id"]
            else "question_mismatch"
        )
    if state["lifecycle_snapshot"]["state"] != "active":
        return "lifecycle_not_active"
    if state["speech_fenced"]:
        return "speech_fenced"
    if (
        request["tool_name"] == "commit_interviewer_move"
        and request["move"]["target"]["question_id"]
        != state["active_question_id"]
    ):
        return "question_mismatch"
    if (
        request["tool_name"] == "commit_interviewer_move"
        and now_ms > _timestamp_ms(request["move"]["expires_at"])
    ):
        return "move_expired"
    return "eligible"


def assess_interview_probe_ledger_attribution(
    entry: dict[str, Any], canonical_evidence: list[dict[str, Any]]
) -> str:
    expected = entry["delivery_evidence"]
    if expected is None:
        return "not_required"
    same_event_id = [
        evidence
        for evidence in canonical_evidence
        if evidence.get("event_id") == expected["event_id"]
    ]
    exact_identity = [
        evidence
        for evidence in same_event_id
        if evidence.get("writer_id") == expected["writer_id"]
        and evidence.get("writer_generation") == expected["writer_generation"]
        and evidence.get("sequence") == expected["sequence"]
    ]
    if not exact_identity:
        return "missing_evidence" if not same_event_id else "identity_mismatch"
    if len({_canonical_evidence_signature(item) for item in exact_identity}) != 1:
        return "ambiguous_evidence"
    evidence = exact_identity[0]
    if expected["evidence_type"] == "transcript_event":
        if (
            evidence.get("contract_version") != 2
            or evidence.get("speaker") != "interviewer"
            or evidence.get("delivery_state") != expected["delivery_state"]
        ):
            return "state_mismatch"
        if (
            entry["delivery_state"] == "interrupted"
            and evidence["delivery_state"] != "partially_delivered"
        ):
            return "state_mismatch"
        return "attributed"
    return (
        "attributed"
        if evidence.get("event_type") == "integrity_unavailable"
        and evidence.get("speaker") == "interviewer"
        and evidence.get("reason") == expected["reason"]
        else "state_mismatch"
    )


def _canonical_evidence_signature(evidence: dict[str, Any]) -> str:
    fields = (
        (
            "transcript_event",
            "event_id",
            "writer_id",
            "writer_generation",
            "sequence",
            "speaker",
            "text",
            "delivery_state",
        )
        if evidence.get("contract_version") == 2
        else (
            "interruption_marker",
            "event_id",
            "writer_id",
            "writer_generation",
            "sequence",
            "speaker",
            "reason",
        )
    )
    return json.dumps(
        [fields[0], *(evidence.get(field) for field in fields[1:])],
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _timestamp_ms(value: Any) -> int | None:
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    if not isinstance(value, str) or not _CANONICAL_UTC.fullmatch(value):
        return None
    try:
        return int(
            datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
            * 1000
        )
    except ValueError:
        return None
