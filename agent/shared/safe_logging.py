"""Content-safe logging helpers for the voice runtimes."""

from __future__ import annotations

import logging


def log_exception_class(
    logger: logging.Logger,
    level: int,
    event: str,
    error: BaseException,
) -> None:
    """Log a fixed event and exception class without message or traceback content."""
    logger.log(
        level,
        event,
        extra={"error_type": type(error).__name__},
    )
