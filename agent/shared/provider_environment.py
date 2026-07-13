"""Fail-closed deployment identity checks shared by both LiveKit workers."""

from dataclasses import dataclass
from typing import Callable, Mapping, MutableMapping, Optional, Sequence, TypeVar
from urllib.parse import urlsplit


class ProviderEnvironmentError(RuntimeError):
    """Raised before provider initialization when deployment identity is unsafe."""


@dataclass(frozen=True)
class LiveKitRuntimeEnvironment:
    deployment: str
    url: str


Result = TypeVar("Result")


def run_livekit_worker(
    env: MutableMapping[str, str],
    argv: Sequence[str],
    initialize: Callable[[], Result],
) -> Result:
    """Run only the provider-free asset download without deployment identity."""
    if list(argv) != ["download-files"]:
        runtime = validate_livekit_runtime_environment(env)
        env["LIVEKIT_URL"] = runtime.url
    return initialize()


def validate_livekit_runtime_environment(
    env: Mapping[str, str],
) -> LiveKitRuntimeEnvironment:
    deployment = resolve_deployment_environment(env)
    _required(env, "LIVEKIT_API_KEY")
    _required(env, "LIVEKIT_API_SECRET")

    public_value = env.get("NEXT_PUBLIC_LIVEKIT_URL")
    server_value = env.get("LIVEKIT_URL")
    public_origin = canonical_livekit_origin(public_value) if public_value else None
    server_origin = canonical_livekit_origin(server_value) if server_value else None
    if public_value and not public_origin:
        raise ProviderEnvironmentError("livekit_url_invalid")
    if server_value and not server_origin:
        raise ProviderEnvironmentError("livekit_url_invalid")
    if public_origin and server_origin and public_origin != server_origin:
        raise ProviderEnvironmentError("livekit_url_mismatch")

    current_origin = public_origin or server_origin
    if not current_origin:
        raise ProviderEnvironmentError("livekit_url_missing")
    production_origin = canonical_livekit_origin(
        env.get("MEELNI_PRODUCTION_LIVEKIT_URL")
    )
    if not production_origin:
        raise ProviderEnvironmentError("livekit_production_identity_missing")
    if deployment == "production" and current_origin != production_origin:
        raise ProviderEnvironmentError("livekit_production_identity_mismatch")
    if deployment != "production" and current_origin == production_origin:
        raise ProviderEnvironmentError("livekit_nonproduction_identity_conflict")

    return LiveKitRuntimeEnvironment(deployment=deployment, url=current_origin)


def resolve_deployment_environment(env: Mapping[str, str]) -> str:
    vercel_present = "VERCEL_ENV" in env
    marker_present = "MEELNI_ENV_PULL_ENVIRONMENT" in env
    vercel_environment = env.get("VERCEL_ENV")
    marker = env.get("MEELNI_ENV_PULL_ENVIRONMENT")
    if vercel_present and vercel_environment not in {
        "development",
        "preview",
        "production",
    }:
        raise ProviderEnvironmentError("deployment_environment_invalid")
    if marker_present and marker not in {"preview", "production"}:
        raise ProviderEnvironmentError("deployment_environment_invalid")
    if vercel_environment and marker and vercel_environment != marker:
        raise ProviderEnvironmentError("deployment_environment_conflict")
    deployment = vercel_environment or marker
    if not deployment:
        raise ProviderEnvironmentError("deployment_environment_missing")
    return deployment


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name)
    if not value or not value.strip():
        raise ProviderEnvironmentError("livekit_env_missing")
    return value.strip()


def canonical_livekit_origin(value: Optional[str]) -> Optional[str]:
    if not value or value != value.strip():
        return None
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        return None
    if (
        parsed.scheme != "wss"
        or parsed.username
        or parsed.password
        or (port is not None and port != 443)
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        return None
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if not hostname.endswith(".livekit.cloud"):
        return None
    return f"wss://{hostname}"
