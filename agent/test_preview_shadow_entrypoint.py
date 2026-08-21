#!/usr/bin/env python3
"""Provider-free tests for the explicit Preview-shadow worker bridge."""

from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

from shared.preview_shadow_control_plane_client import (  # noqa: E402
    HttpDurableControlPlaneAdmissionVerifier,
    PreviewShadowControlPlaneClientError,
    _post_json,
    submit_preview_shadow_terminal_evidence,
)
from shared.preview_shadow_entrypoint import (  # noqa: E402
    create_preview_shadow_entrypoint_runtime,
    is_preview_shadow_job_metadata,
)

NOW = datetime(2026, 8, 20, 8, 30, tzinfo=timezone.utc)
PROTECTION_BYPASS = "B" * 32
CONTROL_PLANE_ENDPOINT = (
    "https://meelni-env-staging-meelni.vercel.app/api/internal/preview-shadow"
)


class PreviewShadowEntrypointTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        fixture = json.loads(
            Path(
                "docs/evidence/adaptive-interviewer-preview-shadow-cross-runtime-digests.json"
            ).read_text()
        )
        self.metadata = fixture["job_metadata"]
        self.contents = json.dumps(self.metadata, separators=(",", ":"))
        self.lease = self.metadata["lease"]
        self.calls: list[dict[str, object]] = []

    def post(self, _endpoint, payload, _timeout, protection_bypass):
        self.assertEqual(protection_bypass, PROTECTION_BYPASS)
        self.calls.append(dict(payload))
        lease = payload["payload"]["lease"]
        return {
            "contract_version": "adaptive-interviewer-preview-shadow-worker-request.v1",
            "ok": True,
            "action": "admit",
            "admitted": True,
            "run_id": lease["run_id"],
            "lease_id": lease["lease_id"],
            "revision": lease["allocation_ledger_revision"],
        }

    def test_exact_metadata_routes_and_wrong_environment_never_calls_admission(self):
        self.assertTrue(is_preview_shadow_job_metadata(self.contents))
        result = create_preview_shadow_entrypoint_runtime(
            job_metadata=self.contents,
            room_name=f"preview-shadow-{self.lease['session_binding_sha256']}",
            env={},
            now=NOW,
            post_json=self.post,
        )
        self.assertEqual((result.status, result.reason), (
            "unavailable",
            "live_stage_config_incomplete",
        ))
        self.assertEqual(self.calls, [])

    def test_exact_environment_requires_and_redacts_protection_bypass(self):
        env = {
            "MEELNI_PREVIEW_SHADOW_EXECUTION": "enabled",
            "MEELNI_PREVIEW_SHADOW_KILL_SWITCH": "open",
            "MEELNI_PREVIEW_SHADOW_RUN_ID": self.lease["run_id"],
            "MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA": self.lease[
                "candidate_git_sha"
            ],
            "MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL": (
                CONTROL_PLANE_ENDPOINT
            ),
            "MEELNI_PREVIEW_SHADOW_VERCEL_BYPASS_SECRET": PROTECTION_BYPASS,
            "OPENAI_API_KEY": "o" * 32,
        }
        result = create_preview_shadow_entrypoint_runtime(
            job_metadata=self.contents,
            room_name=f"preview-shadow-{self.lease['session_binding_sha256']}",
            env=env,
            now=NOW,
            post_json=self.post,
        )
        self.assertEqual((result.status, result.reason), (
            "ready",
            "admitted_session_lease",
        ))
        self.assertNotIn(PROTECTION_BYPASS, repr(result))

        without_bypass = {**env}
        without_bypass.pop("MEELNI_PREVIEW_SHADOW_VERCEL_BYPASS_SECRET")
        rejected = create_preview_shadow_entrypoint_runtime(
            job_metadata=self.contents,
            room_name=f"preview-shadow-{self.lease['session_binding_sha256']}",
            env=without_bypass,
            now=NOW,
            post_json=self.post,
        )
        self.assertEqual(rejected.status, "unavailable")

    def test_ordinary_production_metadata_never_enters_shadow_even_when_enabled(self):
        ordinary = json.dumps(
            {
                "session_id": "session_ordinary",
                "candidate_identity": "candidate_ordinary",
            },
            separators=(",", ":"),
        )
        self.assertFalse(is_preview_shadow_job_metadata(""))
        self.assertFalse(is_preview_shadow_job_metadata("{}"))
        self.assertFalse(is_preview_shadow_job_metadata(ordinary))
        self.assertEqual(self.calls, [])

    def test_http_admission_binds_exact_run_lease_and_revision(self):
        verifier = HttpDurableControlPlaneAdmissionVerifier(
            endpoint=CONTROL_PLANE_ENDPOINT,
            worker_evidence_capability=self.metadata[
                "worker_evidence_capability"
            ],
            protection_bypass_secret=PROTECTION_BYPASS,
            post_json=self.post,
        )
        from shared.preview_shadow_runtime import parse_preview_shadow_session_lease

        parsed = parse_preview_shadow_session_lease(
            self.lease,
            expected_run_id=self.lease["run_id"],
            expected_candidate_git_sha=self.lease["candidate_git_sha"],
            expected_session_binding_sha256=self.lease[
                "session_binding_sha256"
            ],
            now=NOW,
        )
        self.assertTrue(verifier.verify_admitted_session_lease(parsed))
        self.assertEqual(len(self.calls), 1)
        self.assertNotIn(
            self.metadata["worker_evidence_capability"], repr(verifier)
        )
        self.assertNotIn(PROTECTION_BYPASS, repr(verifier))

    def test_default_https_transport_sends_bypass_only_as_a_header(self):
        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _maximum):
                return b'{"ok":true}'

        captured = []

        def open_request(request, timeout):
            captured.append((request, timeout))
            return Response()

        with patch(
            "shared.preview_shadow_control_plane_client.urlopen",
            open_request,
        ):
            self.assertEqual(
                _post_json(
                    CONTROL_PLANE_ENDPOINT,
                    {"action": "admit"},
                    5.0,
                    PROTECTION_BYPASS,
                ),
                {"ok": True},
            )
        request, timeout = captured[0]
        self.assertEqual(timeout, 5.0)
        self.assertEqual(
            request.get_header("X-vercel-protection-bypass"),
            PROTECTION_BYPASS,
        )
        self.assertNotIn(PROTECTION_BYPASS, request.data.decode("utf-8"))

    async def test_terminal_reconciliation_is_closed_and_endpoint_is_https_only(self):
        def reconcile(_endpoint, payload, _timeout, protection_bypass):
            self.assertEqual(protection_bypass, PROTECTION_BYPASS)
            self.calls.append(dict(payload))
            return {
                "contract_version": "adaptive-interviewer-preview-shadow-worker-request.v1",
                "ok": True,
                "action": "reconcile",
                "outcome": "recorded",
                "revision": 3,
                "stopped": False,
            }

        result = await submit_preview_shadow_terminal_evidence(
            endpoint=CONTROL_PLANE_ENDPOINT,
            submission={
                "kind": "receipt",
                "runId": self.lease["run_id"],
                "expectedRevision": 2,
                "workerEvidenceCapability": self.metadata[
                    "worker_evidence_capability"
                ],
                "evidence": {"receipt_id": "f" * 64},
            },
            protection_bypass_secret=PROTECTION_BYPASS,
            post_json=reconcile,
        )
        self.assertEqual(result["outcome"], "recorded")
        with self.assertRaises(PreviewShadowControlPlaneClientError):
            HttpDurableControlPlaneAdmissionVerifier(
                endpoint="http://127.0.0.1/api/internal/preview-shadow",
                worker_evidence_capability="A" * 43,
                protection_bypass_secret=PROTECTION_BYPASS,
            )

    async def test_terminal_reconciliation_retries_ambiguous_transport_idempotently(self):
        attempts = 0

        def reconcile(_endpoint, payload, _timeout, protection_bypass):
            nonlocal attempts
            self.assertEqual(protection_bypass, PROTECTION_BYPASS)
            attempts += 1
            self.calls.append(dict(payload))
            if attempts == 1:
                raise TimeoutError("provider-body-must-not-escape")
            return {
                "contract_version": "adaptive-interviewer-preview-shadow-worker-request.v1",
                "ok": True,
                "action": "reconcile",
                "outcome": "replayed",
                "revision": 3,
                "stopped": False,
            }

        result = await submit_preview_shadow_terminal_evidence(
            endpoint=CONTROL_PLANE_ENDPOINT,
            submission={
                "kind": "receipt",
                "runId": self.lease["run_id"],
                "expectedRevision": 2,
                "workerEvidenceCapability": self.metadata[
                    "worker_evidence_capability"
                ],
                "evidence": {"receipt_id": "f" * 64},
            },
            protection_bypass_secret=PROTECTION_BYPASS,
            post_json=reconcile,
        )

        self.assertEqual((attempts, result["outcome"]), (2, "replayed"))
        self.assertEqual(self.calls[0], self.calls[1])


if __name__ == "__main__":
    unittest.main()
