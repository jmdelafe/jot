#!/usr/bin/env bash
# Tests for check-release-tag.sh.
set -euo pipefail

check="$(dirname "$0")/check-release-tag.sh"
plist="$(mktemp)"
trap 'rm -f "$plist"' EXIT
cat >"$plist" <<'EOF'
<dict>
    <key>CFBundleVersion</key>
    <string>7</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
</dict>
EOF

failures=0
expect() {
  local outcome="$1" tag="$2"
  if "$check" "$tag" "$plist" >/dev/null 2>&1; then actual=pass; else actual=fail; fi
  if [[ "$actual" != "$outcome" ]]; then
    echo "FAIL: expected $tag to $outcome" >&2
    failures=$((failures + 1))
  fi
}

expect pass v0.1.0
expect pass v0.1.0-alpha.1
expect pass v0.1.0-beta.2
expect pass v0.1.0-rc.1
expect fail 0.1.0-alpha.1
expect fail v0.1
expect fail v01.1.0
expect fail v0.1.0-alpha.01
expect fail v0.1.0-
expect fail v0.1.0+build.1
expect fail v0.2.0
expect fail v0.2.0-alpha.1

if ((failures)); then exit 1; fi
echo "check-release-tag: all tests passed"
