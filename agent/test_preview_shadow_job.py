#!/usr/bin/env python3
"""Provider-free contracts for Preview-shadow LiveKit job wiring."""

from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.openai_responses_director_adapter import (  # noqa: E402
    ProviderFreeFakeOpenAIResponsesTransport,
)
from shared.preview_shadow_job import (  # noqa: E402
    PREVIEW_SHADOW_JOB_METADATA_VERSION,
    PreviewShadowJobAdmission,
    PreviewShadowJobError,
    create_preview_shadow_director_session,
    create_preview_shadow_job_runtime,
    parse_preview_shadow_job_metadata,
)
from shared.preview_shadow_runtime import (  # noqa: E402
    PREVIEW_SHADOW_CONFIGURATION_SHA256,
    PREVIEW_SHADOW_DURABLE_ADMISSION_VERIFIER_VERSION,
    PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION,
    PREVIEW_SHADOW_SESSION_LEASE_VERSION,
    _digest,
)


NOW = datetime(2026, 8, 20, 12, 30, tzinfo=timezone.utc)
RUN_ID = "a" * 64
AUTHORIZATION_ID = "b" * 64
CANDIDATE_SHA = "c" * 40
SESSION_BINDING = "d" * 64
WORKER_CAPABILITY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"


def lease_wire(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "contract_version": PREVIEW_SHADOW_SESSION_LEASE_VERSION,
        "run_id": RUN_ID,
        "authorization_id": AUTHORIZATION_ID,
        "candidate_git_sha": CANDIDATE_SHA,
        "preview_shadow_configuration_sha256": PREVIEW_SHADOW_CONFIGURATION_SHA256,
        "adapter_id": "meelni_director_openai_responses",
        "adapter_version": "interview-director-adapter.openai-responses.v1",
        "provider": "openai-api",
        "model": "gpt-5.4-mini-2026-03-17",
        "target_stage": "preview_shadow",
        "target_environment": "preview_staging",
        "target_cohort": "shadow",
        "exposure": "none",
        "session_ordinal": 1,
        "session_binding_sha256": SESSION_BINDING,
        "session_budget_nano_usd": 1_000_000_000,
        "maximum_attempts": 10,
        "attempt_reservation_nano_usd": 100_000_000,
        "issued_at": "2026-08-20T12:00:00.000Z",
        "expires_at": "2026-08-20T13:00:00.000Z",
        "allocation_ledger_revision": 1,
    }
    payload.update(overrides)
    lease_id = _digest(PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION, payload)
    return {**payload, "lease_id": lease_id, "integrity_sha256": lease_id}


def job_metadata(**overrides: object) -> str:
    payload: dict[str, object] = {
        "contract_version": PREVIEW_SHADOW_JOB_METADATA_VERSION,
        "lease": lease_wire(),
        "worker_evidence_capability": WORKER_CAPABILITY,
        "reconciliation_expected_revision": 1,
    }
    payload.update(overrides)
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


class AdmissionVerifier:
    contract_version = PREVIEW_SHADOW_DURABLE_ADMISSION_VERIFIER_VERSION

    def __init__(self, admitted: bool = True) -> None:
        self.admitted = admitted
        self.calls = 0

    def verify_admitted_session_lease(self, lease) -> bool:
        self.calls += 1
        return self.admitted and lease.run_id == RUN_ID


class SettledShadow:
    def settle(self) -> None:
        return None

    async def wait_idle(self, timeout_seconds: float) -> bool:
        del timeout_seconds
        return True

    async def shutdown(self) -> bool:
        return True


class PreviewShadowJobTests(unittest.IsolatedAsyncioTestCase):
    def test_admission_object_cannot_be_constructed_without_the_bootstrap(self):
        with self.assertRaises(PreviewShadowJobError) as caught:
            PreviewShadowJobAdmission(
                runtime=None,  # type: ignore[arg-type]
                reconciliation_expected_revision=1,
                worker_evidence_capability=WORKER_CAPABILITY,
                _sentinel=object(),
            )
        self.assertEqual(caught.exception.code, "runtime_unavailable")

    def test_checked_job_metadata_is_byte_identical_to_typescript_fixture(self):
        fixture = json.loads(
            Path(
                "docs/evidence/adaptive-interviewer-preview-shadow-cross-runtime-digests.json"
            ).read_text()
        )
        expected = json.dumps(
            fixture["job_metadata"], ensure_ascii=False, separators=(",", ":")
        )
        self.assertEqual(
            parse_preview_shadow_job_metadata(expected), fixture["job_metadata"]
        )

    def test_default_is_disabled_and_invalid_metadata_never_constructs_transport(self):
        self.assertEqual(create_preview_shadow_job_runtime().status, "disabled")
        transport_calls = 0

        def transport_factory(_lease):
            nonlocal transport_calls
            transport_calls += 1
            return ProviderFreeFakeOpenAIResponsesTransport()

        invalid = create_preview_shadow_job_runtime(
            job_metadata="{}",
            expected_run_id=RUN_ID,
            expected_candidate_git_sha=CANDIDATE_SHA,
            expected_session_binding_sha256=SESSION_BINDING,
            now=NOW,
            admission_verifier=AdmissionVerifier(),
            transport_factory=transport_factory,
            kill_switch_open=True,
        )
        self.assertEqual((invalid.status, invalid.reason), (
            "unavailable",
            "job_metadata_invalid",
        ))
        self.assertEqual(transport_calls, 0)

    def test_exact_job_metadata_constructs_only_through_injected_admission(self):
        verifier = AdmissionVerifier()
        transport_calls = 0

        def transport_factory(_lease):
            nonlocal transport_calls
            transport_calls += 1
            return ProviderFreeFakeOpenAIResponsesTransport()

        constructed = create_preview_shadow_job_runtime(
            job_metadata=job_metadata(),
            expected_run_id=RUN_ID,
            expected_candidate_git_sha=CANDIDATE_SHA,
            expected_session_binding_sha256=SESSION_BINDING,
            now=NOW,
            admission_verifier=verifier,
            transport_factory=transport_factory,
            kill_switch_open=True,
        )
        self.assertEqual((constructed.status, constructed.reason), (
            "ready",
            "admitted_session_lease",
        ))
        self.assertIsNotNone(constructed.admission)
        self.assertEqual(verifier.calls, 1)
        self.assertEqual(transport_calls, 1)
        self.assertNotIn(WORKER_CAPABILITY, repr(constructed.admission))

        assert constructed.admission is not None
        shadow = create_preview_shadow_director_session(
            constructed.admission,
            session_id="preview-shadow-session",
            state_provider=lambda: None,
        )
        self.assertFalse(shadow.enabled)
        self.assertEqual(shadow.failure_reason, "authority_unavailable")

    def test_rejected_durable_admission_never_constructs_transport(self):
        transport_calls = 0

        def transport_factory(_lease):
            nonlocal transport_calls
            transport_calls += 1
            return ProviderFreeFakeOpenAIResponsesTransport()

        constructed = create_preview_shadow_job_runtime(
            job_metadata=job_metadata(),
            expected_run_id=RUN_ID,
            expected_candidate_git_sha=CANDIDATE_SHA,
            expected_session_binding_sha256=SESSION_BINDING,
            now=NOW,
            admission_verifier=AdmissionVerifier(admitted=False),
            transport_factory=transport_factory,
            kill_switch_open=True,
        )
        self.assertEqual(constructed.status, "unavailable")
        self.assertEqual(constructed.reason, "session_lease_not_admitted")
        self.assertEqual(transport_calls, 0)

    async def test_terminal_submission_is_exact_and_capability_stays_out_of_evidence(self):
        constructed = create_preview_shadow_job_runtime(
            job_metadata=job_metadata(),
            expected_run_id=RUN_ID,
            expected_candidate_git_sha=CANDIDATE_SHA,
            expected_session_binding_sha256=SESSION_BINDING,
            now=NOW,
            admission_verifier=AdmissionVerifier(),
            transport_factory=lambda _lease: ProviderFreeFakeOpenAIResponsesTransport(),
            kill_switch_open=True,
        )
        assert constructed.admission is not None
        self.assertTrue(
            await constructed.admission.runtime.settle_shadow(SettledShadow())
        )
        submission = constructed.admission.create_terminal_submission()
        self.assertEqual(submission["kind"], "receipt")
        self.assertEqual(submission["runId"], RUN_ID)
        self.assertEqual(submission["expectedRevision"], 1)
        self.assertEqual(
            submission["workerEvidenceCapability"], WORKER_CAPABILITY
        )
        evidence = submission["evidence"]
        self.assertIsInstance(evidence, dict)
        self.assertNotIn(WORKER_CAPABILITY, json.dumps(evidence))

    def test_parser_rejects_duplicates_oversize_and_wrong_revision(self):
        duplicate = job_metadata().replace(
            '"contract_version":',
            '"contract_version":"duplicate","contract_version":',
            1,
        )
        for contents in (
            duplicate,
            " " * (16 * 1_024 + 1),
            "[" * 33 + "]" * 33,
            '{"contract_version":NaN}',
            job_metadata(reconciliation_expected_revision=0),
            job_metadata(worker_evidence_capability="A" * 42),
        ):
            with self.subTest(length=len(contents)):
                with self.assertRaises(PreviewShadowJobError) as caught:
                    parse_preview_shadow_job_metadata(contents)
                self.assertEqual(caught.exception.code, "invalid_job_metadata")


if __name__ == "__main__":
    unittest.main()
