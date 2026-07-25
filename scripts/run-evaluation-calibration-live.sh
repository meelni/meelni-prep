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
NODE_BIN="/Users/savi/.local/share/fnm/node-versions/v${NODE_VERSION}/installation/bin/node"
NODE_SHA256="913b144fdb40638b1acef7974ab3c33fbd527cc0974cb5da467ab1e6ac51b4d4"
SCRIPT_DIR="$(CDPATH= cd -- "$(/usr/bin/dirname -- "$0")" && /bin/pwd -P)"
SCRIPT_DIR=$(/bin/realpath "$SCRIPT_DIR")
LAUNCHER="$SCRIPT_DIR/run-evaluation-calibration-live.sh"
BOOTSTRAP="$SCRIPT_DIR/run-evaluation-calibration-live.mjs"
RUNTIME="$SCRIPT_DIR/generated/run-evaluation-calibration.bundle.mjs"
STARTUP=$(/bin/realpath "$SCRIPT_DIR/../lib/evaluation/calibration-live-startup.mjs")
MANIFEST=$(/bin/realpath "$SCRIPT_DIR/../docs/evidence/sav-248-v20-runtime-manifest.json")
PACKAGE_LOCK=$(/bin/realpath "$SCRIPT_DIR/../package-lock.json")
SOURCE_REPOSITORY_ROOT=$(/bin/realpath "$SCRIPT_DIR/..")
READY="MEELNI_CALIBRATION_READY_V1"
GH_BIN="/opt/homebrew/bin/gh"
GH_SHA256="02d2d4a85241c6a8c0b77ebb1ec76fc723caf7fb128e00915b306b968847cba1"
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
safe_git_rev_parse() {
  revision=$1
  /usr/bin/env -i GIT_NO_REPLACE_OBJECTS=1 PATH="/usr/bin:/bin" \
    /usr/bin/git -C "$SOURCE_REPOSITORY_ROOT" rev-parse --verify \
      "$revision"
}
attest_reviewed_file() {
  file=$1
  relative=$2
  reviewed_commit=$3
  attest_file "$file"
  expected_blob=$(safe_git_rev_parse "$reviewed_commit:$relative") || \
    fail "calibration_live_launcher_reviewed_blob_missing"
  actual_blob=$(
    /usr/bin/env -i GIT_NO_REPLACE_OBJECTS=1 PATH="/usr/bin:/bin" \
      /usr/bin/git hash-object --no-filters "$file"
  ) || fail "calibration_live_launcher_reviewed_blob_hash_failed"
  [ "$actual_blob" = "$expected_blob" ] || \
    fail "calibration_live_launcher_reviewed_blob_mismatch"
}
attest_sha256_file() {
  file=$1
  expected_sha256=$2
  attest_file "$file"
  digest=$(/usr/bin/shasum -a 256 "$file") || \
    fail "calibration_live_launcher_binary_hash_failed"
  digest=${digest%% *}
  [ "$digest" = "$expected_sha256" ] || \
    fail "calibration_live_launcher_binary_hash_mismatch"
}
attest_node_binary() {
  file=$1
  attest_sha256_file "$file" "$NODE_SHA256"
  /usr/bin/codesign --verify --strict --verbose=0 \
    -R '=anchor apple generic and certificate leaf[subject.OU] = "HX7739G8FX" and identifier "node"' \
    "$file" || fail "calibration_live_launcher_node_signature_rejected"
}
seal_reviewed_file() {
  relative=$1
  reviewed_commit=$2
  source="$SOURCE_REPOSITORY_ROOT/$relative"
  destination="$sealed_root/$relative"
  /bin/mkdir -p -- "$(/usr/bin/dirname -- "$destination")" || \
    fail "calibration_live_launcher_sealed_directory_failed"
  /bin/cp "$source" "$destination" || \
    fail "calibration_live_launcher_sealed_copy_failed"
  /bin/chmod 400 "$destination" || \
    fail "calibration_live_launcher_sealed_mode_failed"
  attest_reviewed_file "$destination" "$relative" "$reviewed_commit"
}
attest_file "$LAUNCHER"
attest_file "$BOOTSTRAP"
attest_file "$RUNTIME"
attest_file "$STARTUP"
attest_file "$MANIFEST"
attest_file "$PACKAGE_LOCK"
[ -z "${GITHUB_TOKEN-}" ] || fail "calibration_live_launcher_ambient_github_token_rejected"
[ -z "${OPENAI_API_KEY-}" ] || fail "calibration_live_launcher_ambient_openai_key_rejected"

test_mode=${MEELNI_CALIBRATION_LAUNCHER_TEST_MODE-}
credential_fd=${MEELNI_CALIBRATION_TEST_CREDENTIAL_FD-}
test_bootstrap=${MEELNI_CALIBRATION_TEST_BOOTSTRAP-}
test_runtime=${MEELNI_CALIBRATION_TEST_RUNTIME-}
test_timeout=${MEELNI_CALIBRATION_TEST_TIMEOUT_SECONDS-10}
test_timeout_override=${MEELNI_CALIBRATION_TEST_TIMEOUT_SECONDS-}
test_node_bin=${MEELNI_CALIBRATION_TEST_NODE_BIN-}
test_channel_namespace=${MEELNI_CALIBRATION_TEST_CHANNEL_NAMESPACE-}
if [ -n "$test_mode$credential_fd$test_bootstrap$test_runtime$test_timeout_override$test_node_bin$test_channel_namespace" ]; then
  [ "$test_mode" = "1" ] || fail "calibration_live_launcher_test_mode_invalid"
  case "$credential_fd" in *[!0-9]*|'') fail "calibration_live_launcher_test_fd_invalid" ;; esac
  case "$test_timeout" in *[!0-9]*|'') fail "calibration_live_launcher_test_timeout_invalid" ;; esac
  [ "$test_timeout" -gt 0 ] && [ "$test_timeout" -le 10 ] || fail "calibration_live_launcher_test_timeout_invalid"
  case "$test_channel_namespace" in
    ''|*[!A-Za-z0-9_-]*) fail "calibration_live_launcher_test_channel_namespace_invalid" ;;
  esac
  [ "${#test_channel_namespace}" -le 64 ] || \
    fail "calibration_live_launcher_test_channel_namespace_invalid"
  BOOTSTRAP=$(/bin/realpath "$test_bootstrap") || fail "calibration_live_launcher_test_bootstrap_invalid"
  attest_file "$BOOTSTRAP"
  [ -n "$test_node_bin" ] || fail "calibration_live_launcher_test_node_invalid"
  NODE_BIN=$(/bin/realpath "$test_node_bin") || fail "calibration_live_launcher_test_node_invalid"
  if [ -n "$test_runtime" ]; then
    test_runtime=$(/bin/realpath "$test_runtime") || fail "calibration_live_launcher_test_runtime_invalid"
    attest_file "$test_runtime"
  fi
  [ -x "$NODE_BIN" ] || fail "calibration_live_launcher_node_missing"
fi

reviewed_source_commit=""
if [ "$test_mode" != "1" ]; then
  reviewed_source_commit=${MEELNI_CALIBRATION_REVIEWED_SOURCE_COMMIT-}
  unset MEELNI_CALIBRATION_REVIEWED_SOURCE_COMMIT
  [ "${#reviewed_source_commit}" -eq 40 ] || \
    fail "calibration_live_launcher_reviewed_source_commit_invalid"
  case "$reviewed_source_commit" in
    *[!0-9a-f]*) fail "calibration_live_launcher_reviewed_source_commit_invalid" ;;
  esac
  actual_head=$(safe_git_rev_parse 'HEAD^{commit}') || \
    fail "calibration_live_launcher_head_invalid"
  [ "$actual_head" = "$reviewed_source_commit" ] || \
    fail "calibration_live_launcher_reviewed_head_mismatch"
  attest_reviewed_file "$LAUNCHER" "scripts/run-evaluation-calibration-live.sh" "$reviewed_source_commit"
  attest_reviewed_file "$BOOTSTRAP" "scripts/run-evaluation-calibration-live.mjs" "$reviewed_source_commit"
  attest_reviewed_file "$STARTUP" "lib/evaluation/calibration-live-startup.mjs" "$reviewed_source_commit"
  attest_reviewed_file "$MANIFEST" "docs/evidence/sav-248-v20-runtime-manifest.json" "$reviewed_source_commit"
  attest_reviewed_file "$RUNTIME" "scripts/generated/run-evaluation-calibration.bundle.mjs" "$reviewed_source_commit"
  attest_reviewed_file "$PACKAGE_LOCK" "package-lock.json" "$reviewed_source_commit"
  [ -x "$NODE_BIN" ] || fail "calibration_live_launcher_node_missing"
  GH_BIN=$(/bin/realpath "$GH_BIN") || fail "calibration_live_launcher_gh_missing"
  attest_node_binary "$NODE_BIN"
  attest_sha256_file "$GH_BIN" "$GH_SHA256"
fi

channel_template=/tmp/meelni-calibration-live.XXXXXX
if [ "$test_mode" = "1" ]; then
  channel_template="/tmp/meelni-calibration-live.${test_channel_namespace}.XXXXXX"
fi
channel_dir=$(/usr/bin/mktemp -d "$channel_template")
channel_dir=$(/bin/realpath "$channel_dir")
/bin/chmod 700 "$channel_dir"
if [ "$test_mode" != "1" ]; then
  sealed_root="$channel_dir/reviewed"
  /bin/mkdir -p "$sealed_root" || fail "calibration_live_launcher_sealed_root_failed"
  /bin/chmod 700 "$sealed_root" || fail "calibration_live_launcher_sealed_root_mode_failed"
  seal_reviewed_file "scripts/run-evaluation-calibration-live.mjs" "$reviewed_source_commit"
  seal_reviewed_file "lib/evaluation/calibration-live-startup.mjs" "$reviewed_source_commit"
  seal_reviewed_file "docs/evidence/sav-248-v20-runtime-manifest.json" "$reviewed_source_commit"
  seal_reviewed_file "scripts/generated/run-evaluation-calibration.bundle.mjs" "$reviewed_source_commit"
  seal_reviewed_file "package-lock.json" "$reviewed_source_commit"
  /bin/cp "$NODE_BIN" "$sealed_root/node" || \
    fail "calibration_live_launcher_sealed_node_copy_failed"
  /bin/chmod 500 "$sealed_root/node" || \
    fail "calibration_live_launcher_sealed_node_mode_failed"
  attest_node_binary "$sealed_root/node"
  /bin/cp "$GH_BIN" "$sealed_root/gh" || \
    fail "calibration_live_launcher_sealed_gh_copy_failed"
  /bin/chmod 500 "$sealed_root/gh" || \
    fail "calibration_live_launcher_sealed_gh_mode_failed"
  attest_sha256_file "$sealed_root/gh" "$GH_SHA256"
  BOOTSTRAP="$sealed_root/scripts/run-evaluation-calibration-live.mjs"
  RUNTIME="$sealed_root/scripts/generated/run-evaluation-calibration.bundle.mjs"
  NODE_BIN="$sealed_root/node"
  GH_BIN="$sealed_root/gh"
fi
/usr/bin/mkfifo "$channel_dir/status" "$channel_dir/credentials"
/bin/chmod 600 "$channel_dir/status" "$channel_dir/credentials"

if [ -n "$test_runtime" ]; then
  /usr/bin/env -i PATH="$SAFE_PATH" MEELNI_CALIBRATION_TEST_RUNTIME="$test_runtime" "$NODE_BIN" "$BOOTSTRAP" "$@" \
    3>"$channel_dir/status" <"$channel_dir/credentials" &
else
  /usr/bin/env -i PATH="$SAFE_PATH" \
    MEELNI_CALIBRATION_REPOSITORY_ROOT="$SOURCE_REPOSITORY_ROOT" \
    "$NODE_BIN" "$BOOTSTRAP" "$@" \
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
