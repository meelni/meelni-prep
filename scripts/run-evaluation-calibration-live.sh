#!/bin/sh

case $- in
  *x*)
    echo "calibration_live_launcher_xtrace_rejected" >&2
    exit 1
    ;;
esac
set -eu

NODE_VERSION="22.22.0"
NODE_BIN="/Users/REDACTED/.local/share/fnm/node-versions/v${NODE_VERSION}/installation/bin/node"
BOOTSTRAP="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/run-evaluation-calibration-live.mjs"
READY="MEELNI_CALIBRATION_READY_V1"
GH_BIN="/opt/homebrew/bin/gh"
SECURITY_BIN="/usr/bin/security"
SAFE_PATH="/opt/homebrew/bin:/usr/bin:/bin"
child_pid=""
channel_dir=""

cleanup() {
  if [ -n "$child_pid" ]; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  if [ -n "$channel_dir" ]; then
    /bin/rm -rf -- "$channel_dir"
  fi
}
trap cleanup EXIT HUP INT TERM

fail() {
  echo "$1" >&2
  exit 1
}

[ -x "$NODE_BIN" ] || fail "calibration_live_launcher_node_missing"
[ -f "$BOOTSTRAP" ] || fail "calibration_live_launcher_bootstrap_missing"
[ -z "${GITHUB_TOKEN-}" ] || fail "calibration_live_launcher_ambient_github_token_rejected"
[ -z "${OPENAI_API_KEY-}" ] || fail "calibration_live_launcher_ambient_openai_key_rejected"

test_mode=${MEELNI_CALIBRATION_LAUNCHER_TEST_MODE-}
credential_fd=${MEELNI_CALIBRATION_TEST_CREDENTIAL_FD-}
test_bootstrap=${MEELNI_CALIBRATION_TEST_BOOTSTRAP-}
if [ -n "$test_mode$credential_fd$test_bootstrap" ]; then
  [ "$test_mode" = "1" ] || fail "calibration_live_launcher_test_mode_invalid"
  case "$credential_fd" in *[!0-9]*|'') fail "calibration_live_launcher_test_fd_invalid" ;; esac
  [ -f "$test_bootstrap" ] || fail "calibration_live_launcher_test_bootstrap_invalid"
  BOOTSTRAP=$test_bootstrap
fi

channel_dir=$(/usr/bin/mktemp -d /tmp/meelni-calibration-live.XXXXXX)
/bin/chmod 700 "$channel_dir"
/usr/bin/mkfifo "$channel_dir/status" "$channel_dir/credentials"
/bin/chmod 600 "$channel_dir/status" "$channel_dir/credentials"

/usr/bin/env -i PATH="$SAFE_PATH" "$NODE_BIN" "$BOOTSTRAP" "$@" \
  3>"$channel_dir/status" <"$channel_dir/credentials" &
child_pid=$!
exec 3<"$channel_dir/status"
exec 4>"$channel_dir/credentials"

readiness=$(
  /usr/bin/perl -e '
    $SIG{ALRM} = sub { exit 124 };
    alarm 10;
    my $line = <STDIN>;
    exit 1 unless defined $line;
    $line =~ s/\r?\n\z//;
    print $line;
  ' <&3
) || fail "calibration_live_launcher_child_exited_before_ready"
[ "$readiness" = "$READY" ] || fail "calibration_live_launcher_handshake_invalid"

if [ "$test_mode" = "1" ]; then
  IFS= read -r github_token <&"$credential_fd" || fail "calibration_live_launcher_test_credentials_missing"
  IFS= read -r openai_key <&"$credential_fd" || fail "calibration_live_launcher_test_credentials_missing"
  IFS= read -r acknowledgement <&"$credential_fd" || fail "calibration_live_launcher_test_credentials_missing"
else
  acknowledgement=${MEELNI_ALLOW_PAID_CALIBRATION-}
  unset MEELNI_ALLOW_PAID_CALIBRATION
  [ -x "$GH_BIN" ] || fail "calibration_live_launcher_gh_missing"
  github_token=$(
    /usr/bin/env -i HOME="$HOME" PATH="$SAFE_PATH" \
      "$GH_BIN" auth token --hostname github.com
  ) || fail "calibration_live_launcher_github_token_failed"
  openai_fd=${MEELNI_CALIBRATION_OPENAI_KEY_FD-}
  if [ -n "$openai_fd" ]; then
    case "$openai_fd" in *[!0-9]*) fail "calibration_live_launcher_openai_fd_invalid" ;; esac
    IFS= read -r openai_key <&"$openai_fd" || fail "calibration_live_launcher_openai_key_failed"
  else
    [ -x "$SECURITY_BIN" ] || fail "calibration_live_launcher_security_missing"
    openai_key=$(
      /usr/bin/env -i HOME="$HOME" PATH="$SAFE_PATH" \
        "$SECURITY_BIN" find-generic-password -w -s meelni-calibration-openai
    ) || fail "calibration_live_launcher_openai_key_failed"
  fi
fi

case "$github_token" in
  gh?_????????*|github_pat_????????*) ;;
  *) fail "calibration_live_launcher_github_token_invalid" ;;
esac
case "$openai_key" in
  sk-????????*) ;;
  *) fail "calibration_live_launcher_openai_key_invalid" ;;
esac
[ -n "$acknowledgement" ] || fail "calibration_live_launcher_acknowledgement_missing"
case "$github_token$openai_key$acknowledgement" in
  *'
'*) fail "calibration_live_launcher_credential_newline_rejected" ;;
esac

printf '%s\n%s\n%s\n' "$github_token" "$openai_key" "$acknowledgement" >&4
exec 4>&-
github_token=''
openai_key=''
acknowledgement=''

if wait "$child_pid"; then
  result=0
else
  result=$?
fi
child_pid=""
exit "$result"
