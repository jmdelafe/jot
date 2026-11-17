# Contributing to Jot

Jot is a small, local-first macOS scratchpad. Keep changes focused and preserve
existing note files and keyboard behavior. Bug reports and small pull requests
are welcome; discuss larger features in an issue before implementing them.

## Development

Use the prerequisites and source installation steps in [README.md](README.md).
After cloning, or whenever `editor/package-lock.json` changes:

```sh
make bootstrap
make check
make bundle
cd editor && npm audit --audit-level=moderate
```

`make check` runs both test suites and builds the app. `make bundle` also checks
the packaged editor resource, property list, and ad-hoc code signature. These
are local builds, not notarized distribution artifacts.

Add regression tests for changed behavior. Persistence changes should cover
write failures as well as successful saves; failed saves must keep pending
edits and report the error. Editor changes must preserve saved TipTap JSON,
copy/paste, Markdown editing, and undo/redo. Keep the Swift and TypeScript bridge
protocols in sync.

Use `npm install` only when intentionally changing dependencies, and commit
both `editor/package.json` and `editor/package-lock.json`. Do not commit generated
editor HTML, app bundles, signing credentials, or personal notes. Do not use
`npm audit fix --force` without reviewing breaking changes and running the
editor tests.

## Reporting problems

Include the macOS and Jot versions, installation method, reproduction steps,
expected behavior, and actual behavior. For build failures, include
`swift --version`, `xcode-select -p`, `node --version`, and the failing command.
Use a small synthetic note to reproduce editing problems; redact private data
from logs and screenshots.

Do not post sensitive vulnerability details in a public issue. Use the
repository's **Security > Report a vulnerability** option when available. If it
is unavailable, ask the maintainer to enable private reporting without posting
exploit details or private data.

## First-release checklist

The first release is **source-only**. `Packaging/Info.plist` is the app version
source of truth: `CFBundleShortVersionString` is the release version, currently
`0.1.0`, and `CFBundleVersion` is the increasing build number. The private
editor package has no independent release version.

- Review the repository and its history for credentials and private data before
  changing visibility. Enable private vulnerability reporting and require CI
  checks on the default branch.
- Confirm the MIT copyright notice and keep third-party license obligations
  separate from Jot's license.
- Run the commands above from a fresh checkout. Confirm the Swift runner
  actually reports executed tests, not only a successful build.
- On the minimum supported macOS version, smoke-test the local app: hotkey and
  menu bar access; create, edit, switch, pin, delete and restore notes;
  copy/paste and export; hide, quit and relaunch with saved content.
- Back up existing notes before upgrading. Include supported OS/toolchain
  versions, installation steps, known limitations, and data recovery guidance
  in the release notes.
- Only after approval, run `make release VERSION=<version>` from `master` (for
  example `0.1.0-alpha.1`; see *Releases* in the README). The Release workflow
  publishes a source release. Do not attach the ad-hoc-signed `build/Jot.app`
  or describe it as a notarized download.

For a future binary release, use Developer ID signing with hardened runtime,
notarize and staple the artifact, include all bundled third-party license
notices, publish checksums and supported architectures, and verify installation
through Gatekeeper on a clean machine. The current workflow does none of these
distribution steps and requires no signing credentials.
