"""Strict LiveKit job-metadata bootstrap for the Preview-shadow rehearsal.

No application entrypoint imports this module. It has no environment, credential,
provider, or durable-control-plane fallback.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Literal, Mapping

from shared.interview_director import (
    DirectorShadowConfig,
    DirectorTraceSink,
    InterviewDirectorShadowSession,
)
from shared.openai_responses_director_adapter import (
    OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION,
    OpenAIResponsesTransport,
    openai_responses_director_limits,
)
from shared.preview_shadow_runtime import (
    DurableControlPlaneAdmissionVerifier,
    PreviewShadowRuntime,
    PreviewShadowSessionLease,
    create_preview_shadow_runtime,
)

PREVIEW_SHADOW_JOB_METADATA_VERSION = (
    "adaptive-interviewer-preview-shadow-job-metadata.v1"
)
_MAXIMUM_JOB_METADATA_BYTES = 16 * 1_024
_MAXIMUM_JSON_DEPTH = 32
_JOB_KEYS = frozenset(
    {
        "contract_version",
        "lease",
        "worker_evidence_capability",
        "reconciliation_expected_revision",
    }
)
_LEASE_KEYS = frozenset(
    {
        "contract_version",
        "run_id",
        "authorization_id",
        "candidate_git_sha",
        "preview_shadow_configuration_sha256",
        "adapter_id",
        "adapter_version",
        "provider",
        "model",
        "target_stage",
        "target_environment",
        "target_cohort",
        "exposure",
        "session_ordinal",
        "session_binding_sha256",
        "session_budget_nano_usd",
        "maximum_attempts",
        "attempt_reservation_nano_usd",
        "issued_at",
        "expires_at",
        "allocation_ledger_revision",
        "lease_id",
        "integrity_sha256",
    }
)
_CAPABILITY_TOKEN_LENGTH = 43
_ADMISSION_SENTINEL = object()


class PreviewShadowJobError(Exception):
    _CODES = frozenset(
        {
            "invalid_job_metadata",
            "runtime_unavailable",
            "terminal_evidence_unavailable",
        }
    )

    def __init__(self, code: str):
        self.code = code if code in self._CODES else "invalid_job_metadata"
        super().__init__(f"Preview shadow job rejected input: {self.code}")


@dataclass(frozen=True, init=False)
class PreviewShadowJobAdmission:
    runtime: PreviewShadowRuntime
    reconciliation_expected_revision: int
    _worker_evidence_capability: str = field(repr=False, compare=False)

    def __init__(
        self,
        *,
        runtime: PreviewShadowRuntime,
        reconciliation_expected_revision: int,
        worker_evidence_capability: str,
        _sentinel: object,
    ) -> None:
        if _sentinel is not _ADMISSION_SENTINEL:
            raise PreviewShadowJobError("runtime_unavailable")
        object.__setattr__(self, "runtime", runtime)
        object.__setattr__(
            self,
            "reconciliation_expected_revision",
            reconciliation_expected_revision,
        )
        object.__setattr__(
            self,
            "_worker_evidence_capability",
            worker_evidence_capability,
        )

    def create_terminal_submission(self) -> dict[str, object]:
        try:
            evidence = self.runtime.create_session_receipt().to_wire()
            kind: Literal["receipt", "stop_incomplete"] = "receipt"
        except Exception:
            try:
                evidence = self.runtime.create_stop_incomplete_incident().to_wire()
                kind = "stop_incomplete"
            except Exception:
                raise PreviewShadowJobError("terminal_evidence_unavailable") from None
        return {
            "kind": kind,
            "runId": self.runtime.lease.run_id,
            "expectedRevision": self.reconciliation_expected_revision,
            "workerEvidenceCapability": self._worker_evidence_capability,
            "evidence": evidence,
        }


@dataclass(frozen=True)
class PreviewShadowJobConstruction:
    status: Literal["disabled", "unavailable", "ready"]
    reason: str
    admission: PreviewShadowJobAdmission | None

    @property
    def runtime(self) -> PreviewShadowRuntime | None:
        return self.admission.runtime if self.admission is not None else None


def create_preview_shadow_job_runtime(
    *,
    job_metadata: str | None = None,
    expected_run_id: str | None = None,
    expected_candidate_git_sha: str | None = None,
    expected_session_binding_sha256: str | None = None,
    now: datetime | None = None,
    admission_verifier: DurableControlPlaneAdmissionVerifier | None = None,
    transport_factory: Callable[
        [PreviewShadowSessionLease], OpenAIResponsesTransport
    ]
    | None = None,
    kill_switch_open: bool = False,
) -> PreviewShadowJobConstruction:
    """Construct only through explicit job metadata and injected dependencies."""
    if (
        job_metadata is None
        and expected_run_id is None
        and expected_candidate_git_sha is None
        and expected_session_binding_sha256 is None
        and now is None
        and admission_verifier is None
        and transport_factory is None
        and kill_switch_open is False
    ):
        return PreviewShadowJobConstruction("disabled", "default_off", None)
    try:
        parsed = parse_preview_shadow_job_metadata(job_metadata)
    except PreviewShadowJobError:
        return PreviewShadowJobConstruction(
            "unavailable", "job_metadata_invalid", None
        )
    construction = create_preview_shadow_runtime(
        raw_lease=parsed["lease"],
        expected_run_id=expected_run_id,
        expected_candidate_git_sha=expected_candidate_git_sha,
        expected_session_binding_sha256=expected_session_binding_sha256,
        now=now,
        admission_verifier=admission_verifier,
        transport_factory=transport_factory,
        kill_switch_open=kill_switch_open,
    )
    if construction.runtime is None:
        return PreviewShadowJobConstruction(
            construction.status, construction.reason, None
        )
    return PreviewShadowJobConstruction(
        "ready",
        "admitted_session_lease",
        PreviewShadowJobAdmission(
            runtime=construction.runtime,
            reconciliation_expected_revision=parsed[
                "reconciliation_expected_revision"
            ],
            worker_evidence_capability=parsed[
                "worker_evidence_capability"
            ],
            _sentinel=_ADMISSION_SENTINEL,
        ),
    )


def create_preview_shadow_director_session(
    admission: PreviewShadowJobAdmission,
    *,
    session_id: str,
    state_provider: Callable[[], Mapping[str, object] | None],
    delivery_topic_provider: Callable[[str], str | None] | None = None,
    trace_sink: DirectorTraceSink | None = None,
) -> InterviewDirectorShadowSession:
    """Build the read-only Director only from an already admitted job."""
    if type(admission) is not PreviewShadowJobAdmission:
        raise PreviewShadowJobError("runtime_unavailable")
    return InterviewDirectorShadowSession(
        config=DirectorShadowConfig(
            enabled=True,
            adapter_version=OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION,
            limits=openai_responses_director_limits(),
        ),
        session_id=session_id,
        adapter=admission.runtime.adapter,
        state_provider=state_provider,
        delivery_topic_provider=delivery_topic_provider,
        trace_sink=trace_sink,
    )


def parse_preview_shadow_job_metadata(
    contents: str | None,
) -> dict[str, object]:
    if not isinstance(contents, str):
        raise PreviewShadowJobError("invalid_job_metadata")
    try:
        encoded = contents.encode("utf-8")
    except UnicodeError:
        raise PreviewShadowJobError("invalid_job_metadata") from None
    if not encoded or len(encoded) > _MAXIMUM_JOB_METADATA_BYTES:
        raise PreviewShadowJobError("invalid_job_metadata")
    try:
        _assert_json_nesting(contents)
        value = json.loads(
            contents,
            object_pairs_hook=_closed_json_object,
            parse_constant=_reject_json_constant,
        )
    except (TypeError, ValueError, json.JSONDecodeError, RecursionError):
        raise PreviewShadowJobError("invalid_job_metadata") from None
    if type(value) is not dict or frozenset(value) != _JOB_KEYS:
        raise PreviewShadowJobError("invalid_job_metadata")
    _assert_depth(value)
    if value.get("contract_version") != PREVIEW_SHADOW_JOB_METADATA_VERSION:
        raise PreviewShadowJobError("invalid_job_metadata")
    lease = value.get("lease")
    capability = value.get("worker_evidence_capability")
    revision = value.get("reconciliation_expected_revision")
    if (
        type(lease) is not dict
        or frozenset(lease) != _LEASE_KEYS
        or not _canonical_capability(capability)
        or type(revision) is not int
        or revision <= 0
        or revision > 9_007_199_254_740_991
        or type(lease.get("allocation_ledger_revision")) is not int
        or revision < lease["allocation_ledger_revision"]
    ):
        raise PreviewShadowJobError("invalid_job_metadata")
    return {
        "contract_version": PREVIEW_SHADOW_JOB_METADATA_VERSION,
        "lease": dict(lease),
        "worker_evidence_capability": capability,
        "reconciliation_expected_revision": revision,
    }


def _closed_json_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_key")
        result[key] = value
    return result


def _reject_json_constant(_value: str) -> object:
    raise ValueError("non_finite_number")


def _assert_depth(value: object, depth: int = 0) -> None:
    if depth > _MAXIMUM_JSON_DEPTH:
        raise PreviewShadowJobError("invalid_job_metadata")
    if type(value) is dict:
        for nested in value.values():
            _assert_depth(nested, depth + 1)
    elif type(value) is list:
        for nested in value:
            _assert_depth(nested, depth + 1)


def _assert_json_nesting(contents: str) -> None:
    depth = 0
    in_string = False
    escaped = False
    for character in contents:
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == '"':
            in_string = True
        elif character in "{[":
            depth += 1
            if depth > _MAXIMUM_JSON_DEPTH:
                raise PreviewShadowJobError("invalid_job_metadata")
        elif character in "}]":
            depth -= 1
            if depth < 0:
                raise PreviewShadowJobError("invalid_job_metadata")
    if in_string or depth != 0:
        raise PreviewShadowJobError("invalid_job_metadata")


def _canonical_capability(value: object) -> bool:
    if type(value) is not str or len(value) != _CAPABILITY_TOKEN_LENGTH:
        return False
    try:
        decoded = base64.urlsafe_b64decode(value + "=")
        canonical = base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=")
    except (ValueError, UnicodeError):
        return False
    return len(decoded) == 32 and canonical == value
