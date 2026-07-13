#!/usr/bin/env python3
"""Provider-free validation for explicit LiveKit deployment targets."""

import re
import sys
import tomllib
from pathlib import Path

from provider_environment import ProviderEnvironmentError, canonical_livekit_origin


def validate_deployment_target(
    environment: str,
    kind: str,
    config_path: str,
    production_anchor: str,
    preview_anchor: str,
    expected_agent_id: str,
) -> str:
    if environment not in {"preview", "production"}:
        raise ProviderEnvironmentError("deployment_environment_invalid")
    if kind not in {"interview", "demo"}:
        raise ProviderEnvironmentError("livekit_deploy_agent_kind_invalid")
    path = Path(config_path)
    if not path.is_file():
        raise ProviderEnvironmentError("livekit_deploy_config_missing")
    try:
        config = tomllib.loads(path.read_text())
    except (OSError, tomllib.TOMLDecodeError) as error:
        raise ProviderEnvironmentError("livekit_deploy_config_invalid") from error
    subdomain = config.get("project", {}).get("subdomain")
    if (
        not isinstance(subdomain, str)
        or not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", subdomain)
    ):
        raise ProviderEnvironmentError("livekit_deploy_project_missing")
    agent_id = config.get("agent", {}).get("id")
    if not isinstance(agent_id, str) or not re.fullmatch(
        r"[A-Za-z0-9_-]+", agent_id
    ):
        raise ProviderEnvironmentError("livekit_deploy_agent_missing")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", expected_agent_id):
        raise ProviderEnvironmentError("livekit_deploy_expected_agent_missing")
    if agent_id != expected_agent_id:
        raise ProviderEnvironmentError("livekit_deploy_agent_identity_mismatch")
    target = canonical_livekit_origin(f"wss://{subdomain}.livekit.cloud")
    production_origin = canonical_livekit_origin(production_anchor)
    preview_origin = canonical_livekit_origin(preview_anchor)
    if not target or not production_origin or not preview_origin:
        raise ProviderEnvironmentError("livekit_deploy_identity_invalid")
    if preview_origin == production_origin:
        raise ProviderEnvironmentError("livekit_deploy_identity_conflict")
    if environment == "production" and target != production_origin:
        raise ProviderEnvironmentError("livekit_production_identity_mismatch")
    if environment == "preview" and target != preview_origin:
        raise ProviderEnvironmentError("livekit_preview_identity_mismatch")
    return target


def main(argv: list[str]) -> int:
    if len(argv) != 6:
        print(
            "LiveKit deploy validation requires environment, kind, config, "
            "Production anchor, Preview anchor, and expected agent ID.",
            file=sys.stderr,
        )
        return 1
    try:
        validate_deployment_target(*argv)
    except ProviderEnvironmentError as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
