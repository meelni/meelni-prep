#!/usr/bin/env bash

set -e

meelni_bootstrap_worktree() {
  local worktree_root
  worktree_root="${CODEX_WORKTREE_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  cd "$worktree_root"

  export NEXT_TELEMETRY_DISABLED=1
  local meelni_codex_root
  meelni_codex_root="${CODEX_HOME:-$HOME/.codex}"
  export NPM_CONFIG_CACHE="$meelni_codex_root/cache/meelni/npm"
  mkdir -p "$NPM_CONFIG_CACHE"

  if [ -d /opt/homebrew/opt/python@3.12/libexec/bin ]; then
    export PATH="/opt/homebrew/opt/python@3.12/libexec/bin:$PATH"
  fi

  if [ -d /opt/homebrew/opt/expat/lib ]; then
    export DYLD_LIBRARY_PATH="/opt/homebrew/opt/expat/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
  fi

  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell bash)"
    fnm install "$(tr -d '[:space:]' < .node-version)"
    fnm use "$(tr -d '[:space:]' < .node-version)"
  fi

  npm run setup:local
  npm run doctor:setup
}

meelni_bootstrap_worktree
unset -f meelni_bootstrap_worktree
