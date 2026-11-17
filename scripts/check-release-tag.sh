#!/usr/bin/env bash
# Validates a release tag: "v" + a SemVer 2.0.0 version without build metadata,
# whose MAJOR.MINOR.PATCH must equal CFBundleShortVersionString in Info.plist.
set -euo pipefail

tag="${1:?usage: $0 vMAJOR.MINOR.PATCH[-PRERELEASE] [Info.plist]}"
plist="${2:-$(dirname "$0")/../Packaging/Info.plist}"

num='(0|[1-9][0-9]*)'
ident='(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)'
semver="^v${num}\.${num}\.${num}(-${ident}(\.${ident})*)?$"

if [[ ! "$tag" =~ $semver ]]; then
  echo "error: '$tag' is not a SemVer tag such as v1.2.3 or v1.2.3-alpha.1" >&2
  exit 1
fi

version="${tag#v}"
core="${version%%-*}"
app_version="$(sed -n '/<key>CFBundleShortVersionString<\/key>/{n;s/.*<string>\(.*\)<\/string>.*/\1/p;}' "$plist")"

if [[ "$core" != "$app_version" ]]; then
  echo "error: tag version $core does not match CFBundleShortVersionString $app_version in $plist" >&2
  exit 1
fi

echo "$tag is a valid release tag"
