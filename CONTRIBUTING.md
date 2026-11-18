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
make dist
cd editor && npm run audit
```

`make check` runs the test suites and builds the app. `make dist` verifies the
app bundle, then produces an Apple Silicon ZIP and SHA-256 checksums. The app
contains Jot's license and generated third-party notices; packaging fails if a
dependency's license text is missing. These builds are ad-hoc signed, not
Developer ID signed or notarized. Use `make bundle` for a local app without
creating a download.

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

`npm run audit` blocks moderate-or-higher dependency advisories, including
development dependencies. The only temporary exception is
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) in
picomatch's build/test tooling, which has no patched release as of 2026-11-17.
Do not pass untrusted glob patterns to those tools. The exception in
`editor/audit-ci.json` expires on **2026-12-01 at 00:00 UTC**; remove it when
an upstream fix is available. Other advisories and audit service failures
remain blocking.

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

## Alpha-release checklist

Alpha releases include an **Apple Silicon app ZIP**, checksums, and source
archives. `Packaging/Info.plist` is the app version
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
- Verify the downloaded ZIP's checksum, extract it, and confirm its app
  signature and bundled editor. Test installation on a clean macOS 26 machine
  without the build toolchain; include the Gatekeeper warning in release notes.
- Only after approval, run `make release VERSION=<version>` from `master` (for
  example `0.1.0-alpha.1`; see *Releases* in the README). The Release workflow
  publishes the ZIP and checksums from CI. Do not describe the ad-hoc-signed
  app as Developer ID signed or notarized.

For future notarized releases, use Developer ID signing with hardened runtime,
notarize and staple the artifact, and verify installation through Gatekeeper
on a clean machine. The current workflow requires no signing credentials.
