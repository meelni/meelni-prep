#!/usr/bin/env python3
"""Provider-free contracts for the isolated synthetic Shadow voice seam."""

from __future__ import annotations

import asyncio
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.preview_shadow_voice_session import (  # noqa: E402
    PREVIEW_SHADOW_SYNTHETIC_ROOM_VERSION,
    PreviewShadowVoiceSessionError,
    SyntheticDirectorAuthority,
    _SyntheticSettledSession,
    parse_preview_shadow_synthetic_room_metadata,
)

NOW = datetime(2026, 8, 21, 12, 0, tzinfo=timezone.utc)
BINDING = "a" * 64
ROOM_NAME = f"preview-shadow-{BINDING}"
EXPIRES_AT = "2026-08-21T12:30:00.000Z"


def room_metadata(**overrides: object) -> str:
    value: dict[str, object] = {
        "contract_version": PREVIEW_SHADOW_SYNTHETIC_ROOM_VERSION,
        "topology": "production_project_shadow",
        "session_binding_sha256": BINDING,
        "round": "product_sense",
        "voice_condition": "baseline_final_turn",
        "expires_at": EXPIRES_AT,
    }
    value.update(overrides)
    return json.dumps(value, separators=(",", ":"))


class PreviewShadowVoiceSessionTests(unittest.TestCase):
    def test_exact_closed_room_builds_private_authority(self):
        parsed = parse_preview_shadow_synthetic_room_metadata(
            room_metadata(),
            room_name=ROOM_NAME,
            expected_session_binding_sha256=BINDING,
            expected_expires_at=EXPIRES_AT,
            now=NOW,
        )
        self.assertEqual(
            (parsed.round, parsed.voice_condition),
            ("product_sense", "baseline_final_turn"),
        )
        authority = SyntheticDirectorAuthority(parsed, now=NOW)
        before = authority.state
        authority.observe_candidate(
            {
                "speaker": "user",
                "event_id": "shadow-turn-1",
                "text": "I would start by clarifying the user and desired outcome.",
                "audio_duration_ms": 2_000,
            }
        )
        self.assertEqual(authority.state.state_revision, before.state_revision + 1)
        self.assertEqual(
            authority.state.last_finalized_candidate_turn_id,
            "shadow-turn-1",
        )
        self.assertNotIn("transcript_ingest", json.dumps(authority.read()))

    def test_room_rejects_customer_fields_binding_drift_expiry_and_duplicates(self):
        invalid = [
            room_metadata(session_id="customer-session"),
            room_metadata(session_binding_sha256="b" * 64),
            room_metadata(expires_at="2026-08-21T11:59:59.000Z"),
            room_metadata(round="unknown"),
            room_metadata(voice_condition="unknown"),
            room_metadata()[:-1] + ',"round":"behavioral"}',
            "{" * 10 + "}" * 10,
        ]
        for contents in invalid:
            with self.subTest(contents=contents[:80]):
                with self.assertRaises(PreviewShadowVoiceSessionError):
                    parse_preview_shadow_synthetic_room_metadata(
                        contents,
                        room_name=ROOM_NAME,
                        expected_session_binding_sha256=BINDING,
                        expected_expires_at=EXPIRES_AT,
                        now=NOW,
                    )

    def test_room_name_and_exact_lease_expiry_are_independent_bindings(self):
        for changed in (
            {"room_name": f"preview-shadow-{'b' * 64}"},
            {"expected_expires_at": "2026-08-21T12:31:00.000Z"},
        ):
            with self.assertRaises(PreviewShadowVoiceSessionError):
                parse_preview_shadow_synthetic_room_metadata(
                    room_metadata(),
                    room_name=changed.get("room_name", ROOM_NAME),
                    expected_session_binding_sha256=BINDING,
                    expected_expires_at=changed.get(
                        "expected_expires_at", EXPIRES_AT
                    ),
                    now=NOW,
                )

    def test_entrypoint_returns_before_customer_runtime_markers(self):
        source = Path("agent/interview/agent.py").read_text()
        branch_start = source.index("if is_preview_shadow_job_metadata(job_metadata):")
        branch_return = source.index("\n        return", branch_start)
        ordinary_connect = source.index("await ctx.connect", branch_return)
        ordinary_metadata = source.index("parse_room_metadata", branch_return)
        self.assertLess(branch_return, ordinary_connect)
        self.assertLess(branch_return, ordinary_metadata)
        branch = source[branch_start:branch_return]
        for forbidden in (
            "register_runtime_writer",
            "read_runtime_lifecycle_snapshot",
            "create_interview_controller_adapter",
            "create_session_scoped_interviewer_tools",
            "DirectorInfluenceGate",
        ):
            self.assertNotIn(forbidden, branch)


class PreviewShadowVoiceSettlementTests(unittest.IsolatedAsyncioTestCase):
    async def test_composite_cleanup_requires_voice_and_director_confirmation(self):
        calls = []

        class Voice:
            async def aclose(self):
                calls.append("voice")

        class Director:
            def settle(self):
                calls.append("settle")

            async def wait_idle(self, timeout):
                calls.append(("idle", timeout))
                return True

            async def shutdown(self):
                calls.append("director")
                return True

        pending = asyncio.create_task(asyncio.sleep(30))
        tasks = {pending}
        composite = _SyntheticSettledSession(Director(), Voice(), tasks)
        composite.settle()
        self.assertTrue(await composite.wait_idle(0.1))
        self.assertTrue(await composite.shutdown())
        self.assertTrue(pending.cancelled())
        self.assertEqual(calls[0], "settle")
        self.assertEqual(calls[-2:], ["voice", "director"])

    async def test_voice_close_failure_never_claims_confirmed_cleanup(self):
        class Voice:
            async def aclose(self):
                raise RuntimeError("private-provider-body")

        class Director:
            def settle(self):
                return None

            async def wait_idle(self, _timeout):
                return True

            async def shutdown(self):
                return True

        composite = _SyntheticSettledSession(Director(), Voice(), set())
        self.assertFalse(await composite.shutdown())


if __name__ == "__main__":
    unittest.main()
