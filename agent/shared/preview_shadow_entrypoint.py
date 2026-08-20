"""Preview-only construction bridge for the ordinary interview worker."""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import datetime, timezone

from shared.openai_responses_director_adapter import (
    OPENAI_RESPONSES_DIRECTOR_BASE_URL,
    OfficialOpenAIResponsesTransport,
)
from shared.preview_shadow_control_plane_client import (
    HttpDurableControlPlaneAdmissionVerifier,
    PreviewShadowJsonPoster,
)
from shared.preview_shadow_job import (
    PREVIEW_SHADOW_JOB_METADATA_VERSION,
    PreviewShadowJobConstruction,
    create_preview_shadow_job_runtime,
    parse_preview_shadow_job_metadata,
)

_RUN_ID = re.compile(r"^[0-9a-f]{64}$")
_GIT_SHA = re.compile(r"^[0-9a-f]{40}$")
_ROOM = re.compile(r"^preview-shadow-([0-9a-f]{64})$")


def is_preview_shadow_job_metadata(contents: object) -> bool:
    if type(contents) is not str or len(contents) > 16 * 1_024:
        return False
    return f'"contract_version":"{PREVIEW_SHADOW_JOB_METADATA_VERSION}"' in contents.replace(
        " ", ""
    )


def create_preview_shadow_entrypoint_runtime(
    *,
    job_metadata: str,
    room_name: str,
    env: Mapping[str, str],
    now: datetime | None = None,
    post_json: PreviewShadowJsonPoster | None = None,
) -> PreviewShadowJobConstruction:
    try:
        parsed = parse_preview_shadow_job_metadata(job_metadata)
        lease = parsed["lease"]
        if type(lease) is not dict:
            raise ValueError("lease")
        run_id = env.get("MEELNI_PREVIEW_SHADOW_RUN_ID")
        candidate = env.get("MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA")
        endpoint = env.get("MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL")
        openai_key = env.get("OPENAI_API_KEY")
        room_match = _ROOM.fullmatch(room_name)
        if (
            env.get("MEELNI_PREVIEW_SHADOW_EXECUTION") != "enabled"
            or env.get("MEELNI_PREVIEW_SHADOW_KILL_SWITCH") != "open"
            or type(run_id) is not str
            or not _RUN_ID.fullmatch(run_id)
            or type(candidate) is not str
            or not _GIT_SHA.fullmatch(candidate)
            or type(endpoint) is not str
            or type(openai_key) is not str
            or len(openai_key) < 20
            or len(openai_key) > 4_096
            or room_match is None
            or lease.get("run_id") != run_id
            or lease.get("candidate_git_sha") != candidate
        ):
            raise ValueError("configuration")
        capability = parsed["worker_evidence_capability"]
        verifier = HttpDurableControlPlaneAdmissionVerifier(
            endpoint=endpoint,
            worker_evidence_capability=capability,  # type: ignore[arg-type]
            **({"post_json": post_json} if post_json is not None else {}),
        )

        def transport_factory(_lease):
            from openai import AsyncOpenAI

            client = AsyncOpenAI(
                api_key=openai_key,
                base_url=OPENAI_RESPONSES_DIRECTOR_BASE_URL,
                max_retries=0,
            )
            return OfficialOpenAIResponsesTransport(client, owns_client=True)

        return create_preview_shadow_job_runtime(
            job_metadata=job_metadata,
            expected_run_id=run_id,
            expected_candidate_git_sha=candidate,
            expected_session_binding_sha256=room_match.group(1),
            now=now or datetime.now(timezone.utc),
            admission_verifier=verifier,
            transport_factory=transport_factory,
            kill_switch_open=True,
        )
    except Exception:
        return PreviewShadowJobConstruction(
            status="unavailable",
            reason="live_stage_config_incomplete",
            admission=None,
        )
