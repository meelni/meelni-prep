import hashlib
import hmac
import json
import sys
import unittest
import asyncio
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.interview_director import DirectorError
from shared.production_director_runtime import (
    ADMISSION_DOMAIN,
    ATTEMPT_RESERVATION_NANO_USD,
    DIRECTOR_DEADLINE_MS,
    MAXIMUM_ATTEMPTS,
    PRODUCTION_ADMISSION_VERSION,
    PRODUCTION_CONFIG_SHA256,
    RECOMMENDATION_TTL_MS,
    ROLLOUT_CONFIG_SHA256,
    SELECTED_CONFIG_SHA256,
    SESSION_BUDGET_NANO_USD,
    ProductionDirectorSpendLedger,
    create_production_director_runtime,
    _verify_admission,
)


SESSION = "10000000-0000-4000-8000-000000000001"
ROOM = f"interview-{SESSION}"
DEADLINE = "2026-08-21T20:30:00.000Z"
SECRET = "test-livekit-secret"
SHA = "a" * 40
NOW = datetime(2026, 8, 21, 20, 0, tzinfo=timezone.utc)


class ProductionDirectorAdmissionTests(unittest.TestCase):
    def test_exact_admission_verifies_and_tampering_fails_closed(self):
        admission = signed_admission()
        _verify_admission(
            admission,
            env=enabled_env(),
            expected_session_id=SESSION,
            expected_room_name=ROOM,
            expected_deadline_at=DEADLINE,
            now=NOW,
        )
        for key, value in (
            ("session_id", "other-session"),
            ("room_name", "other-room"),
            ("maximum_attempts", 11),
            ("signature", {"algorithm": "hmac-sha256", "value": "0" * 64}),
        ):
            tampered = {**admission, key: value}
            with self.assertRaises(DirectorError):
                _verify_admission(
                    tampered,
                    env=enabled_env(),
                    expected_session_id=SESSION,
                    expected_room_name=ROOM,
                    expected_deadline_at=DEADLINE,
                    now=NOW,
                )

    def test_worker_requires_every_exact_flag_and_candidate(self):
        for key in (
            "MEELNI_INTERVIEW_BRIEF_V2_ENABLED",
            "MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED",
            "MEELNI_INTERVIEW_TOOLS_V1_ENABLED",
            "MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED",
            "MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED",
        ):
            env = enabled_env()
            env[key] = "false"
            with self.assertRaises(DirectorError):
                _verify_admission(
                    signed_admission(),
                    env=env,
                    expected_session_id=SESSION,
                    expected_room_name=ROOM,
                    expected_deadline_at=DEADLINE,
                    now=NOW,
                )

    def test_expired_admission_fails_before_provider_construction(self):
        expired = signed_admission(deadline_at="2026-08-21T20:00:00.000Z")
        result = create_production_director_runtime(
            expired,
            env={**enabled_env(), "OPENAI_API_KEY": "not-read-on-expiry"},
            expected_session_id=SESSION,
            expected_room_name=ROOM,
            expected_deadline_at="2026-08-21T20:00:00.000Z",
            now=NOW,
        )
        self.assertEqual(result.status, "unavailable")
        self.assertIsNone(result.adapter)

    def test_ledger_reserves_before_attempt_and_stops_at_session_ceiling(self):
        ledger = ProductionDirectorSpendLedger()
        for expected in range(1, MAXIMUM_ATTEMPTS + 1):
            ordinal = ledger.reserve()
            self.assertEqual(ordinal, expected)
            ledger.reconcile(ordinal, normalized_cost_nano_usd=None)
        self.assertEqual(ledger.reconciled_nano_usd, SESSION_BUDGET_NANO_USD)
        with self.assertRaisesRegex(DirectorError, "capacity"):
            ledger.reserve()

    def test_cancelled_and_failed_attempts_retain_the_reservation(self):
        ledger = ProductionDirectorSpendLedger()
        first = ledger.reserve()
        ledger.reconcile(first, normalized_cost_nano_usd=None)
        second = ledger.reserve()
        ledger.reconcile(second, normalized_cost_nano_usd=150_000_000)
        self.assertEqual(ledger.reconciled_nano_usd, 250_000_000)

    def test_real_pinned_sdk_is_constructed_only_after_exact_admission(self):
        env = enabled_env()
        env["OPENAI_API_KEY"] = "sk-provider-free-construction-only"
        ready = create_production_director_runtime(
            signed_admission(),
            env=env,
            expected_session_id=SESSION,
            expected_room_name=ROOM,
            expected_deadline_at=DEADLINE,
            now=NOW,
        )
        self.assertEqual((ready.status, ready.reason), ("ready", "admission_verified"))
        self.assertIsNotNone(ready.adapter)
        asyncio.run(ready.adapter.close(affinity_key=f"affinity:{'a' * 64}"))
        unavailable = create_production_director_runtime(
            {**signed_admission(), "room_name": "wrong-room"},
            env=env,
            expected_session_id=SESSION,
            expected_room_name=ROOM,
            expected_deadline_at=DEADLINE,
            now=NOW,
        )
        self.assertEqual(unavailable.status, "unavailable")
        self.assertIsNone(unavailable.adapter)


def payload(*, deadline_at=DEADLINE):
    return {
        "adapter_id": "meelni_director_openai_responses",
        "adapter_version": "interview-director-adapter.openai-responses.v1",
        "attempt_reservation_nano_usd": ATTEMPT_RESERVATION_NANO_USD,
        "candidate_git_sha": SHA,
        "cohort": "canary",
        "configuration_sha256": PRODUCTION_CONFIG_SHA256,
        "contract_version": PRODUCTION_ADMISSION_VERSION,
        "deadline_at": deadline_at,
        "director_deadline_ms": DIRECTOR_DEADLINE_MS,
        "environment": "production",
        "exposure": "default",
        "maximum_attempts": MAXIMUM_ATTEMPTS,
        "model": "gpt-5.4-mini-2026-03-17",
        "provider": "openai-api",
        "recommendation_ttl_ms": RECOMMENDATION_TTL_MS,
        "repository_rollout_configuration_sha256": ROLLOUT_CONFIG_SHA256,
        "request_fingerprint": "b" * 64,
        "room_name": ROOM,
        "selected_candidate_configuration_sha256": SELECTED_CONFIG_SHA256,
        "session_budget_nano_usd": SESSION_BUDGET_NANO_USD,
        "session_id": SESSION,
        "stage": "candidate_default",
    }


def signed_admission(*, deadline_at=DEADLINE):
    value = payload(deadline_at=deadline_at)
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    signature = hmac.new(
        SECRET.encode(), ADMISSION_DOMAIN + encoded, hashlib.sha256
    ).hexdigest()
    return {**value, "signature": {"algorithm": "hmac-sha256", "value": signature}}


def enabled_env():
    return {
        "LIVEKIT_API_SECRET": SECRET,
        "MEELNI_ADAPTIVE_INTERVIEWER_STAGE": "candidate_default",
        "MEELNI_ADAPTIVE_INTERVIEWER_ENVIRONMENT": "production",
        "MEELNI_ADAPTIVE_INTERVIEWER_COHORT": "canary",
        "MEELNI_ADAPTIVE_INTERVIEWER_EXPOSURE": "default",
        "MEELNI_ADAPTIVE_INTERVIEWER_CONFIG_SHA256": PRODUCTION_CONFIG_SHA256,
        "MEELNI_ADAPTIVE_INTERVIEWER_CANDIDATE_SHA": SHA,
        "MEELNI_INTERVIEW_BRIEF_V2_ENABLED": "true",
        "MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED": "true",
        "MEELNI_INTERVIEW_TOOLS_V1_ENABLED": "true",
        "MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED": "true",
        "MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED": "true",
    }


if __name__ == "__main__":
    unittest.main()
