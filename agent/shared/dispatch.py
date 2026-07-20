"""Fail-closed worker dispatch-name configuration."""

from collections.abc import Mapping
import os
import sys


BUILD_ASSET_DISPATCH_NAME = "meelni-build-assets-only"


def require_dispatch_name(
    variable: str, env: Mapping[str, str] | None = None
) -> str:
    """Return one nonblank explicit dispatch name or reject worker startup."""
    source = os.environ if env is None else env
    value = source.get(variable)
    if not value or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {variable}")
    return value.strip()


def resolve_cli_dispatch_name(
    variable: str,
    argv: list[str] | tuple[str, ...] | None = None,
    env: Mapping[str, str] | None = None,
) -> str:
    """Use a non-routable build name only for LiveKit asset preparation."""
    arguments = sys.argv if argv is None else argv
    command = arguments[1] if len(arguments) > 1 else None
    if command == "download-files":
        return BUILD_ASSET_DISPATCH_NAME
    return require_dispatch_name(variable, env)
