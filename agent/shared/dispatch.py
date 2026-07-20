"""Fail-closed worker dispatch-name configuration."""

from collections.abc import Mapping
import os


def require_dispatch_name(
    variable: str, env: Mapping[str, str] | None = None
) -> str:
    """Return one nonblank explicit dispatch name or reject worker startup."""
    source = os.environ if env is None else env
    value = source.get(variable)
    if not value or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {variable}")
    return value.strip()
