#!/bin/sh

case $- in
  *x*)
    echo "calibration_live_launcher_xtrace_rejected" >&2
    exit 1
    ;;
esac
set -eu
umask 077

NODE_VERSION="22.22.0"
NODE_BIN="/Users/REDACTED/.local/share/fnm/node-versions/v${NODE_VERSION}/installation/bin/node"
SCRIPT_DIR="$(CDPATH= cd -- "$(/usr/bin/dirname -- "$0")" && /bin/pwd -P)"
SCRIPT_DIR=$(/bin/realpath "$SCRIPT_DIR")
LAUNCHER="$SCRIPT_DIR/run-evaluation-calibration-live.sh"
BOOTSTRAP="$SCRIPT_DIR/run-evaluation-calibration-live.mjs"
RUNTIME="$SCRIPT_DIR/run-evaluation-calibration.ts"
STARTUP=$(/bin/realpath "$SCRIPT_DIR/../lib/evaluation/calibration-live-startup.mjs")
READY="MEELNI_CALIBRATION_READY_V1"
GH_BIN="/opt/homebrew/bin/gh"
SECURITY_BIN="/usr/bin/security"
SAFE_PATH="/opt/homebrew/bin:/usr/bin:/bin"
child_pid=""
helper_pid=""
channel_dir=""
channels_open=""

cleanup() {
  [ -z "$channels_open" ] || {
    exec 3<&- 2>/dev/null || true
    exec 4>&- 2>/dev/null || true
    channels_open=""
  }
  if [ -n "$helper_pid" ]; then
    kill -TERM "$helper_pid" 2>/dev/null || true
    kill -KILL "$helper_pid" 2>/dev/null || true
    wait "$helper_pid" 2>/dev/null || true
    helper_pid=""
  fi
  if [ -n "$child_pid" ]; then
    kill -TERM "$child_pid" 2>/dev/null || true
    count=0
    while kill -0 "$child_pid" 2>/dev/null && [ "$count" -lt 20 ]; do
      /bin/sleep 0.1
      count=$((count + 1))
    done
    kill -KILL "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
    child_pid=""
  fi
  if [ -n "$channel_dir" ]; then
    /bin/rm -rf -- "$channel_dir"
    channel_dir=""
  fi
}
on_signal() {
  trap - EXIT HUP INT TERM
  cleanup
  exit "$1"
}
trap cleanup EXIT
trap 'on_signal 129' HUP
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

fail() {
  echo "$1" >&2
  exit 1
}

read_frame() {
  frame_fifo="$channel_dir/frame"
  /usr/bin/mkfifo "$frame_fifo" || return 1
  /bin/chmod 600 "$frame_fifo" || return 1
  /usr/bin/perl -e '
    $SIG{ALRM}=sub{exit 124}; alarm shift @ARGV; my $line="";
    while (length($line) <= 16384) {
      my $n=sysread(STDIN,my $byte,1); exit 1 unless defined($n) && $n;
      last if $byte eq "\n"; $line.=$byte;
    }
    exit 1 if length($line)>16384; $line=~s/\r\z//; print $line;
  ' "$test_timeout" <&"$1" >"$frame_fifo" &
  helper_pid=$!
  frame=""
  frame_read=0
  IFS= read -r frame <"$frame_fifo" || [ -n "$frame" ] || frame_read=1
  if wait "$helper_pid"; then
    helper_pid=""
  else
    helper_pid=""
    /bin/rm -f -- "$frame_fifo"
    return 1
  fi
  /bin/rm -f -- "$frame_fifo"
  [ "$frame_read" -eq 0 ]
}

attest_file() {
  canonical=$(/bin/realpath "$1") || fail "calibration_live_launcher_file_realpath_failed"
  [ "$canonical" = "$1" ] || fail "calibration_live_launcher_file_canonical_rejected"
  [ -f "$canonical" ] && [ ! -L "$canonical" ] || fail "calibration_live_launcher_file_invalid"
  case $(/usr/bin/uname -s) in
    Darwin) metadata=$(/usr/bin/stat -f '%HT|%u|%Lp' "$canonical") || fail "calibration_live_launcher_file_stat_failed" ;;
    Linux) metadata=$(/usr/bin/stat -c '%F|%u|%a' "$canonical") || fail "calibration_live_launcher_file_stat_failed" ;;
    *) fail "calibration_live_launcher_platform_rejected" ;;
  esac
  file_type=${metadata%%|*}
  metadata=${metadata#*|}
  owner=${metadata%%|*}
  mode=${metadata#*|}
  case "$file_type" in
    "Regular File"|"regular file") ;;
    *) fail "calibration_live_launcher_file_type_rejected" ;;
  esac
  [ "$owner" = "$(/usr/bin/id -u)" ] || fail "calibration_live_launcher_file_owner_rejected"
  [ $((0$mode & 022)) -eq 0 ] || fail "calibration_live_launcher_file_mode_rejected"
}
attest_file "$LAUNCHER"
attest_file "$BOOTSTRAP"
attest_file "$RUNTIME"
attest_file "$STARTUP"
[ -z "${GITHUB_TOKEN-}" ] || fail "calibration_live_launcher_ambient_github_token_rejected"
[ -z "${OPENAI_API_KEY-}" ] || fail "calibration_live_launcher_ambient_openai_key_rejected"

test_mode=${MEELNI_CALIBRATION_LAUNCHER_TEST_MODE-}
credential_fd=${MEELNI_CALIBRATION_TEST_CREDENTIAL_FD-}
test_bootstrap=${MEELNI_CALIBRATION_TEST_BOOTSTRAP-}
test_runtime=${MEELNI_CALIBRATION_TEST_RUNTIME-}
test_timeout=${MEELNI_CALIBRATION_TEST_TIMEOUT_SECONDS-10}
test_timeout_override=${MEELNI_CALIBRATION_TEST_TIMEOUT_SECONDS-}
test_node_bin=${MEELNI_CALIBRATION_TEST_NODE_BIN-}
if [ -n "$test_mode$credential_fd$test_bootstrap$test_runtime$test_timeout_override$test_node_bin" ]; then
  [ "$test_mode" = "1" ] || fail "calibration_live_launcher_test_mode_invalid"
  case "$credential_fd" in *[!0-9]*|'') fail "calibration_live_launcher_test_fd_invalid" ;; esac
  case "$test_timeout" in *[!0-9]*|'') fail "calibration_live_launcher_test_timeout_invalid" ;; esac
  [ "$test_timeout" -gt 0 ] && [ "$test_timeout" -le 10 ] || fail "calibration_live_launcher_test_timeout_invalid"
  BOOTSTRAP=$(/bin/realpath "$test_bootstrap") || fail "calibration_live_launcher_test_bootstrap_invalid"
  attest_file "$BOOTSTRAP"
  [ -n "$test_node_bin" ] || fail "calibration_live_launcher_test_node_invalid"
  NODE_BIN=$(/bin/realpath "$test_node_bin") || fail "calibration_live_launcher_test_node_invalid"
  if [ -n "$test_runtime" ]; then
    test_runtime=$(/bin/realpath "$test_runtime") || fail "calibration_live_launcher_test_runtime_invalid"
    attest_file "$test_runtime"
  fi
fi
[ -x "$NODE_BIN" ] || fail "calibration_live_launcher_node_missing"

channel_dir=$(/usr/bin/mktemp -d /tmp/meelni-calibration-live.XXXXXX)
/bin/chmod 700 "$channel_dir"
/usr/bin/mkfifo "$channel_dir/status" "$channel_dir/credentials"
/bin/chmod 600 "$channel_dir/status" "$channel_dir/credentials"

if [ -n "$test_runtime" ]; then
  /usr/bin/env -i PATH="$SAFE_PATH" MEELNI_CALIBRATION_TEST_RUNTIME="$test_runtime" "$NODE_BIN" "$BOOTSTRAP" "$@" \
    3>"$channel_dir/status" <"$channel_dir/credentials" &
else
  /usr/bin/env -i PATH="$SAFE_PATH" "$NODE_BIN" "$BOOTSTRAP" "$@" \
  3>"$channel_dir/status" <"$channel_dir/credentials" &
fi
child_pid=$!
exec 3<"$channel_dir/status"
exec 4>"$channel_dir/credentials"
channels_open=1

readiness_file="$channel_dir/readiness"
/usr/bin/perl -e '
    $SIG{ALRM} = sub { exit 124 };
    alarm $ARGV[0];
    my $line = <STDIN>;
    exit 1 unless defined $line;
    $line =~ s/\r?\n\z//;
    print $line;
  ' "$test_timeout" <&3 >"$readiness_file" &
helper_pid=$!
if wait "$helper_pid"; then
  helper_pid=""
else
  helper_pid=""
  fail "calibration_live_launcher_child_exited_before_ready"
fi
readiness=""
IFS= read -r readiness <"$readiness_file" || [ -n "$readiness" ]
/bin/rm -f -- "$readiness_file"
[ "$readiness" = "$READY" ] || fail "calibration_live_launcher_handshake_invalid"

if [ "$test_mode" = "1" ]; then
  read_frame "$credential_fd" || fail "calibration_live_launcher_test_credentials_missing"
  github_token=$frame
  read_frame "$credential_fd" || fail "calibration_live_launcher_test_credentials_missing"
  openai_key=$frame
  read_frame "$credential_fd" || fail "calibration_live_launcher_test_credentials_missing"
  acknowledgement=$frame
else
  acknowledgement=${MEELNI_ALLOW_PAID_CALIBRATION-}
  unset MEELNI_ALLOW_PAID_CALIBRATION
  [ -x "$GH_BIN" ] || fail "calibration_live_launcher_gh_missing"
  github_token=$(
    /usr/bin/env -i HOME="$HOME" PATH="$SAFE_PATH" \
      /usr/bin/perl -e '$SIG{ALRM}=sub{exit 124}; alarm 10; exec @ARGV' -- "$GH_BIN" auth token --hostname github.com
  ) || fail "calibration_live_launcher_github_token_failed"
  openai_fd=${MEELNI_CALIBRATION_OPENAI_KEY_FD-}
  if [ -n "$openai_fd" ]; then
    case "$openai_fd" in *[!0-9]*) fail "calibration_live_launcher_openai_fd_invalid" ;; esac
    read_frame "$openai_fd" || fail "calibration_live_launcher_openai_key_failed"
    openai_key=$frame
  else
    [ -x "$SECURITY_BIN" ] || fail "calibration_live_launcher_security_missing"
    openai_key=$(
      /usr/bin/env -i HOME="$HOME" PATH="$SAFE_PATH" \
        /usr/bin/perl -e '$SIG{ALRM}=sub{exit 124}; alarm 10; exec @ARGV' -- "$SECURITY_BIN" find-generic-password -w -s meelni-calibration-openai
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
