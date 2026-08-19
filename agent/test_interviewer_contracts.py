#!/usr/bin/env python3
"""Cross-runtime contract tests for the stateful full-interview controller."""

import hashlib
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.config import parse_room_metadata
from shared.interviewer_contracts import (
    InterviewerContractError,
    assess_director_recommendation,
    assess_interview_probe_ledger_attribution,
    assess_interviewer_mutation_replay,
    assess_interviewer_tool_request_against_state,
    assess_interviewer_tool_result_for_request,
    calculate_interview_brief_v2_payload_digest,
    calculate_interviewer_mutation_request_digest,
    canonicalize_interview_brief_v2_payload,
    is_interview_runtime_state,
    parse_director_recommendation,
    parse_interview_brief_v2,
    parse_interview_runtime_state,
    parse_interviewer_move,
    parse_interviewer_tool_request,
    parse_interviewer_tool_result,
    resolve_optional_interview_brief_v2,
)
from shared.prompt_contracts import DEMO_PROMPT_CONTRACT, FULL_INTERVIEW_PROMPT_CONTRACT


class InterviewerContractTests(unittest.TestCase):
    @staticmethod
    def _interviewer_contract_fixtures():
        path = (
            Path(__file__).parent.parent
            / "packages"
            / "test-fixtures"
            / "interviewer-contracts.json"
        )
        return json.loads(path.read_text())

    def test_python_accepts_shared_stateful_interviewer_golden_fixture(self):
        fixtures = self._interviewer_contract_fixtures()
        brief = parse_interview_brief_v2(fixtures["brief"])
        state = parse_interview_runtime_state(fixtures["runtime_state"])
        move = parse_interviewer_move(fixtures["move"])
        recommendation = parse_director_recommendation(
            fixtures["director_recommendation"]
        )

        self.assertEqual(brief["selected_question"]["id"], "question-contract-1")
        self.assertEqual(state["controller_phase"], "follow_up")
        self.assertEqual(move["move_type"], "challenge")
        self.assertEqual(recommendation["source_finality"], "finalized")
        for request in fixtures["tool_requests"]:
            self.assertEqual(
                parse_interviewer_tool_request(request)["session_id"],
                state["session_id"],
            )
        for result in fixtures["tool_results"]:
            self.assertEqual(
                parse_interviewer_tool_result(result)["session_id"],
                state["session_id"],
            )

    def test_integer_bearing_wire_contracts_reject_float_and_exponent_lexemes(
        self,
    ):
        fixtures = self._interviewer_contract_fixtures()
        contracts = {
            "interview_runtime_state": (
                fixtures["runtime_state"],
                parse_interview_runtime_state,
            ),
            "interviewer_move": (fixtures["move"], parse_interviewer_move),
            "interviewer_tool_request": (
                fixtures["tool_requests"][3],
                parse_interviewer_tool_request,
            ),
            "interviewer_tool_result": (
                fixtures["tool_results"][0],
                parse_interviewer_tool_result,
            ),
            "director_recommendation": (
                fixtures["director_recommendation"],
                parse_director_recommendation,
            ),
        }

        for wire_case in fixtures["integer_wire_cases"]:
            with self.subTest(case=wire_case["name"]):
                fixture, parser = contracts[wire_case["contract"]]
                canonical = json.dumps(fixture, separators=(",", ":"))
                adversarial = canonical.replace(
                    wire_case["canonical_token"],
                    wire_case["noncanonical_token"],
                    1,
                )
                self.assertNotEqual(adversarial, canonical)
                with self.assertRaises(InterviewerContractError) as invalid:
                    parser(adversarial)
                self.assertEqual(invalid.exception.code, "invalid_payload")

    def test_brief_digest_is_replay_stable_and_matches_hashlib(self):
        fixtures = self._interviewer_contract_fixtures()
        brief = parse_interview_brief_v2(fixtures["brief"])
        canonical = canonicalize_interview_brief_v2_payload(brief)
        expected = f"sha256:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"
        reversed_brief = dict(reversed(list(brief.items())))

        self.assertEqual(
            calculate_interview_brief_v2_payload_digest(brief),
            expected,
        )
        self.assertEqual(expected, brief["payload_digest"])
        self.assertEqual(
            canonicalize_interview_brief_v2_payload(reversed_brief),
            canonical,
        )
        self.assertNotIn("compiled_at", brief)

    def test_brief_unicode_scalars_are_parity_safe_and_surrogates_fall_back(self):
        fixtures = self._interviewer_contract_fixtures()
        for unicode_case in fixtures["unicode_cases"]:
            with self.subTest(case=unicode_case["name"]):
                candidate = json.loads(json.dumps(fixtures["brief"]))
                candidate["candidate_practice_goal"] = unicode_case[
                    "candidate_practice_goal"
                ]

                if not unicode_case["accepted"]:
                    with self.assertRaises(InterviewerContractError) as invalid:
                        canonicalize_interview_brief_v2_payload(candidate)
                    self.assertEqual(invalid.exception.code, "invalid_payload")
                    self.assertEqual(
                        resolve_optional_interview_brief_v2(candidate),
                        {"mode": "room_metadata_v1", "reason": "invalid_payload"},
                    )
                    continue

                payload_digest = unicode_case["payload_digest"]
                candidate["payload_digest"] = payload_digest
                candidate["brief_id"] = f"brief:{payload_digest[len('sha256:'):]}"
                parsed = parse_interview_brief_v2(candidate)
                canonical = canonicalize_interview_brief_v2_payload(parsed)
                self.assertEqual(
                    calculate_interview_brief_v2_payload_digest(parsed),
                    payload_digest,
                )
                self.assertEqual(
                    f"sha256:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}",
                    payload_digest,
                )

    def test_brief_numeric_wire_forms_reject_floats_and_exponents(self):
        fixtures = self._interviewer_contract_fixtures()
        canonical_brief_wire = json.dumps(fixtures["brief"], separators=(",", ":"))
        canonical_room_wire = json.dumps(
            {
                **fixtures["room_metadata_v1"],
                "interview_brief": fixtures["brief"],
            },
            separators=(",", ":"),
        )
        for numeric_case in fixtures["numeric_wire_cases"]:
            with self.subTest(case=numeric_case["name"]):
                def replace_duration(wire: str) -> str:
                    return wire.replace(
                        '"duration_minutes":30',
                        f'"duration_minutes":{numeric_case["duration_lexeme"]}',
                    )

                with self.assertRaises(InterviewerContractError) as invalid:
                    parse_interview_brief_v2(
                        replace_duration(canonical_brief_wire)
                    )
                self.assertEqual(invalid.exception.code, "invalid_payload")
                room = parse_room_metadata(replace_duration(canonical_room_wire))
                self.assertIsNone(room["interview_brief"])
                self.assertEqual(room["config"]["duration"], 30)

    def test_room_metadata_numeric_validation_uses_unambiguous_top_level_brief(
        self,
    ):
        fixtures = self._interviewer_contract_fixtures()
        for numeric_case in fixtures["room_metadata_numeric_adversarial_cases"]:
            with self.subTest(case=numeric_case["name"]):
                nested_marker = f'nested-{numeric_case["name"]}'
                top_level_marker = f'top-level-{numeric_case["name"]}'
                wire = json.dumps(
                    {
                        **fixtures["room_metadata_v1"],
                        "question": {
                            **fixtures["room_metadata_v1"]["question"],
                            "interview_brief": {
                                "duration_minutes": nested_marker
                            },
                        },
                        "interview_brief": {
                            **fixtures["brief"],
                            "duration_minutes": top_level_marker,
                        },
                    },
                    separators=(",", ":"),
                )
                wire = wire.replace(
                    f'"duration_minutes":"{nested_marker}"',
                    '"duration_minutes":'
                    f'{numeric_case["nested_duration_lexeme"]}',
                ).replace(
                    f'"duration_minutes":"{top_level_marker}"',
                    '"duration_minutes":'
                    f'{numeric_case["top_level_duration_lexeme"]}',
                )
                if numeric_case["duplicate_top_level_brief"]:
                    brief_wire = json.dumps(
                        fixtures["brief"], separators=(",", ":")
                    )
                    wire = (
                        f'{wire[:-1]},"interview_brief":{brief_wire}'
                        "}"
                    )

                room = parse_room_metadata(wire)
                if numeric_case["accepted"]:
                    self.assertEqual(room["interview_brief"], fixtures["brief"])
                else:
                    self.assertIsNone(room["interview_brief"])

    def test_room_metadata_v1_negotiates_nested_brief_without_v2_top_level(self):
        fixtures = self._interviewer_contract_fixtures()
        room = {
            **fixtures["room_metadata_v1"],
            "interview_brief": fixtures["brief"],
        }
        parsed = parse_room_metadata(json.dumps(room))

        self.assertEqual(parsed["contract_version"], 1)
        self.assertEqual(parsed["interview_brief"], fixtures["brief"])
        self.assertEqual(parsed["interview_brief_resolution"], "brief_v2")
        self.assertEqual(
            parsed["question"]["text"],
            fixtures["brief"]["selected_question"]["text"],
        )

        absent = parse_room_metadata(json.dumps(fixtures["room_metadata_v1"]))
        self.assertIsNone(absent["interview_brief"])
        self.assertEqual(absent["interview_brief_resolution"], "absent")

        for nested in (
            {**fixtures["brief"], "contract_version": "interview-brief.v999"},
            {**fixtures["brief"], "selected_question": {"id": "malformed"}},
            {**fixtures["brief"], "payload_digest": f"sha256:{'0' * 64}"},
        ):
            with self.subTest(nested=nested["contract_version"]):
                fallback = parse_room_metadata(
                    json.dumps(
                        {
                            **fixtures["room_metadata_v1"],
                            "interview_brief": nested,
                        }
                    )
                )
                self.assertIsNone(fallback["interview_brief"])
                self.assertEqual(
                    fallback["question"]["text"],
                    fixtures["room_metadata_v1"]["question"]["text"],
                )
                self.assertEqual(fallback["config"]["hintMode"], "off")
                self.assertEqual(fallback["config"]["feedback_mode"], "end_only")

        with self.assertRaisesRegex(ValueError, "Invalid interview room metadata"):
            parse_room_metadata(
                json.dumps({**fixtures["room_metadata_v1"], "contract_version": 2})
            )

        with self.assertRaisesRegex(ValueError, "Invalid interview room metadata"):
            parse_room_metadata(
                json.dumps(
                    {
                        **fixtures["room_metadata_v1"],
                        "contract_version": True,
                    }
                )
            )

    def test_every_nested_brief_authority_mismatch_falls_back_to_v1(self):
        fixtures = self._interviewer_contract_fixtures()

        def valid_mismatch(update):
            brief = json.loads(json.dumps(fixtures["brief"]))
            update(brief)
            digest = calculate_interview_brief_v2_payload_digest(brief)
            brief["payload_digest"] = digest
            brief["brief_id"] = f"brief:{digest[len('sha256:') :]}"
            return brief

        mismatches = [
            valid_mismatch(
                lambda brief: brief.update(session_id="session-substituted")
            ),
            valid_mismatch(
                lambda brief: brief.update(
                    deadline_at="2026-08-18T23:29:59.999Z"
                )
            ),
            valid_mismatch(
                lambda brief: (
                    brief.update(round_type="strategy"),
                    brief["round_pack"].update(round_type="strategy"),
                )
            ),
            valid_mismatch(
                lambda brief: brief.update(difficulty="advanced")
            ),
            valid_mismatch(
                lambda brief: brief.update(duration_minutes=45)
            ),
        ]
        for field in ("id", "text", "company", "type"):
            def update_selected(brief, selected_field=field):
                if selected_field == "company":
                    brief["company_context"] = None
                    brief["selected_question"][selected_field] = "Figma"
                else:
                    brief["selected_question"][selected_field] = (
                        f"{selected_field}-substituted"
                    )

            mismatches.append(valid_mismatch(update_selected))

        for mismatch in mismatches:
            room = parse_room_metadata(
                json.dumps(
                    {
                        **fixtures["room_metadata_v1"],
                        "interview_brief": mismatch,
                    }
                )
            )
            self.assertIsNone(room["interview_brief"])
            self.assertEqual(
                room["question"]["id"],
                fixtures["room_metadata_v1"]["question"]["id"],
            )
            self.assertEqual(
                room["question"]["text"],
                fixtures["room_metadata_v1"]["question"]["text"],
            )

    def test_python_contract_parsers_reject_unknown_and_malformed_versions(self):
        fixtures = self._interviewer_contract_fixtures()
        cases = (
            (parse_interview_brief_v2, fixtures["brief"]),
            (parse_interview_runtime_state, fixtures["runtime_state"]),
            (parse_interviewer_move, fixtures["move"]),
            (parse_interviewer_tool_request, fixtures["tool_requests"][0]),
            (parse_interviewer_tool_result, fixtures["tool_results"][0]),
            (
                parse_director_recommendation,
                fixtures["director_recommendation"],
            ),
        )
        for parse, fixture in cases:
            with self.subTest(parser=parse.__name__):
                with self.assertRaises(InterviewerContractError) as unknown:
                    parse({**fixture, "contract_version": "unknown.v999"})
                self.assertEqual(unknown.exception.code, "unsupported_contract")
                with self.assertRaises(InterviewerContractError) as malformed:
                    parse({**fixture, "unexpected": True})
                self.assertEqual(malformed.exception.code, "invalid_payload")

    def test_python_tool_results_reject_cross_envelope_state_and_move_authority(self):
        fixtures = self._interviewer_contract_fixtures()
        state = fixtures["runtime_state"]
        move = fixtures["move"]
        state_result = {
            "contract_version": "interviewer-tools.v1",
            "tool_name": "read_interview_state",
            "call_id": "call-correlated-state-1",
            "session_id": state["session_id"],
            "writer_id": state["active_writer"]["writer_id"],
            "writer_generation": state["active_writer"]["writer_generation"],
            "status": "ok",
            "observed_state_revision": state["state_revision"],
            "observed_lifecycle_version": state["lifecycle_snapshot"]["version"],
            "payload": {"state": state},
            "failure_code": None,
            "latency_ms": 1,
        }
        commit_result = {
            "contract_version": "interviewer-tools.v1",
            "tool_name": "commit_interviewer_move",
            "call_id": "call-correlated-commit-1",
            "session_id": move["session_id"],
            "writer_id": move["writer_id"],
            "writer_generation": move["writer_generation"],
            "status": "ok",
            "observed_state_revision": move["based_on_state_revision"] + 1,
            "observed_lifecycle_version": move["based_on_lifecycle_version"],
            "payload": {"committed_move": move},
            "failure_code": None,
            "latency_ms": 1,
        }

        for status in ("ok", "duplicate"):
            self.assertEqual(
                parse_interviewer_tool_result({**state_result, "status": status})[
                    "status"
                ],
                status,
            )
            self.assertEqual(
                parse_interviewer_tool_result({**commit_result, "status": status})[
                    "status"
                ],
                status,
            )

            state_mismatches = []
            for path, replacement in (
                (("payload", "state", "session_id"), "another-session"),
                (
                    ("payload", "state", "active_writer", "writer_id"),
                    "another-writer",
                ),
                (
                    ("payload", "state", "active_writer", "writer_generation"),
                    state["active_writer"]["writer_generation"] + 1,
                ),
                (
                    ("payload", "state", "state_revision"),
                    state["state_revision"] + 1,
                ),
                (
                    ("payload", "state", "lifecycle_snapshot", "version"),
                    state["lifecycle_snapshot"]["version"] + 1,
                ),
            ):
                mismatch = json.loads(json.dumps({**state_result, "status": status}))
                target = mismatch
                for key in path[:-1]:
                    target = target[key]
                target[path[-1]] = replacement
                state_mismatches.append(mismatch)

            move_mismatches = []
            for field, replacement in (
                ("session_id", "another-session"),
                ("writer_id", "another-writer"),
                ("writer_generation", move["writer_generation"] + 1),
                (
                    "based_on_state_revision",
                    move["based_on_state_revision"] - 1,
                ),
                (
                    "based_on_lifecycle_version",
                    move["based_on_lifecycle_version"] + 1,
                ),
            ):
                mismatch = json.loads(json.dumps({**commit_result, "status": status}))
                mismatch["payload"]["committed_move"][field] = replacement
                move_mismatches.append(mismatch)

            for mismatch in (*state_mismatches, *move_mismatches):
                with self.assertRaises(InterviewerContractError) as invalid:
                    parse_interviewer_tool_result(mismatch)
                self.assertEqual(invalid.exception.code, "invalid_payload")

    def test_director_expiry_boundary_and_reconnect_fence_are_deterministic(self):
        fixtures = self._interviewer_contract_fixtures()
        recommendation = parse_director_recommendation(
            fixtures["director_recommendation"]
        )
        state = parse_interview_runtime_state(fixtures["runtime_state"])

        self.assertEqual(
            assess_director_recommendation(
                recommendation,
                state,
                recommendation["expires_at"],
            ),
            "eligible",
        )
        self.assertEqual(
            assess_director_recommendation(
                recommendation,
                state,
                "2026-08-18T23:10:10.001Z",
            ),
            "expired",
        )
        self.assertEqual(
            assess_director_recommendation(
                {**recommendation, "source_finality": "speculative"},
                state,
                recommendation["expires_at"],
            ),
            "source_not_final",
        )
        self.assertEqual(
            assess_director_recommendation(
                {**recommendation, "writer_generation": 2},
                state,
                recommendation["expires_at"],
            ),
            "stale_state",
        )
        self.assertEqual(
            assess_director_recommendation(
                {**recommendation, "based_on_lifecycle_version": 1},
                state,
                recommendation["expires_at"],
            ),
            "stale_lifecycle",
        )
        self.assertEqual(
            assess_director_recommendation(
                {
                    **recommendation,
                    "source_transcript_revision": "transcript-revision-stale",
                },
                state,
                recommendation["expires_at"],
            ),
            "source_transcript_revision_mismatch",
        )
        self.assertEqual(
            assess_director_recommendation(
                {
                    **recommendation,
                    "target": {
                        **recommendation["target"],
                        "question_id": "question-substituted",
                    },
                },
                state,
                recommendation["expires_at"],
            ),
            "question_mismatch",
        )
        self.assertEqual(
            assess_director_recommendation(
                {
                    **recommendation,
                },
                {
                    **state,
                    "lifecycle_snapshot": {
                        **state["lifecycle_snapshot"],
                        "state": "reconnecting",
                    },
                },
                recommendation["expires_at"],
            ),
            "lifecycle_not_active",
        )
        self.assertEqual(
            assess_director_recommendation(
                recommendation,
                state,
                state["clock"]["deadline_at"],
            ),
            "deadline_elapsed",
        )
        self.assertEqual(
            assess_director_recommendation(
                recommendation,
                state,
                "2026-08-18T23:30:00.001Z",
            ),
            "deadline_elapsed",
        )
        self.assertFalse(
            is_interview_runtime_state(
                {
                    **state,
                    "last_finalized_candidate_transcript_revision": None,
                }
            )
        )
        self.assertFalse(
            is_interview_runtime_state(
                {
                    **state,
                    "clock": {
                        **state["clock"],
                        "remaining_ms": state["clock"]["remaining_ms"] - 1,
                    },
                }
            )
        )
        self.assertFalse(
            is_interview_runtime_state(
                {
                    **state,
                    "clock": {**state["clock"], "band": "elapsed"},
                }
            )
        )
        elapsed_clock = {
            **state["clock"],
            "observed_at": state["clock"]["deadline_at"],
            "remaining_ms": 0,
            "band": "elapsed",
        }
        self.assertEqual(
            assess_director_recommendation(
                recommendation,
                {
                    **state,
                    "clock": elapsed_clock,
                    "close_state": "requested",
                },
                state["clock"]["deadline_at"],
            ),
            "deadline_elapsed",
        )
        self.assertFalse(
            is_interview_runtime_state({**state, "clock": elapsed_clock})
        )
        self.assertTrue(
            is_interview_runtime_state(
                {
                    **state,
                    "clock": elapsed_clock,
                    "close_state": "requested",
                }
            )
        )
        self.assertFalse(
            is_interview_runtime_state(
                {
                    **state,
                    "lifecycle_snapshot": {
                        **state["lifecycle_snapshot"],
                        "version": 0,
                    },
                }
            )
        )
        self.assertFalse(
            is_interview_runtime_state(
                {
                    **state,
                    "probe_ledger": [
                        *state["probe_ledger"],
                        state["probe_ledger"][0],
                    ],
                }
            )
        )
        self.assertFalse(
            is_interview_runtime_state(
                {
                    **state,
                    "controller_phase": "closing",
                    "close_state": "open",
                }
            )
        )
        self.assertFalse(
            is_interview_runtime_state(
                {
                    **state,
                    "controller_phase": "follow_up",
                    "close_state": "admitted",
                }
            )
        )

    def test_mutation_digest_and_idempotency_are_key_order_independent(self):
        fixtures = self._interviewer_contract_fixtures()
        for raw in (fixtures["tool_requests"][3], fixtures["tool_requests"][4]):
            original = parse_interviewer_tool_request(raw)
            self.assertEqual(
                calculate_interviewer_mutation_request_digest(original),
                original["request_digest"],
            )
            reordered_raw = dict(reversed(list(raw.items())))
            reordered_raw["call_id"] = f'{original["call_id"]}-retry'
            reordered = parse_interviewer_tool_request(reordered_raw)
            self.assertEqual(
                assess_interviewer_mutation_replay(original, reordered),
                "duplicate",
            )
            changed = {
                **original,
                "deadline_at": "2026-08-18T23:10:00.049Z",
            }
            changed["request_digest"] = (
                calculate_interviewer_mutation_request_digest(changed)
            )
            parsed_changed = parse_interviewer_tool_request(changed)
            self.assertEqual(
                assess_interviewer_mutation_replay(
                    original, parsed_changed
                ),
                "idempotency_conflict",
            )
            with self.assertRaises(InterviewerContractError):
                parse_interviewer_tool_request(
                    {**changed, "request_digest": original["request_digest"]}
                )

    def test_delivery_attribution_binds_transcript_prefix_marker_and_replay(self):
        fixtures = self._interviewer_contract_fixtures()
        entry = fixtures["runtime_state"]["probe_ledger"][0]
        transcript = fixtures["canonical_transcript"]
        self.assertEqual(
            assess_interview_probe_ledger_attribution(entry, transcript),
            "attributed",
        )
        self.assertEqual(
            assess_interview_probe_ledger_attribution(
                entry, [*transcript, transcript[0]]
            ),
            "attributed",
        )
        partial_event = {
            **transcript[0],
            "delivery_state": "partially_delivered",
        }
        partial_entry = {
            **entry,
            "delivery_state": "interrupted",
            "delivery_evidence": {
                **entry["delivery_evidence"],
                "delivery_state": "partially_delivered",
            },
        }
        self.assertEqual(
            assess_interview_probe_ledger_attribution(
                partial_entry, [partial_event]
            ),
            "attributed",
        )
        self.assertTrue(
            is_interview_runtime_state(
                {
                    **fixtures["runtime_state"],
                    "probe_ledger": [partial_entry],
                }
            )
        )
        marker = fixtures["interruption_without_prefix"]
        marker_entry = {
            **entry,
            "delivery_state": "interrupted",
            "delivery_evidence": {
                "evidence_type": "interruption_marker",
                "event_id": marker["event_id"],
                "writer_id": marker["writer_id"],
                "writer_generation": marker["writer_generation"],
                "sequence": marker["sequence"],
                "reason": "no_provider_confirmed_prefix",
            },
        }
        self.assertEqual(
            assess_interview_probe_ledger_attribution(
                marker_entry, [marker]
            ),
            "attributed",
        )
        self.assertTrue(
            is_interview_runtime_state(
                {
                    **fixtures["runtime_state"],
                    "probe_ledger": [marker_entry],
                }
            )
        )
        self.assertEqual(
            assess_interview_probe_ledger_attribution(
                entry,
                [{**transcript[0], "sequence": transcript[0]["sequence"] + 1}],
            ),
            "identity_mismatch",
        )

    def test_fresh_state_admission_enforces_independent_lifecycle_cas(self):
        fixtures = self._interviewer_contract_fixtures()
        request = parse_interviewer_tool_request(fixtures["tool_requests"][3])
        state = parse_interview_runtime_state(fixtures["runtime_state"])
        now = "2026-08-18T23:10:00.049Z"
        self.assertEqual(
            assess_interviewer_tool_request_against_state(
                request, state, now
            ),
            "eligible",
        )
        self.assertEqual(
            assess_interviewer_tool_request_against_state(
                request,
                {**state, "state_revision": state["state_revision"] + 1},
                now,
            ),
            "stale_state",
        )
        self.assertEqual(
            assess_interviewer_tool_request_against_state(
                request,
                {
                    **state,
                    "lifecycle_snapshot": {
                        **state["lifecycle_snapshot"],
                        "version": state["lifecycle_snapshot"]["version"] + 1,
                    },
                },
                now,
            ),
            "stale_lifecycle",
        )
        self.assertEqual(
            assess_interviewer_tool_request_against_state(
                {
                    **request,
                    "move": {
                        **request["move"],
                        "target": {
                            **request["move"]["target"],
                            "question_id": "question-another",
                        },
                    },
                },
                state,
                now,
            ),
            "question_mismatch",
        )
        extended = {
            **request,
            "deadline_at": "2026-08-18T23:10:20.000Z",
        }
        extended["request_digest"] = (
            calculate_interviewer_mutation_request_digest(extended)
        )
        extended_request = parse_interviewer_tool_request(extended)
        self.assertEqual(
            assess_interviewer_tool_request_against_state(
                extended_request,
                state,
                request["move"]["expires_at"],
            ),
            "eligible",
        )
        self.assertEqual(
            assess_interviewer_tool_request_against_state(
                extended_request,
                state,
                "2026-08-18T23:10:10.001Z",
            ),
            "move_expired",
        )

    def test_state_sensitive_tool_admission_fences_deadline_and_allowed_moves(self):
        fixtures = self._interviewer_contract_fixtures()
        state = parse_interview_runtime_state(
            {
                **fixtures["runtime_state"],
                "clock": {
                    **fixtures["runtime_state"]["clock"],
                    "deadline_at": "2026-08-18T23:10:05.000Z",
                    "remaining_ms": 5_000,
                },
            }
        )
        request_deadline = "2026-08-18T23:10:20.000Z"
        before_deadline = "2026-08-18T23:10:04.999Z"
        at_deadline = state["clock"]["deadline_at"]
        after_deadline = "2026-08-18T23:10:05.001Z"
        probe = parse_interviewer_tool_request(
            {**fixtures["tool_requests"][2], "deadline_at": request_deadline}
        )
        commit_input = {
            **parse_interviewer_tool_request(fixtures["tool_requests"][3]),
            "deadline_at": request_deadline,
        }
        commit_input["request_digest"] = (
            calculate_interviewer_mutation_request_digest(commit_input)
        )
        commit = parse_interviewer_tool_request(commit_input)
        close_input = {
            **parse_interviewer_tool_request(fixtures["tool_requests"][4]),
            "deadline_at": request_deadline,
        }
        close_input["request_digest"] = (
            calculate_interviewer_mutation_request_digest(close_input)
        )
        close = parse_interviewer_tool_request(close_input)

        for request in (probe, commit, close):
            self.assertEqual(
                assess_interviewer_tool_request_against_state(
                    request, state, before_deadline
                ),
                "eligible",
            )
            self.assertEqual(
                assess_interviewer_tool_request_against_state(
                    request, state, at_deadline
                ),
                "deadline_elapsed",
            )
            self.assertEqual(
                assess_interviewer_tool_request_against_state(
                    request, state, after_deadline
                ),
                "deadline_elapsed",
            )

        read_only = parse_interviewer_tool_request(
            {**fixtures["tool_requests"][0], "deadline_at": request_deadline}
        )
        self.assertEqual(
            assess_interviewer_tool_request_against_state(
                read_only, state, at_deadline
            ),
            "eligible",
        )
        for request, denied_move in (
            (probe, "probe"),
            (commit, "challenge"),
            (close, "close"),
        ):
            self.assertEqual(
                assess_interviewer_tool_request_against_state(
                    request,
                    {
                        **state,
                        "allowed_moves": [
                            move
                            for move in state["allowed_moves"]
                            if move != denied_move
                        ],
                    },
                    before_deadline,
                ),
                "move_not_allowed",
            )

    def test_tool_result_pending_request_correlation_matrix(self):
        fixtures = self._interviewer_contract_fixtures()
        request = parse_interviewer_tool_request(fixtures["tool_requests"][0])
        result = parse_interviewer_tool_result(fixtures["tool_results"][0])
        before_deadline = "2026-08-18T23:10:00.049Z"
        self.assertEqual(
            assess_interviewer_tool_result_for_request(
                request, result, before_deadline
            ),
            "matched",
        )
        self.assertEqual(
            assess_interviewer_tool_result_for_request(
                request, result, request["deadline_at"]
            ),
            "request_expired",
        )
        failure = {
            **result,
            "status": "timeout",
            "payload": None,
            "failure_code": "timeout",
        }
        identity_matrix = (
            ("call_id_mismatch", {**failure, "call_id": "call-another"}),
            (
                "tool_name_mismatch",
                {**failure, "tool_name": "read_interview_clock"},
            ),
            (
                "session_mismatch",
                {**failure, "session_id": "session-another"},
            ),
            (
                "writer_mismatch",
                {**failure, "writer_id": "writer-another"},
            ),
            (
                "writer_generation_mismatch",
                {
                    **failure,
                    "writer_generation": failure["writer_generation"] + 1,
                },
            ),
        )
        for expected, mismatch in identity_matrix:
            self.assertEqual(
                assess_interviewer_tool_result_for_request(
                    request,
                    parse_interviewer_tool_result(mismatch),
                    before_deadline,
                ),
                expected,
            )

        probe_request = parse_interviewer_tool_request(
            fixtures["tool_requests"][2]
        )
        probe_result = parse_interviewer_tool_result(
            {
                **failure,
                "tool_name": "get_probe_candidates",
                "call_id": probe_request["call_id"],
                "payload": {"probe_candidates": []},
                "status": "ok",
                "failure_code": None,
            }
        )
        self.assertEqual(
            assess_interviewer_tool_result_for_request(
                probe_request,
                {**probe_result, "observed_state_revision": 8},
                before_deadline,
            ),
            "state_revision_mismatch",
        )
        self.assertEqual(
            assess_interviewer_tool_result_for_request(
                probe_request,
                {**probe_result, "observed_lifecycle_version": 3},
                before_deadline,
            ),
            "lifecycle_version_mismatch",
        )
        substituted_probe_result = parse_interviewer_tool_result(
            {
                **probe_result,
                "payload": {
                    "probe_candidates": [
                        {
                            "probe_candidate_id": "probe-substituted-question",
                            "move_type": "probe",
                            "question_id": "question-another",
                            "topic": "A valid topic",
                            "reason_code": "deepen_reasoning",
                        }
                    ]
                },
            }
        )
        self.assertEqual(
            assess_interviewer_tool_result_for_request(
                probe_request,
                substituted_probe_result,
                before_deadline,
            ),
            "question_mismatch",
        )

    def test_probe_reasons_and_wire_timestamps_fail_closed(self):
        fixtures = self._interviewer_contract_fixtures()
        timeout = fixtures["tool_results"][1]
        with self.assertRaises(InterviewerContractError):
            parse_interviewer_tool_result(
                {
                    **timeout,
                    "status": "ok",
                    "failure_code": None,
                    "payload": {
                        "probe_candidates": [
                            {
                                "probe_candidate_id": "probe-invalid-reason",
                                "move_type": "probe",
                                "question_id": fixtures["brief"][
                                    "selected_question"
                                ]["id"],
                                "topic": "A valid topic",
                                "reason_code": "test_tradeoff",
                            }
                        ]
                    },
                }
            )
        with self.assertRaises(InterviewerContractError):
            parse_interview_brief_v2(
                {**fixtures["brief"], "deadline_at": 1_787_096_600_000}
            )
        with self.assertRaises(InterviewerContractError):
            parse_interviewer_tool_request(
                {
                    **fixtures["tool_requests"][0],
                    "deadline_at": datetime.now(timezone.utc),
                }
            )

    def test_stateful_contract_keeps_demo_and_no_coaching_behavior_unchanged(self):
        fixtures = self._interviewer_contract_fixtures()
        brief = parse_interview_brief_v2(fixtures["brief"])

        self.assertEqual(brief["policy"]["coaching"], "forbidden")
        self.assertEqual(brief["policy"]["hints"], "forbidden")
        self.assertEqual(
            brief["policy"]["evaluation_timing"],
            "post_interview_only",
        )
        self.assertEqual(
            brief["policy"]["prompt_contract_version"],
            FULL_INTERVIEW_PROMPT_CONTRACT.version,
        )
        self.assertEqual(DEMO_PROMPT_CONTRACT.version, "public_demo_prompt_v1")
        self.assertEqual(DEMO_PROMPT_CONTRACT.mode, "public_demo")
        serialized = json.dumps(brief)
        for forbidden_key in (
            "candidate_identity",
            "email",
            "transcript",
            "director",
            "tool_result",
        ):
            self.assertNotIn(forbidden_key, serialized)



if __name__ == "__main__":
    unittest.main()
