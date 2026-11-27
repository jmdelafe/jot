#!/usr/bin/env bash
# Tags the current main commit and pushes the tag, which triggers the
# Release workflow (.github/workflows/release.yml).
set -euo pipefail

version="${1:?usage: $0 MAJOR.MINOR.PATCH[-PRERELEASE] (for example 0.1.0)}"
tag="v${version#v}"

"$(dirname "$0")/check-release-tag.sh" "$tag"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is not clean" >&2
  exit 1
fi

git fetch --quiet origin main --tags
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "error: HEAD is not origin/main; check out and pull main first" >&2
  exit 1
fi
if git rev-parse --quiet --verify "refs/tags/$tag" >/dev/null; then
  echo "error: tag $tag already exists" >&2
  exit 1
fi

git tag -a "$tag" -m "Jot $tag"
git push origin "$tag"
echo "Pushed $tag; the Release workflow will publish it after CI passes."
