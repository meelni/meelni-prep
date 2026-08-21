#!/usr/bin/env python3
"""Provider-free tests for the explicit Preview-shadow worker bridge."""

from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.preview_shadow_control_plane_client import (  # noqa: E402
    HttpDurableControlPlaneAdmissionVerifier,
    PreviewShadowControlPlaneClientError,
    submit_preview_shadow_terminal_evidence,
)
from shared.preview_shadow_entrypoint import (  # noqa: E402
    create_preview_shadow_entrypoint_runtime,
    is_preview_shadow_job_metadata,
)

NOW = datetime(2026, 8, 20, 8, 30, tzinfo=timezone.utc)


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

    def post(self, _endpoint, payload, _timeout):
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

    def test_http_admission_binds_exact_run_lease_and_revision(self):
        verifier = HttpDurableControlPlaneAdmissionVerifier(
            endpoint="https://staging.example.test/api/internal/preview-shadow",
            worker_evidence_capability=self.metadata[
                "worker_evidence_capability"
            ],
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

    async def test_terminal_reconciliation_is_closed_and_endpoint_is_https_only(self):
        def reconcile(_endpoint, payload, _timeout):
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
            endpoint="https://staging.example.test/api/internal/preview-shadow",
            submission={
                "kind": "receipt",
                "runId": self.lease["run_id"],
                "expectedRevision": 2,
                "workerEvidenceCapability": self.metadata[
                    "worker_evidence_capability"
                ],
                "evidence": {"receipt_id": "f" * 64},
            },
            post_json=reconcile,
        )
        self.assertEqual(result["outcome"], "recorded")
        with self.assertRaises(PreviewShadowControlPlaneClientError):
            HttpDurableControlPlaneAdmissionVerifier(
                endpoint="http://127.0.0.1/api/internal/preview-shadow",
                worker_evidence_capability="A" * 43,
            )

    async def test_terminal_reconciliation_retries_ambiguous_transport_idempotently(self):
        attempts = 0

        def reconcile(_endpoint, payload, _timeout):
            nonlocal attempts
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
            endpoint="https://staging.example.test/api/internal/preview-shadow",
            submission={
                "kind": "receipt",
                "runId": self.lease["run_id"],
                "expectedRevision": 2,
                "workerEvidenceCapability": self.metadata[
                    "worker_evidence_capability"
                ],
                "evidence": {"receipt_id": "f" * 64},
            },
            post_json=reconcile,
        )

        self.assertEqual((attempts, result["outcome"]), (2, "replayed"))
        self.assertEqual(self.calls[0], self.calls[1])


if __name__ == "__main__":
    unittest.main()
