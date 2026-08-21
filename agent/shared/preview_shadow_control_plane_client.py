"""Explicit HTTPS client for durable Preview-shadow worker admission/evidence."""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Protocol
from urllib.request import Request, urlopen

from shared.preview_shadow_runtime import (
    PREVIEW_SHADOW_DURABLE_ADMISSION_VERIFIER_VERSION,
    PreviewShadowSessionLease,
)

PREVIEW_SHADOW_WORKER_REQUEST_VERSION = (
    "adaptive-interviewer-preview-shadow-worker-request.v1"
)
_MAXIMUM_REQUEST_BYTES = 64 * 1024
_MAXIMUM_RESPONSE_BYTES = 4 * 1024
_PROTECTION_BYPASS = re.compile(r"^[A-Za-z0-9_-]{16,512}$")
_CONTROL_PLANE_ENDPOINT = (
    "https://meelni-env-staging-meelni.vercel.app/api/internal/preview-shadow"
)


class PreviewShadowControlPlaneClientError(Exception):
    pass


class PreviewShadowJsonPoster(Protocol):
    def __call__(
        self,
        endpoint: str,
        payload: Mapping[str, object],
        timeout_seconds: float,
        protection_bypass_secret: str,
    ) -> Mapping[str, object]: ...


@dataclass(frozen=True)
class HttpDurableControlPlaneAdmissionVerifier:
    endpoint: str
    _worker_evidence_capability: str = field(repr=False, compare=False)
    _protection_bypass_secret: str = field(repr=False, compare=False)
    _post_json: PreviewShadowJsonPoster = field(repr=False, compare=False)
    contract_version: str = PREVIEW_SHADOW_DURABLE_ADMISSION_VERIFIER_VERSION

    def __init__(
        self,
        *,
        endpoint: str,
        worker_evidence_capability: str,
        protection_bypass_secret: str,
        post_json: PreviewShadowJsonPoster = None,  # type: ignore[assignment]
    ) -> None:
        object.__setattr__(self, "endpoint", _canonical_endpoint(endpoint))
        object.__setattr__(
            self, "_worker_evidence_capability", worker_evidence_capability
        )
        object.__setattr__(
            self,
            "_protection_bypass_secret",
            _canonical_bypass_secret(protection_bypass_secret),
        )
        object.__setattr__(self, "_post_json", post_json or _post_json)
        object.__setattr__(
            self,
            "contract_version",
            PREVIEW_SHADOW_DURABLE_ADMISSION_VERIFIER_VERSION,
        )

    def verify_admitted_session_lease(
        self, lease: PreviewShadowSessionLease
    ) -> bool:
        try:
            response = self._post_json(
                self.endpoint,
                {
                    "contract_version": PREVIEW_SHADOW_WORKER_REQUEST_VERSION,
                    "action": "admit",
                    "payload": {
                        "lease": {
                            **lease.payload(),
                            "lease_id": lease.lease_id,
                            "integrity_sha256": lease.integrity_sha256,
                        },
                        "worker_evidence_capability": self._worker_evidence_capability,
                    },
                },
                5.0,
                self._protection_bypass_secret,
            )
            return (
                _exact_keys(
                    response,
                    {
                        "contract_version",
                        "ok",
                        "action",
                        "admitted",
                        "run_id",
                        "lease_id",
                        "revision",
                    },
                )
                and response.get("contract_version")
                == PREVIEW_SHADOW_WORKER_REQUEST_VERSION
                and response.get("ok") is True
                and response.get("action") == "admit"
                and response.get("admitted") is True
                and response.get("run_id") == lease.run_id
                and response.get("lease_id") == lease.lease_id
                and response.get("revision") == lease.allocation_ledger_revision
            )
        except Exception:
            return False


async def submit_preview_shadow_terminal_evidence(
    *,
    endpoint: str,
    submission: Mapping[str, object],
    protection_bypass_secret: str,
    post_json: PreviewShadowJsonPoster = None,  # type: ignore[assignment]
) -> Mapping[str, object]:
    exact = _snapshot_submission(submission)
    payload = {
        "contract_version": PREVIEW_SHADOW_WORKER_REQUEST_VERSION,
        "action": "reconcile",
        "payload": {
            "kind": exact["kind"],
            "run_id": exact["runId"],
            "expected_revision": exact["expectedRevision"],
            "worker_evidence_capability": exact["workerEvidenceCapability"],
            "evidence": exact["evidence"],
        },
    }
    response: Mapping[str, object] | None = None
    for attempt in range(3):
        try:
            response = await asyncio.to_thread(
                post_json or _post_json,
                _canonical_endpoint(endpoint),
                payload,
                5.0,
                _canonical_bypass_secret(protection_bypass_secret),
            )
            break
        except Exception:
            if attempt == 2:
                raise PreviewShadowControlPlaneClientError(
                    "reconcile_unavailable"
                ) from None
            await asyncio.sleep(0.1 * (attempt + 1))
    if response is None:
        raise PreviewShadowControlPlaneClientError("reconcile_unavailable")
    if not (
        _exact_keys(
            response,
            {
                "contract_version",
                "ok",
                "action",
                "outcome",
                "revision",
                "stopped",
            },
        )
        and response.get("contract_version")
        == PREVIEW_SHADOW_WORKER_REQUEST_VERSION
        and response.get("ok") is True
        and response.get("action") == "reconcile"
        and response.get("outcome") in {"recorded", "replayed"}
        and type(response.get("revision")) is int
        and response.get("revision", 0) > 0
        and type(response.get("stopped")) is bool
    ):
        raise PreviewShadowControlPlaneClientError("reconcile_invalid")
    return dict(response)


def _post_json(
    endpoint: str,
    payload: Mapping[str, object],
    timeout_seconds: float,
    protection_bypass_secret: str,
) -> Mapping[str, object]:
    encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if not encoded or len(encoded) > _MAXIMUM_REQUEST_BYTES:
        raise PreviewShadowControlPlaneClientError("request_invalid")
    request = Request(
        endpoint,
        data=encoded,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-vercel-protection-bypass": _canonical_bypass_secret(
                protection_bypass_secret
            ),
        },
    )
    with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310
        if response.status != 200:
            raise PreviewShadowControlPlaneClientError("response_unavailable")
        raw = response.read(_MAXIMUM_RESPONSE_BYTES + 1)
    if not raw or len(raw) > _MAXIMUM_RESPONSE_BYTES:
        raise PreviewShadowControlPlaneClientError("response_invalid")
    try:
        value = json.loads(raw)
    except (UnicodeError, ValueError, json.JSONDecodeError):
        raise PreviewShadowControlPlaneClientError("response_invalid") from None
    if type(value) is not dict:
        raise PreviewShadowControlPlaneClientError("response_invalid")
    return value


def _canonical_endpoint(value: str) -> str:
    if type(value) is not str or value != _CONTROL_PLANE_ENDPOINT:
        raise PreviewShadowControlPlaneClientError("endpoint_invalid")
    return value


def _canonical_bypass_secret(value: str) -> str:
    if type(value) is not str or _PROTECTION_BYPASS.fullmatch(value) is None:
        raise PreviewShadowControlPlaneClientError("protection_bypass_invalid")
    return value


def _snapshot_submission(value: Mapping[str, object]) -> dict[str, object]:
    if type(value) is not dict or not _exact_keys(
        value,
        {
            "kind",
            "runId",
            "expectedRevision",
            "workerEvidenceCapability",
            "evidence",
        },
    ):
        raise PreviewShadowControlPlaneClientError("submission_invalid")
    return dict(value)


def _exact_keys(value: object, expected: set[str]) -> bool:
    return type(value) is dict and set(value) == expected
