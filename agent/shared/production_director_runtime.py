"""Fail-closed Production construction for the admitted Interview Director."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from shared.interview_director import (
    DirectorAdapterResult,
    DirectorContext,
    DirectorError,
    DirectorLimits,
)
from shared.openai_responses_director_adapter import (
    OPENAI_RESPONSES_DIRECTOR_ADAPTER_ID,
    OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION,
    OPENAI_RESPONSES_DIRECTOR_BASE_URL,
    OPENAI_RESPONSES_DIRECTOR_MODEL,
    OPENAI_RESPONSES_DIRECTOR_PROVIDER,
    OfficialOpenAIResponsesTransport,
    OpenAIResponsesDirectorAdapter,
    openai_responses_director_limits,
)

PRODUCTION_ADMISSION_VERSION = "adaptive-interviewer-production-admission.v1"
PRODUCTION_CONFIG_SHA256 = (
    "21743eb810fed7d64c3564aa194e2f09ab75463e3318fbdc6f33936531ef6423"
)
SELECTED_CONFIG_SHA256 = (
    "b8cc8547c6d2573b7d323b3327ab31bf74c237a1486c13e0e7780a63880e25ac"
)
ROLLOUT_CONFIG_SHA256 = (
    "ff50893d0bc9e3dea640e61323c79f4fe51381264ba98c6cec18f17b341cd042"
)
ADMISSION_DOMAIN = b"meelni.adaptive-interviewer.production-admission.v1\0"
ADMISSION_KEY_CONTEXT = b"meelni/adaptive-interviewer-production-admission-key/v1"
ATTEMPT_RESERVATION_NANO_USD = 100_000_000
SESSION_BUDGET_NANO_USD = 1_000_000_000
MAXIMUM_ATTEMPTS = 10
DIRECTOR_DEADLINE_MS = 750
RECOMMENDATION_TTL_MS = 5_000

_SHA40 = re.compile(r"^[a-f0-9]{40}$")
_SHA64 = re.compile(r"^[a-f0-9]{64}$")
_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_FLAGS = (
    "MEELNI_INTERVIEW_BRIEF_V2_ENABLED",
    "MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED",
    "MEELNI_INTERVIEW_TOOLS_V1_ENABLED",
    "MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED",
    "MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED",
)
_PAYLOAD_KEYS = frozenset(
    {
        "adapter_id",
        "adapter_version",
        "attempt_reservation_nano_usd",
        "candidate_git_sha",
        "cohort",
        "configuration_sha256",
        "contract_version",
        "deadline_at",
        "director_deadline_ms",
        "environment",
        "exposure",
        "maximum_attempts",
        "model",
        "provider",
        "recommendation_ttl_ms",
        "repository_rollout_configuration_sha256",
        "request_fingerprint",
        "room_name",
        "selected_candidate_configuration_sha256",
        "session_budget_nano_usd",
        "session_id",
        "stage",
    }
)


@dataclass(frozen=True)
class ProductionDirectorRuntimeConstruction:
    status: Literal["disabled", "unavailable", "ready"]
    reason: str
    adapter: "BudgetedProductionDirectorAdapter | None"
    limits: DirectorLimits


class ProductionDirectorRuntimeUnavailable(DirectorError):
    """Content-free construction failure with a closed operational reason."""

    _REASONS = frozenset(
        {
            "admission_binding_invalid",
            "admission_secret_missing",
            "admission_signature_invalid",
            "provider_api_key_missing",
            "provider_sdk_unavailable",
            "transport_construction_failed",
        }
    )

    def __init__(self, reason: str):
        self.reason = (
            reason if reason in self._REASONS else "transport_construction_failed"
        )
        super().__init__("invalid_config")


class ProductionDirectorSpendLedger:
    """One process-local session ledger; reserve conservatively before I/O."""

    def __init__(self) -> None:
        self.attempt_count = 0
        self.reconciled_nano_usd = 0
        self._open: set[int] = set()

    def reserve(self) -> int:
        if (
            self.attempt_count >= MAXIMUM_ATTEMPTS
            or self.reconciled_nano_usd
            + len(self._open) * ATTEMPT_RESERVATION_NANO_USD
            + ATTEMPT_RESERVATION_NANO_USD
            > SESSION_BUDGET_NANO_USD
        ):
            raise DirectorError("capacity")
        self.attempt_count += 1
        ordinal = self.attempt_count
        self._open.add(ordinal)
        return ordinal

    def reconcile(self, ordinal: int, *, normalized_cost_nano_usd: int | None) -> None:
        if type(ordinal) is not int or ordinal not in self._open:
            raise DirectorError("invalid_adapter_result")
        amount = ATTEMPT_RESERVATION_NANO_USD
        if normalized_cost_nano_usd is not None:
            if (
                type(normalized_cost_nano_usd) is not int
                or normalized_cost_nano_usd < 0
            ):
                raise DirectorError("invalid_adapter_result")
            amount = max(amount, normalized_cost_nano_usd)
        self._open.remove(ordinal)
        self.reconciled_nano_usd += amount


class BudgetedProductionDirectorAdapter:
    version = OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION

    def __init__(
        self,
        delegate: OpenAIResponsesDirectorAdapter,
        ledger: ProductionDirectorSpendLedger,
    ) -> None:
        self._delegate = delegate
        self.ledger = ledger

    async def prewarm(self, *, affinity_key: str, limits: DirectorLimits) -> None:
        await self._delegate.prewarm(affinity_key=affinity_key, limits=limits)

    async def recommend(
        self, context: DirectorContext, *, limits: DirectorLimits
    ) -> DirectorAdapterResult:
        ordinal = self.ledger.reserve()
        try:
            result = await self._delegate.recommend(context, limits=limits)
        except asyncio.CancelledError:
            self.ledger.reconcile(ordinal, normalized_cost_nano_usd=None)
            raise
        except Exception:
            self.ledger.reconcile(ordinal, normalized_cost_nano_usd=None)
            raise
        self.ledger.reconcile(
            ordinal,
            normalized_cost_nano_usd=result.estimated_cost_microusd * 1_000,
        )
        return result

    async def recover(
        self,
        *,
        affinity_key: str,
        writer_generation: int,
        limits: DirectorLimits,
    ) -> None:
        await self._delegate.recover(
            affinity_key=affinity_key,
            writer_generation=writer_generation,
            limits=limits,
        )

    async def close(self, *, affinity_key: str) -> None:
        await self._delegate.close(affinity_key=affinity_key)


def create_production_director_runtime(
    admission: object,
    *,
    env: Mapping[str, str],
    expected_session_id: str,
    expected_room_name: str,
    expected_deadline_at: str,
    now: datetime | None = None,
) -> ProductionDirectorRuntimeConstruction:
    limits = openai_responses_director_limits(
        deadline_ms=DIRECTOR_DEADLINE_MS,
        recommendation_ttl_ms=RECOMMENDATION_TTL_MS,
    )
    if admission is None:
        return ProductionDirectorRuntimeConstruction(
            "disabled", "admission_absent", None, limits
        )
    try:
        _verify_admission(
            admission,
            env=env,
            expected_session_id=expected_session_id,
            expected_room_name=expected_room_name,
            expected_deadline_at=expected_deadline_at,
            now=now,
        )
    except ProductionDirectorRuntimeUnavailable as error:
        return ProductionDirectorRuntimeConstruction(
            "unavailable", error.reason, None, limits
        )
    api_key = env.get("OPENAI_API_KEY")
    if not isinstance(api_key, str) or not api_key:
        return ProductionDirectorRuntimeConstruction(
            "unavailable", "provider_api_key_missing", None, limits
        )
    try:
        import openai
    except ModuleNotFoundError:
        return ProductionDirectorRuntimeConstruction(
            "unavailable", "provider_sdk_unavailable", None, limits
        )
    try:
        client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url=OPENAI_RESPONSES_DIRECTOR_BASE_URL,
            max_retries=0,
        )
        delegate = OpenAIResponsesDirectorAdapter(
            OfficialOpenAIResponsesTransport(client)
        )
    except Exception:
        return ProductionDirectorRuntimeConstruction(
            "unavailable", "transport_construction_failed", None, limits
        )
    ledger = ProductionDirectorSpendLedger()
    return ProductionDirectorRuntimeConstruction(
        "ready",
        "admission_verified",
        BudgetedProductionDirectorAdapter(delegate, ledger),
        limits,
    )


def _verify_admission(
    value: object,
    *,
    env: Mapping[str, str],
    expected_session_id: str,
    expected_room_name: str,
    expected_deadline_at: str,
    now: datetime | None = None,
) -> None:
    if type(value) is not dict or frozenset(value) != _PAYLOAD_KEYS | {"signature"}:
        raise ProductionDirectorRuntimeUnavailable("admission_binding_invalid")
    signature = value.get("signature")
    if (
        type(signature) is not dict
        or frozenset(signature) != {"algorithm", "value"}
        or signature.get("algorithm") != "hmac-sha256"
        or type(signature.get("value")) is not str
        or _SHA64.fullmatch(signature["value"]) is None
    ):
        raise ProductionDirectorRuntimeUnavailable("admission_signature_invalid")
    payload = {key: value[key] for key in sorted(_PAYLOAD_KEYS)}
    deadline_at = _parse_canonical_timestamp(payload["deadline_at"])
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None or current_time.utcoffset() is None:
        raise ProductionDirectorRuntimeUnavailable("admission_binding_invalid")
    current_time = current_time.astimezone(timezone.utc)
    if (
        payload["contract_version"] != PRODUCTION_ADMISSION_VERSION
        or payload["session_id"] != expected_session_id
        or payload["room_name"] != expected_room_name
        or payload["deadline_at"] != expected_deadline_at
        or deadline_at <= current_time
        or payload["stage"] != "candidate_default"
        or payload["environment"] != "production"
        or payload["cohort"] != "canary"
        or payload["exposure"] != "default"
        or payload["configuration_sha256"] != PRODUCTION_CONFIG_SHA256
        or payload["selected_candidate_configuration_sha256"] != SELECTED_CONFIG_SHA256
        or payload["repository_rollout_configuration_sha256"] != ROLLOUT_CONFIG_SHA256
        or payload["adapter_id"] != OPENAI_RESPONSES_DIRECTOR_ADAPTER_ID
        or payload["adapter_version"] != OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION
        or payload["provider"] != OPENAI_RESPONSES_DIRECTOR_PROVIDER
        or payload["model"] != OPENAI_RESPONSES_DIRECTOR_MODEL
        or payload["maximum_attempts"] != MAXIMUM_ATTEMPTS
        or payload["attempt_reservation_nano_usd"] != ATTEMPT_RESERVATION_NANO_USD
        or payload["session_budget_nano_usd"] != SESSION_BUDGET_NANO_USD
        or payload["director_deadline_ms"] != DIRECTOR_DEADLINE_MS
        or payload["recommendation_ttl_ms"] != RECOMMENDATION_TTL_MS
        or type(payload["candidate_git_sha"]) is not str
        or _SHA40.fullmatch(payload["candidate_git_sha"]) is None
        or type(payload["request_fingerprint"]) is not str
        or _SHA64.fullmatch(payload["request_fingerprint"]) is None
        or _TOKEN.fullmatch(expected_session_id) is None
        or _TOKEN.fullmatch(expected_room_name) is None
        or env.get("MEELNI_ADAPTIVE_INTERVIEWER_STAGE") != "candidate_default"
        or env.get("MEELNI_ADAPTIVE_INTERVIEWER_ENVIRONMENT") != "production"
        or env.get("MEELNI_ADAPTIVE_INTERVIEWER_COHORT") != "canary"
        or env.get("MEELNI_ADAPTIVE_INTERVIEWER_EXPOSURE") != "default"
        or env.get("MEELNI_ADAPTIVE_INTERVIEWER_CONFIG_SHA256") != PRODUCTION_CONFIG_SHA256
        or env.get("MEELNI_ADAPTIVE_INTERVIEWER_CANDIDATE_SHA")
        != payload["candidate_git_sha"]
        or any(env.get(name) != "true" for name in _FLAGS)
    ):
        raise ProductionDirectorRuntimeUnavailable("admission_binding_invalid")
    secret = env.get("MEELNI_TRANSCRIPT_INGEST_SECRET")
    if not isinstance(secret, str) or not secret:
        raise ProductionDirectorRuntimeUnavailable("admission_secret_missing")
    signing_key = hmac.new(
        secret.encode("utf-8"), ADMISSION_KEY_CONTEXT, hashlib.sha256
    ).digest()
    encoded = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    expected = hmac.new(
        signing_key, ADMISSION_DOMAIN + encoded, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature["value"]):
        raise ProductionDirectorRuntimeUnavailable("admission_signature_invalid")


def _parse_canonical_timestamp(value: object) -> datetime:
    if type(value) is not str or re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", value
    ) is None:
        raise ProductionDirectorRuntimeUnavailable("admission_binding_invalid")
    try:
        parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        raise ProductionDirectorRuntimeUnavailable(
            "admission_binding_invalid"
        ) from None
    if parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z") != value:
        raise ProductionDirectorRuntimeUnavailable("admission_binding_invalid")
    return parsed
