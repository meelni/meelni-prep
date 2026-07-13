#!/usr/bin/env python3
"""Fail-closed first deployment of one isolated Preview LiveKit agent."""

from __future__ import annotations

import atexit
import hashlib
import json
import os
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import tomllib
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from types import FrameType
from typing import Iterator, Mapping, Optional
from urllib.parse import urlsplit

from provider_environment import canonical_livekit_origin


PREVIEW_PROJECT_ALIAS = "meelni-preview"
PREVIEW_REGION = "us-east"
MAX_PROVIDER_OUTPUT_BYTES = 1_000_000
MAX_LOCAL_FILE_BYTES = 65_536
PROJECT_LIST_TIMEOUT_SECONDS = 60
AGENT_CREATE_TIMEOUT_SECONDS = 900
CHILD_ENVIRONMENT_ALLOWLIST = {
    "HOME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "NO_COLOR",
    "PATH",
    "TERM",
    "TMPDIR",
    "XDG_CONFIG_HOME",
}
AGENT_KINDS = {
    "demo": {
        "config_env": "MEELNI_LIVEKIT_PREVIEW_DEMO_CONFIG",
        "secrets_env": "MEELNI_LIVEKIT_PREVIEW_DEMO_SECRETS_FILE",
        "dispatch_env": "LIVEKIT_DEMO_AGENT_NAME",
        "dispatch_name": "meelni-preview-demo",
        "next_anchor": "MEELNI_LIVEKIT_PREVIEW_DEMO_AGENT_ID",
    },
    "interview": {
        "config_env": "MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG",
        "secrets_env": "MEELNI_LIVEKIT_PREVIEW_INTERVIEW_SECRETS_FILE",
        "dispatch_env": "LIVEKIT_INTERVIEW_AGENT_NAME",
        "dispatch_name": "meelni-preview-interview",
        "next_anchor": "MEELNI_LIVEKIT_PREVIEW_INTERVIEW_AGENT_ID",
    },
}


class PreviewBootstrapError(RuntimeError):
    """Safe, payload-free operator error."""


@dataclass(frozen=True)
class PreviewBootstrapResult:
    kind: str
    agent_id: str
    next_anchor: str


@dataclass(frozen=True)
class FileIdentity:
    device: int
    inode: int
    size: int
    modified_ns: int
    sha256: str


def bootstrap_preview_agent(
    kind: str,
    *,
    env: Optional[Mapping[str, str]] = None,
    agent_root: Optional[Path] = None,
    lk_executable: Optional[Path] = None,
    _test_child_environment: Optional[Mapping[str, str]] = None,
) -> PreviewBootstrapResult:
    """Validate every local boundary before the one allowed provider mutation."""
    source = dict(os.environ if env is None else env)
    if kind not in AGENT_KINDS:
        raise PreviewBootstrapError("livekit_preview_agent_kind_invalid")
    spec = AGENT_KINDS[kind]
    resolved_agent_root = (
        Path(__file__).resolve().parents[1]
        if agent_root is None
        else Path(agent_root).resolve(strict=True)
    )
    if not resolved_agent_root.is_dir():
        raise PreviewBootstrapError("livekit_preview_agent_root_invalid")
    repo_root = resolved_agent_root.parent

    preview_origin = _required_canonical_anchor(
        source, "MEELNI_PREVIEW_LIVEKIT_URL"
    )
    production_origin = _required_canonical_anchor(
        source, "MEELNI_PRODUCTION_LIVEKIT_URL"
    )
    if preview_origin == production_origin:
        raise PreviewBootstrapError("livekit_preview_identity_conflict")

    config_path = _required_external_output_path(
        source.get(spec["config_env"]), repo_root, spec["config_env"]
    )
    secrets_path, secrets_identity, secrets_text = _required_private_file(
        source.get(spec["secrets_env"]), repo_root, spec["secrets_env"]
    )
    _validate_secrets_file(
        secrets_text,
        dispatch_env=spec["dispatch_env"],
        dispatch_name=spec["dispatch_name"],
        preview_origin=preview_origin,
        production_origin=production_origin,
    )
    executable = _resolve_lk_executable(lk_executable, source)

    with _exclusive_bootstrap_lock(resolved_agent_root):
        _verify_preview_project(
            executable,
            source,
            resolved_agent_root,
            preview_origin,
            production_origin,
            _test_child_environment,
        )
        _assert_output_absent(config_path)
        _assert_file_unchanged(secrets_path, secrets_identity)

        with _selected_dockerfile(kind, resolved_agent_root):
            _create_agent(
                executable,
                source,
                resolved_agent_root,
                config_path,
                secrets_path,
                _test_child_environment,
            )

        agent_id = _validate_generated_config(config_path, preview_origin)

    return PreviewBootstrapResult(
        kind=kind,
        agent_id=agent_id,
        next_anchor=spec["next_anchor"],
    )


def _required_canonical_anchor(source: Mapping[str, str], name: str) -> str:
    value = source.get(name)
    origin = canonical_livekit_origin(value)
    if not value or not origin or value != origin:
        raise PreviewBootstrapError("livekit_preview_anchor_invalid")
    return origin


def _required_external_output_path(
    value: Optional[str], repo_root: Path, env_name: str
) -> Path:
    path = _canonical_operator_path(value, repo_root, env_name)
    _assert_output_absent(path)
    return path


def _canonical_operator_path(
    value: Optional[str], repo_root: Path, env_name: str
) -> Path:
    if not value:
        raise PreviewBootstrapError(f"{env_name.lower()}_missing")
    path = Path(value)
    if not path.is_absolute():
        raise PreviewBootstrapError("livekit_preview_operator_path_not_absolute")
    try:
        canonical_parent = path.parent.resolve(strict=True)
    except OSError as error:
        raise PreviewBootstrapError("livekit_preview_operator_parent_invalid") from error
    canonical = canonical_parent / path.name
    try:
        parent_metadata = os.lstat(canonical_parent)
    except OSError as error:
        raise PreviewBootstrapError("livekit_preview_operator_parent_invalid") from error
    if (
        path != canonical
        or not stat.S_ISDIR(parent_metadata.st_mode)
        or stat.S_IMODE(parent_metadata.st_mode) & 0o077
    ):
        raise PreviewBootstrapError("livekit_preview_operator_path_not_canonical")
    try:
        canonical.relative_to(repo_root.resolve(strict=True))
    except ValueError:
        return canonical
    raise PreviewBootstrapError("livekit_preview_operator_path_inside_repository")


def _assert_output_absent(path: Path) -> None:
    if os.path.lexists(path):
        raise PreviewBootstrapError("livekit_preview_config_already_exists")


def _required_private_file(
    value: Optional[str], repo_root: Path, env_name: str
) -> tuple[Path, FileIdentity, str]:
    path = _canonical_operator_path(value, repo_root, env_name)
    try:
        metadata = os.lstat(path)
    except OSError as error:
        raise PreviewBootstrapError("livekit_preview_secrets_file_missing") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise PreviewBootstrapError("livekit_preview_secrets_file_not_regular")
    if stat.S_IMODE(metadata.st_mode) != 0o600:
        raise PreviewBootstrapError("livekit_preview_secrets_file_mode_invalid")
    if metadata.st_size > MAX_LOCAL_FILE_BYTES:
        raise PreviewBootstrapError("livekit_preview_secrets_file_too_large")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "r", encoding="utf-8") as handle:
            text = handle.read(MAX_LOCAL_FILE_BYTES + 1)
    except (OSError, UnicodeError) as error:
        raise PreviewBootstrapError("livekit_preview_secrets_file_unreadable") from error
    if len(text.encode("utf-8")) > MAX_LOCAL_FILE_BYTES:
        raise PreviewBootstrapError("livekit_preview_secrets_file_too_large")
    return path, _file_identity(metadata, text.encode("utf-8")), text


def _file_identity(metadata: os.stat_result, content: bytes = b"") -> FileIdentity:
    return FileIdentity(
        device=metadata.st_dev,
        inode=metadata.st_ino,
        size=metadata.st_size,
        modified_ns=metadata.st_mtime_ns,
        sha256=hashlib.sha256(content).hexdigest(),
    )


def _assert_file_unchanged(path: Path, expected: FileIdentity) -> None:
    try:
        metadata = os.lstat(path)
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as handle:
            content = handle.read(MAX_LOCAL_FILE_BYTES + 1)
    except OSError as error:
        raise PreviewBootstrapError("livekit_preview_secrets_file_changed") from error
    if (
        stat.S_ISLNK(metadata.st_mode)
        or not stat.S_ISREG(metadata.st_mode)
        or stat.S_IMODE(metadata.st_mode) != 0o600
        or len(content) > MAX_LOCAL_FILE_BYTES
        or _file_identity(metadata, content) != expected
    ):
        raise PreviewBootstrapError("livekit_preview_secrets_file_changed")


def _validate_secrets_file(
    text: str,
    *,
    dispatch_env: str,
    dispatch_name: str,
    preview_origin: str,
    production_origin: str,
) -> None:
    required = {
        "MEELNI_ENV_PULL_ENVIRONMENT",
        "MEELNI_PREVIEW_LIVEKIT_URL",
        "MEELNI_PRODUCTION_LIVEKIT_URL",
        dispatch_env,
        "OPENAI_API_KEY",
    }
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        if not raw_line.strip() or raw_line.startswith("#"):
            continue
        if raw_line != raw_line.strip():
            raise PreviewBootstrapError("livekit_preview_secrets_file_invalid")
        line = raw_line
        name, separator, value = line.partition("=")
        if (
            not separator
            or not re.fullmatch(r"[A-Z][A-Z0-9_]*", name)
            or name in values
            or value != value.strip()
            or not value
        ):
            raise PreviewBootstrapError("livekit_preview_secrets_file_invalid")
        values[name] = value
    if set(values) != required:
        raise PreviewBootstrapError("livekit_preview_secrets_names_invalid")
    if values["MEELNI_ENV_PULL_ENVIRONMENT"] != "preview":
        raise PreviewBootstrapError("livekit_preview_secrets_environment_invalid")
    if values["MEELNI_PREVIEW_LIVEKIT_URL"] != preview_origin:
        raise PreviewBootstrapError("livekit_preview_secrets_preview_anchor_mismatch")
    if values["MEELNI_PRODUCTION_LIVEKIT_URL"] != production_origin:
        raise PreviewBootstrapError("livekit_preview_secrets_production_anchor_mismatch")
    if values[dispatch_env] != dispatch_name:
        raise PreviewBootstrapError("livekit_preview_dispatch_name_mismatch")
    openai_key = values["OPENAI_API_KEY"]
    if (
        not openai_key.startswith("sk-")
        or len(openai_key) < 20
        or any(character.isspace() for character in openai_key)
    ):
        raise PreviewBootstrapError("livekit_preview_openai_key_invalid")


def _resolve_lk_executable(
    supplied: Optional[Path], source: Mapping[str, str]
) -> Path:
    candidate = str(supplied) if supplied is not None else shutil.which(
        "lk", path=source.get("PATH")
    )
    if not candidate:
        raise PreviewBootstrapError("livekit_cli_missing")
    path = Path(candidate).resolve(strict=True)
    if not path.is_file() or not os.access(path, os.X_OK):
        raise PreviewBootstrapError("livekit_cli_invalid")
    return path


def _verify_preview_project(
    executable: Path,
    source: Mapping[str, str],
    agent_root: Path,
    preview_origin: str,
    production_origin: str,
    test_child_environment: Optional[Mapping[str, str]],
) -> None:
    result = _run_lk(
        executable,
        ["--project", PREVIEW_PROJECT_ALIAS, "project", "list", "--json"],
        source,
        agent_root,
        PROJECT_LIST_TIMEOUT_SECONDS,
        test_child_environment,
    )
    if result.returncode != 0 or len(result.stdout.encode("utf-8")) > MAX_PROVIDER_OUTPUT_BYTES:
        raise PreviewBootstrapError("livekit_preview_project_inventory_failed")
    try:
        payload = json.loads(result.stdout)
    except (json.JSONDecodeError, UnicodeError) as error:
        raise PreviewBootstrapError("livekit_preview_project_inventory_invalid") from error
    if not isinstance(payload, list):
        raise PreviewBootstrapError("livekit_preview_project_inventory_invalid")
    matches = [
        entry
        for entry in payload
        if isinstance(entry, dict) and entry.get("Name") == PREVIEW_PROJECT_ALIAS
    ]
    if len(matches) != 1:
        raise PreviewBootstrapError("livekit_preview_project_alias_unverified")
    project = matches[0]
    project_id = project.get("ProjectId")
    url = project.get("URL")
    if not isinstance(project_id, str) or not re.fullmatch(r"p_[A-Za-z0-9]+", project_id):
        raise PreviewBootstrapError("livekit_preview_project_id_invalid")
    if not isinstance(url, str) or canonical_livekit_origin(url) != preview_origin:
        raise PreviewBootstrapError("livekit_preview_project_url_mismatch")
    if canonical_livekit_origin(url) == production_origin:
        raise PreviewBootstrapError("livekit_preview_project_is_production")


def _create_agent(
    executable: Path,
    source: Mapping[str, str],
    agent_root: Path,
    config_path: Path,
    secrets_path: Path,
    test_child_environment: Optional[Mapping[str, str]],
) -> None:
    result = _run_lk(
        executable,
        [
            "--project",
            PREVIEW_PROJECT_ALIAS,
            "--config",
            str(config_path),
            "agent",
            "create",
            "--region",
            PREVIEW_REGION,
            "--secrets-file",
            str(secrets_path),
            "--silent",
            ".",
        ],
        source,
        agent_root,
        AGENT_CREATE_TIMEOUT_SECONDS,
        test_child_environment,
    )
    if result.returncode != 0:
        raise PreviewBootstrapError("livekit_preview_agent_create_failed")


def _run_lk(
    executable: Path,
    arguments: list[str],
    source: Mapping[str, str],
    agent_root: Path,
    timeout_seconds: int,
    test_child_environment: Optional[Mapping[str, str]] = None,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            [str(executable), *arguments],
            cwd=agent_root,
            env=_sanitized_child_environment(source, test_child_environment),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as error:
        raise PreviewBootstrapError("livekit_cli_execution_timed_out") from error
    except (OSError, UnicodeError, subprocess.SubprocessError) as error:
        raise PreviewBootstrapError("livekit_cli_execution_failed") from error


def _sanitized_child_environment(
    source: Mapping[str, str],
    test_child_environment: Optional[Mapping[str, str]] = None,
) -> dict[str, str]:
    environment = {
        name: value
        for name, value in source.items()
        if name in CHILD_ENVIRONMENT_ALLOWLIST
    }
    if test_child_environment is not None:
        if any(not name.startswith("FAKE_LK_") for name in test_child_environment):
            raise PreviewBootstrapError("livekit_test_environment_invalid")
        environment.update(test_child_environment)
    return environment


def _validate_generated_config(config_path: Path, preview_origin: str) -> str:
    try:
        metadata = os.lstat(config_path)
    except OSError as error:
        raise PreviewBootstrapError("livekit_preview_generated_config_missing") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise PreviewBootstrapError("livekit_preview_generated_config_not_regular")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(config_path, flags)
        with os.fdopen(descriptor, "rb") as handle:
            os.fchmod(handle.fileno(), 0o600)
            data = handle.read(MAX_LOCAL_FILE_BYTES + 1)
    except OSError as error:
        raise PreviewBootstrapError("livekit_preview_generated_config_unreadable") from error
    if len(data) > MAX_LOCAL_FILE_BYTES:
        raise PreviewBootstrapError("livekit_preview_generated_config_too_large")
    try:
        config = tomllib.loads(data.decode("utf-8"))
    except (UnicodeError, tomllib.TOMLDecodeError) as error:
        raise PreviewBootstrapError("livekit_preview_generated_config_invalid") from error
    subdomain = config.get("project", {}).get("subdomain")
    expected_subdomain = _livekit_subdomain(preview_origin)
    if subdomain != expected_subdomain:
        raise PreviewBootstrapError("livekit_preview_generated_project_mismatch")
    agent_id = config.get("agent", {}).get("id")
    if not isinstance(agent_id, str) or not re.fullmatch(r"CA_[A-Za-z0-9]+", agent_id):
        raise PreviewBootstrapError("livekit_preview_generated_agent_id_invalid")
    return agent_id


def _livekit_subdomain(origin: str) -> str:
    hostname = urlsplit(origin).hostname or ""
    suffix = ".livekit.cloud"
    if not hostname.endswith(suffix):
        raise PreviewBootstrapError("livekit_preview_anchor_invalid")
    return hostname[: -len(suffix)]


@contextmanager
def _exclusive_bootstrap_lock(agent_root: Path) -> Iterator[None]:
    lock_path = agent_root / ".livekit-preview-bootstrap.lock"
    try:
        descriptor = os.open(lock_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(descriptor)
        identity = _file_identity(os.lstat(lock_path), b"")
    except OSError as error:
        raise PreviewBootstrapError("livekit_preview_bootstrap_locked") from error
    try:
        yield
    finally:
        try:
            if _file_identity(os.lstat(lock_path), b"") == identity:
                lock_path.unlink()
        except OSError:
            pass


@contextmanager
def _selected_dockerfile(kind: str, agent_root: Path) -> Iterator[None]:
    if kind != "demo":
        yield
        return
    dockerfile = agent_root / "Dockerfile"
    demo_dockerfile = agent_root / "demo" / "Dockerfile"
    try:
        dockerfile_metadata = os.lstat(dockerfile)
        demo_metadata = os.lstat(demo_dockerfile)
    except OSError as error:
        raise PreviewBootstrapError("livekit_preview_demo_dockerfile_missing") from error
    if (
        not stat.S_ISREG(dockerfile_metadata.st_mode)
        or stat.S_ISLNK(dockerfile_metadata.st_mode)
        or not stat.S_ISREG(demo_metadata.st_mode)
        or stat.S_ISLNK(demo_metadata.st_mode)
    ):
        raise PreviewBootstrapError("livekit_preview_demo_dockerfile_missing")
    original_mode = stat.S_IMODE(dockerfile_metadata.st_mode)
    backup_descriptor, backup_name = tempfile.mkstemp(
        prefix=".Dockerfile.bootstrap-backup.", dir=agent_root
    )
    os.close(backup_descriptor)
    backup_path = Path(backup_name)
    try:
        shutil.copy2(dockerfile, backup_path, follow_symlinks=False)
    except OSError as error:
        backup_path.unlink(missing_ok=True)
        raise PreviewBootstrapError(
            "livekit_preview_demo_dockerfile_backup_failed"
        ) from error
    restored = False

    def restore() -> None:
        nonlocal restored
        if restored:
            return
        if not backup_path.exists():
            raise PreviewBootstrapError(
                "livekit_preview_demo_dockerfile_restore_failed"
            )
        os.replace(backup_path, dockerfile)
        restored = True

    try:
        atexit.register(restore)
        handled_signals = (signal.SIGHUP, signal.SIGTERM)
        previous_handlers = {
            handled_signal: signal.getsignal(handled_signal)
            for handled_signal in handled_signals
        }

        def interrupt(_signum: int, _frame: Optional[FrameType]) -> None:
            raise PreviewBootstrapError("livekit_preview_bootstrap_interrupted")

        for handled_signal in handled_signals:
            signal.signal(handled_signal, interrupt)
        try:
            swap_descriptor, swap_name = tempfile.mkstemp(
                prefix=".Dockerfile.bootstrap-swap.", dir=agent_root
            )
            swap_path = Path(swap_name)
            try:
                os.close(swap_descriptor)
                shutil.copy2(demo_dockerfile, swap_path, follow_symlinks=False)
                os.chmod(swap_path, original_mode)
                os.replace(swap_path, dockerfile)
            finally:
                if swap_path.exists():
                    swap_path.unlink()
            yield
        finally:
            for handled_signal, previous_handler in previous_handlers.items():
                signal.signal(handled_signal, previous_handler)
    finally:
        restore()
        atexit.unregister(restore)


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(
            "Usage: python3 agent/shared/bootstrap_livekit_preview.py demo|interview",
            file=sys.stderr,
        )
        return 1
    try:
        result = bootstrap_preview_agent(argv[0])
    except (PreviewBootstrapError, KeyboardInterrupt) as error:
        code = str(error) if isinstance(error, PreviewBootstrapError) else "interrupted"
        print(f"LiveKit Preview bootstrap denied: {code}.", file=sys.stderr)
        return 1
    print(f"Created Preview {result.kind} agent {result.agent_id}.")
    print(f"Set {result.next_anchor}={result.agent_id}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
