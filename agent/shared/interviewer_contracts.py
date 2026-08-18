"""Provider-neutral contracts for the stateful full-interview runtime."""

from __future__ import annotations

import hashlib
import json
import math
import re
from datetime import datetime
from typing import Any, Callable

INTERVIEW_BRIEF_V2_CONTRACT_VERSION = "interview-brief.v2"
INTERVIEW_ROUND_PACK_CONTRACT_VERSION = "pm-round-pack.v1"
FULL_INTERVIEW_POLICY_CONTRACT_VERSION = "full-interview-policy.v1"
INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION = "interview-runtime-state.v1"
INTERVIEWER_MOVE_CONTRACT_VERSION = "interviewer-move.v1"
INTERVIEWER_TOOL_CONTRACT_VERSION = "interviewer-tools.v1"
DIRECTOR_RECOMMENDATION_CONTRACT_VERSION = "director-recommendation.v1"

INTERVIEWER_MOVE_TYPES = (
    "probe",
    "clarify",
    "challenge",
    "transition",
    "close",
)
INTERVIEWER_MOVE_REASON_CODES = (
    "deepen_reasoning",
    "resolve_ambiguity",
    "test_tradeoff",
    "advance_round",
    "deadline_close",
    "candidate_requested_close",
    "controller_fallback",
)
INTERVIEWER_TOOL_NAMES = (
    "read_interview_state",
    "read_interview_clock",
    "get_probe_candidates",
    "commit_interviewer_move",
    "request_graceful_close",
)
INTERVIEWER_TOOL_RESULT_STATUSES = (
    "ok",
    "duplicate",
    "stale_state",
    "stale_writer",
    "expired",
    "idempotency_conflict",
    "closed",
    "invalid_request",
    "timeout",
    "unavailable",
)
INTERVIEW_PHASES = (
    "opening",
    "primary_question",
    "follow_up",
    "transition",
    "closing",
    "closed",
)
INTERVIEW_CLOCK_BANDS = ("normal", "warning", "closing", "elapsed")
INTERVIEW_CLOSE_STATES = ("open", "requested", "admitted", "speech_fenced")
INTERVIEW_INTERRUPTION_STATES = (
    "clear",
    "candidate_speaking",
    "interviewer_interrupted",
    "recovery_pending",
)
INTERVIEW_MOVE_DELIVERY_STATES = (
    "admitted",
    "generated",
    "scheduled",
    "spoken",
    "interrupted",
    "canonically_delivered",
    "aborted",
)
INTERVIEW_LIFECYCLE_STATES = (
    "created",
    "connecting",
    "active",
    "reconnecting",
    "ending",
    "completed",
    "abandoned",
    "failed",
)
DIRECTOR_RECOMMENDATION_MAX_TTL_MS = 10_000
INTERVIEWER_MOVE_MAX_TTL_MS = 30_000

_CANONICAL_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]*$")
_SHORT_TOKEN = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
_SHA256 = re.compile(r"^sha256:[a-f0-9]{64}$")


class InterviewerContractError(ValueError):
    """Stable parser failure for the cross-language contract boundary."""

    def __init__(self, contract: str, code: str):
        self.contract = contract
        self.code = code
        super().__init__(f"Invalid {contract}: {code}")


def parse_interview_brief_v2(raw: Any) -> dict[str, Any]:
    return _parse_contract(
        raw,
        "interview_brief_v2",
        INTERVIEW_BRIEF_V2_CONTRACT_VERSION,
        is_interview_brief_v2,
    )


def parse_interview_runtime_state(raw: Any) -> dict[str, Any]:
    return _parse_contract(
        raw,
        "interview_runtime_state",
        INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION,
        is_interview_runtime_state,
    )


def parse_interviewer_move(raw: Any) -> dict[str, Any]:
    return _parse_contract(
        raw,
        "interviewer_move",
        INTERVIEWER_MOVE_CONTRACT_VERSION,
        is_interviewer_move,
    )


def parse_interviewer_tool_request(raw: Any) -> dict[str, Any]:
    return _parse_contract(
        raw,
        "interviewer_tool_request",
        INTERVIEWER_TOOL_CONTRACT_VERSION,
        is_interviewer_tool_request,
    )


def parse_interviewer_tool_result(raw: Any) -> dict[str, Any]:
    return _parse_contract(
        raw,
        "interviewer_tool_result",
        INTERVIEWER_TOOL_CONTRACT_VERSION,
        is_interviewer_tool_result,
    )


def parse_director_recommendation(raw: Any) -> dict[str, Any]:
    return _parse_contract(
        raw,
        "director_recommendation",
        DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
        is_director_recommendation,
    )


def resolve_optional_interview_brief_v2(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {"mode": "room_metadata_v1", "reason": "absent"}
    try:
        return {"mode": "brief_v2", "brief": parse_interview_brief_v2(raw)}
    except InterviewerContractError as error:
        reason = (
            "unsupported_contract"
            if error.code == "unsupported_contract"
            else "invalid_payload"
        )
        return {"mode": "room_metadata_v1", "reason": reason}


def canonicalize_interview_brief_v2_payload(brief: dict[str, Any]) -> str:
    payload = {
        key: value
        for key, value in brief.items()
        if key not in {"brief_id", "payload_digest"}
    }
    return json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def calculate_interview_brief_v2_payload_digest(brief: dict[str, Any]) -> str:
    material = canonicalize_interview_brief_v2_payload(brief).encode("utf-8")
    return f"sha256:{hashlib.sha256(material).hexdigest()}"


def is_interview_brief_v2(value: Any) -> bool:
    if not _exact_keys(
        value,
        (
            "contract_version",
            "brief_id",
            "payload_digest",
            "session_id",
            "session_start_fingerprint",
            "deadline_at",
            "round_type",
            "difficulty",
            "duration_minutes",
            "selected_question",
            "company_context",
            "candidate_practice_goal",
            "round_pack",
            "policy",
        ),
    ):
        return False
    selected = value["selected_question"]
    company = value["company_context"]
    round_pack = value["round_pack"]
    policy = value["policy"]
    structurally_valid = (
        value["contract_version"] == INTERVIEW_BRIEF_V2_CONTRACT_VERSION
        and _sha256(value["payload_digest"])
        and value["brief_id"]
        == f"brief:{value['payload_digest'][len('sha256:'):]}"
        and _identifier(value["session_id"])
        and _sha256(value["session_start_fingerprint"])
        and _timestamp(value["deadline_at"])
        and value["round_type"]
        in ("behavioral", "product_sense", "execution", "strategy")
        and value["difficulty"] in ("beginner", "intermediate", "advanced")
        and value["duration_minutes"] in (15, 30, 45)
        and _question(selected)
        and _company_context(company)
        and (company is None or selected["company"] == company["company_name"])
        and (
            value["candidate_practice_goal"] is None
            or _bounded_string(value["candidate_practice_goal"], 1, 500)
        )
        and _round_pack(round_pack)
        and round_pack["round_type"] == value["round_type"]
        and _full_interview_policy(policy)
    )
    return bool(
        structurally_valid
        and value["payload_digest"]
        == calculate_interview_brief_v2_payload_digest(value)
    )


def is_interview_runtime_state(value: Any) -> bool:
    if not _exact_keys(
        value,
        (
            "contract_version",
            "session_id",
            "brief_id",
            "state_revision",
            "lifecycle_snapshot",
            "active_writer",
            "controller_phase",
            "round_objective_id",
            "current_topic",
            "active_question_id",
            "clock",
            "allowed_moves",
            "probe_ledger",
            "last_finalized_candidate_turn_id",
            "interruption_state",
            "close_state",
            "speech_fenced",
        ),
    ):
        return False
    if not (
        value["contract_version"] == INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION
        and _identifier(value["session_id"])
        and _identifier(value["brief_id"])
        and _non_negative_int(value["state_revision"])
        and _lifecycle_snapshot(value["lifecycle_snapshot"])
        and _active_writer(value["active_writer"])
        and value["controller_phase"] in INTERVIEW_PHASES
        and _identifier(value["round_objective_id"])
        and _bounded_string(value["current_topic"], 1, 240)
        and _identifier(value["active_question_id"])
        and _clock(value["clock"])
        and _unique_array(value["allowed_moves"], 0, 5, _move_type)
        and _array(value["probe_ledger"], 0, 100, _ledger_entry)
        and (
            value["last_finalized_candidate_turn_id"] is None
            or _identifier(value["last_finalized_candidate_turn_id"])
        )
        and value["interruption_state"] in INTERVIEW_INTERRUPTION_STATES
        and value["close_state"] in INTERVIEW_CLOSE_STATES
        and isinstance(value["speech_fenced"], bool)
    ):
        return False
    if value["speech_fenced"]:
        return (
            value["controller_phase"] == "closed"
            and value["close_state"] == "speech_fenced"
            and value["allowed_moves"] == []
        )
    return (
        value["controller_phase"] != "closed"
        and value["close_state"] != "speech_fenced"
    )


def is_interviewer_move(value: Any) -> bool:
    return bool(
        _exact_keys(
            value,
            (
                "contract_version",
                "move_id",
                "session_id",
                "brief_id",
                "writer_id",
                "writer_generation",
                "based_on_state_revision",
                "move_type",
                "target",
                "reason_code",
                "created_at",
                "expires_at",
                "idempotency_key",
            ),
        )
        and value["contract_version"] == INTERVIEWER_MOVE_CONTRACT_VERSION
        and _identifier(value["move_id"])
        and _identifier(value["session_id"])
        and _identifier(value["brief_id"])
        and _identifier(value["writer_id"])
        and _positive_int(value["writer_generation"])
        and _non_negative_int(value["based_on_state_revision"])
        and _move_type(value["move_type"])
        and _move_target(value["target"])
        and value["reason_code"] in INTERVIEWER_MOVE_REASON_CODES
        and _move_reason_allowed(value["move_type"], value["reason_code"])
        and _required_source_turn(
            value["move_type"], value["target"]["source_turn_id"]
        )
        and _timestamp(value["created_at"])
        and _timestamp(value["expires_at"])
        and _positive_ttl(
            value["created_at"],
            value["expires_at"],
            INTERVIEWER_MOVE_MAX_TTL_MS,
        )
        and _identifier(value["idempotency_key"])
    )


def is_interviewer_tool_request(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    if not (
        value.get("contract_version") == INTERVIEWER_TOOL_CONTRACT_VERSION
        and value.get("tool_name") in INTERVIEWER_TOOL_NAMES
        and _identifier(value.get("call_id"))
        and _identifier(value.get("session_id"))
        and _identifier(value.get("writer_id"))
        and _positive_int(value.get("writer_generation"))
        and _timestamp(value.get("deadline_at"))
    ):
        return False
    common = (
        "contract_version",
        "tool_name",
        "call_id",
        "session_id",
        "writer_id",
        "writer_generation",
        "deadline_at",
    )
    name = value["tool_name"]
    if name in ("read_interview_state", "read_interview_clock"):
        return _exact_keys(value, common)
    if name == "get_probe_candidates":
        return _exact_keys(value, (*common, "expected_state_revision")) and (
            _non_negative_int(value["expected_state_revision"])
        )
    if name == "commit_interviewer_move":
        move = value.get("move")
        return bool(
            _exact_keys(
                value,
                (*common, "expected_state_revision", "idempotency_key", "move"),
            )
            and _non_negative_int(value["expected_state_revision"])
            and _identifier(value["idempotency_key"])
            and is_interviewer_move(move)
            and move["session_id"] == value["session_id"]
            and move["writer_id"] == value["writer_id"]
            and move["writer_generation"] == value["writer_generation"]
            and move["based_on_state_revision"]
            == value["expected_state_revision"]
            and move["idempotency_key"] == value["idempotency_key"]
        )
    return bool(
        _exact_keys(
            value,
            (*common, "expected_state_revision", "idempotency_key", "reason"),
        )
        and _non_negative_int(value["expected_state_revision"])
        and _identifier(value["idempotency_key"])
        and value["reason"]
        in ("deadline", "candidate_request", "controller_policy")
    )


def is_interviewer_tool_result(value: Any) -> bool:
    if not _exact_keys(
        value,
        (
            "contract_version",
            "tool_name",
            "call_id",
            "session_id",
            "writer_id",
            "writer_generation",
            "status",
            "observed_state_revision",
            "payload",
            "failure_code",
            "latency_ms",
        ),
    ):
        return False
    if not (
        value["contract_version"] == INTERVIEWER_TOOL_CONTRACT_VERSION
        and value["tool_name"] in INTERVIEWER_TOOL_NAMES
        and _identifier(value["call_id"])
        and _identifier(value["session_id"])
        and _identifier(value["writer_id"])
        and _positive_int(value["writer_generation"])
        and value["status"] in INTERVIEWER_TOOL_RESULT_STATUSES
        and _non_negative_int(value["observed_state_revision"])
        and _non_negative_number(value["latency_ms"])
    ):
        return False
    if value["status"] in ("ok", "duplicate"):
        return value["failure_code"] is None and _tool_payload(
            value["tool_name"], value["payload"]
        )
    return value["payload"] is None and value["failure_code"] == value["status"]


def is_director_recommendation(value: Any) -> bool:
    return bool(
        _exact_keys(
            value,
            (
                "contract_version",
                "recommendation_id",
                "session_id",
                "brief_id",
                "writer_id",
                "writer_generation",
                "based_on_state_revision",
                "source_turn_id",
                "source_transcript_revision",
                "source_finality",
                "move_type",
                "target",
                "reason_code",
                "created_at",
                "expires_at",
            ),
        )
        and value["contract_version"]
        == DIRECTOR_RECOMMENDATION_CONTRACT_VERSION
        and _identifier(value["recommendation_id"])
        and _identifier(value["session_id"])
        and _identifier(value["brief_id"])
        and _identifier(value["writer_id"])
        and _positive_int(value["writer_generation"])
        and _non_negative_int(value["based_on_state_revision"])
        and _identifier(value["source_turn_id"])
        and _identifier(value["source_transcript_revision"])
        and value["source_finality"] in ("speculative", "finalized")
        and _move_type(value["move_type"])
        and _move_target(value["target"])
        and value["target"]["source_turn_id"] == value["source_turn_id"]
        and value["reason_code"] in INTERVIEWER_MOVE_REASON_CODES
        and _move_reason_allowed(value["move_type"], value["reason_code"])
        and _timestamp(value["created_at"])
        and _timestamp(value["expires_at"])
        and _positive_ttl(
            value["created_at"],
            value["expires_at"],
            DIRECTOR_RECOMMENDATION_MAX_TTL_MS,
        )
    )


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
    if recommendation["source_finality"] != "finalized":
        return "source_not_final"
    if (
        recommendation["source_turn_id"]
        != state["last_finalized_candidate_turn_id"]
    ):
        return "source_turn_mismatch"
    now_ms = _timestamp_ms(now)
    if now_ms is None or now_ms < _timestamp_ms(recommendation["created_at"]):
        return "not_yet_valid"
    if now_ms > _timestamp_ms(recommendation["expires_at"]):
        return "expired"
    if state["lifecycle_snapshot"]["state"] not in ("active", "reconnecting"):
        return "lifecycle_not_active"
    if state["speech_fenced"]:
        return "speech_fenced"
    if recommendation["move_type"] not in state["allowed_moves"]:
        return "move_not_allowed"
    return "eligible"


def _parse_contract(
    raw: Any,
    contract: str,
    expected_version: str,
    validator: Callable[[Any], bool],
) -> dict[str, Any]:
    value = raw
    if isinstance(raw, str):
        try:
            value = json.loads(raw)
        except json.JSONDecodeError as error:
            raise InterviewerContractError(contract, "invalid_json") from error
    if (
        isinstance(value, dict)
        and "contract_version" in value
        and value["contract_version"] != expected_version
    ):
        raise InterviewerContractError(contract, "unsupported_contract")
    if not validator(value):
        raise InterviewerContractError(contract, "invalid_payload")
    return value


def _question(value: Any) -> bool:
    return bool(
        _exact_keys(value, ("id", "text", "company", "type"))
        and _identifier(value["id"])
        and _bounded_string(value["text"], 1, 1_500)
        and (
            value["company"] is None
            or _bounded_string(value["company"], 1, 120)
        )
        and _bounded_string(value["type"], 1, 120)
    )


def _company_context(value: Any) -> bool:
    return value is None or bool(
        _exact_keys(value, ("company_name", "context_version", "summary"))
        and _bounded_string(value["company_name"], 1, 120)
        and _contract_token(value["context_version"])
        and _bounded_string(value["summary"], 1, 1_000)
    )


def _round_pack(value: Any) -> bool:
    return bool(
        _exact_keys(
            value,
            (
                "contract_version",
                "round_type",
                "objectives",
                "probe_families",
                "transition_guidance",
                "close_guidance",
                "forbidden_behaviors",
            ),
        )
        and value["contract_version"] == INTERVIEW_ROUND_PACK_CONTRACT_VERSION
        and value["round_type"]
        in ("behavioral", "product_sense", "execution", "strategy")
        and _unique_array(value["objectives"], 1, 8, _short_token)
        and _unique_array(value["probe_families"], 1, 12, _short_token)
        and _array(value["transition_guidance"], 1, 8, _guidance)
        and _array(value["close_guidance"], 1, 8, _guidance)
        and value["forbidden_behaviors"]
        == ["coaching", "hinting", "mid_session_evaluation"]
    )


def _full_interview_policy(value: Any) -> bool:
    return bool(
        _exact_keys(
            value,
            (
                "contract_version",
                "prompt_contract_version",
                "interviewer_mode",
                "coaching",
                "hints",
                "evaluation_timing",
                "selected_question_policy",
                "one_substantive_question_per_turn",
            ),
        )
        and value["contract_version"] == FULL_INTERVIEW_POLICY_CONTRACT_VERSION
        and _contract_token(value["prompt_contract_version"])
        and value["interviewer_mode"] == "full_interview"
        and value["coaching"] == "forbidden"
        and value["hints"] == "forbidden"
        and value["evaluation_timing"] == "post_interview_only"
        and value["selected_question_policy"] == "exact_first_turn"
        and value["one_substantive_question_per_turn"] is True
    )


def _clock(value: Any) -> bool:
    return bool(
        _exact_keys(
            value,
            ("started_at", "deadline_at", "observed_at", "remaining_ms", "band"),
        )
        and _timestamp(value["started_at"])
        and _timestamp(value["deadline_at"])
        and _timestamp(value["observed_at"])
        and _timestamp_ms(value["deadline_at"]) > _timestamp_ms(value["started_at"])
        and _non_negative_int(value["remaining_ms"])
        and value["band"] in INTERVIEW_CLOCK_BANDS
        and (value["band"] != "elapsed" or value["remaining_ms"] == 0)
    )


def _lifecycle_snapshot(value: Any) -> bool:
    return bool(
        _exact_keys(value, ("state", "version"))
        and value["state"] in INTERVIEW_LIFECYCLE_STATES
        and _non_negative_int(value["version"])
    )


def _active_writer(value: Any) -> bool:
    return bool(
        _exact_keys(value, ("writer_id", "writer_generation"))
        and _identifier(value["writer_id"])
        and _positive_int(value["writer_generation"])
    )


def _ledger_entry(value: Any) -> bool:
    return bool(
        _exact_keys(
            value,
            (
                "move_id",
                "move_type",
                "delivery_state",
                "question_id",
                "target_turn_ids",
                "updated_at",
                "delivery_evidence",
            ),
        )
        and _identifier(value["move_id"])
        and _move_type(value["move_type"])
        and value["delivery_state"] in INTERVIEW_MOVE_DELIVERY_STATES
        and _identifier(value["question_id"])
        and _unique_array(value["target_turn_ids"], 0, 8, _identifier)
        and _timestamp(value["updated_at"])
        and _delivery_evidence(
            value["delivery_state"], value["delivery_evidence"]
        )
    )


def _delivery_evidence(delivery_state: Any, value: Any) -> bool:
    if delivery_state != "canonically_delivered":
        return value is None
    return bool(
        _exact_keys(
            value,
            (
                "event_id",
                "writer_id",
                "writer_generation",
                "sequence",
                "delivery_state",
            ),
        )
        and _identifier(value["event_id"])
        and _identifier(value["writer_id"])
        and _positive_int(value["writer_generation"])
        and _positive_int(value["sequence"])
        and value["delivery_state"] in ("delivered", "partially_delivered")
    )


def _move_target(value: Any) -> bool:
    return bool(
        _exact_keys(
            value,
            ("question_id", "topic", "source_turn_id", "probe_candidate_id"),
        )
        and _identifier(value["question_id"])
        and _bounded_string(value["topic"], 1, 240)
        and (
            value["source_turn_id"] is None
            or _identifier(value["source_turn_id"])
        )
        and (
            value["probe_candidate_id"] is None
            or _identifier(value["probe_candidate_id"])
        )
    )


def _probe_candidate(value: Any) -> bool:
    return bool(
        _exact_keys(
            value,
            (
                "probe_candidate_id",
                "move_type",
                "question_id",
                "topic",
                "reason_code",
            ),
        )
        and _identifier(value["probe_candidate_id"])
        and value["move_type"] in ("probe", "clarify", "challenge")
        and _identifier(value["question_id"])
        and _bounded_string(value["topic"], 1, 240)
        and value["reason_code"] in INTERVIEWER_MOVE_REASON_CODES
    )


def _tool_payload(tool_name: str, value: Any) -> bool:
    if tool_name == "read_interview_state":
        return _exact_keys(value, ("state",)) and is_interview_runtime_state(
            value["state"]
        )
    if tool_name == "read_interview_clock":
        return _exact_keys(value, ("clock",)) and _clock(value["clock"])
    if tool_name == "get_probe_candidates":
        return _exact_keys(value, ("probe_candidates",)) and _array(
            value["probe_candidates"], 0, 8, _probe_candidate
        )
    if tool_name == "commit_interviewer_move":
        return _exact_keys(value, ("committed_move",)) and is_interviewer_move(
            value["committed_move"]
        )
    return _exact_keys(value, ("close_state",)) and (
        value["close_state"] in INTERVIEW_CLOSE_STATES
    )


def _timestamp(value: Any) -> bool:
    return _timestamp_ms(value) is not None


def _timestamp_ms(value: Any) -> int | None:
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    if not isinstance(value, str) or not _CANONICAL_UTC.fullmatch(value):
        return None
    try:
        return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        return None


def _positive_ttl(created_at: str, expires_at: str, maximum_ms: int) -> bool:
    created = _timestamp_ms(created_at)
    expires = _timestamp_ms(expires_at)
    if created is None or expires is None:
        return False
    ttl = expires - created
    return 0 < ttl <= maximum_ms


def _exact_keys(value: Any, keys: tuple[str, ...]) -> bool:
    return isinstance(value, dict) and set(value) == set(keys)


def _bounded_string(value: Any, minimum: int, maximum: int) -> bool:
    return (
        isinstance(value, str)
        and value.strip() == value
        and minimum <= len(value) <= maximum
    )


def _identifier(value: Any) -> bool:
    return _bounded_string(value, 1, 128) and bool(_IDENTIFIER.fullmatch(value))


def _contract_token(value: Any) -> bool:
    return _bounded_string(value, 1, 96) and bool(_IDENTIFIER.fullmatch(value))


def _short_token(value: Any) -> bool:
    return _bounded_string(value, 1, 96) and bool(_SHORT_TOKEN.fullmatch(value))


def _guidance(value: Any) -> bool:
    return _bounded_string(value, 1, 240)


def _sha256(value: Any) -> bool:
    return isinstance(value, str) and bool(_SHA256.fullmatch(value))


def _non_negative_int(value: Any) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and 0 <= value <= 9_007_199_254_740_991
    )


def _positive_int(value: Any) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and 0 < value <= 9_007_199_254_740_991
    )


def _non_negative_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value >= 0
    )


def _move_type(value: Any) -> bool:
    return value in INTERVIEWER_MOVE_TYPES


def _move_reason_allowed(move_type: str, reason_code: str) -> bool:
    if reason_code == "controller_fallback":
        return True
    return reason_code in {
        "probe": ("deepen_reasoning",),
        "clarify": ("resolve_ambiguity",),
        "challenge": ("test_tradeoff",),
        "transition": ("advance_round",),
        "close": ("deadline_close", "candidate_requested_close"),
    }.get(move_type, ())


def _required_source_turn(move_type: str, source_turn_id: Any) -> bool:
    return source_turn_id is not None or move_type in ("transition", "close")


def _array(
    value: Any,
    minimum: int,
    maximum: int,
    validator: Callable[[Any], bool],
) -> bool:
    return (
        isinstance(value, list)
        and minimum <= len(value) <= maximum
        and all(validator(item) for item in value)
    )


def _unique_array(
    value: Any,
    minimum: int,
    maximum: int,
    validator: Callable[[Any], bool],
) -> bool:
    return _array(value, minimum, maximum, validator) and len(set(value)) == len(value)
