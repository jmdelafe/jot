# Jot

A fast, local, Raycast Notes-style scratchpad for the macOS menu bar. Press
**⌥⌘N** to toggle a floating Liquid Glass note. Notes save automatically and
stay available across app launches. No Dock icon, account, or internet
connection required.

Alpha releases include a prebuilt **Apple Silicon** app, under the
[MIT license](LICENSE). Downloads are ad-hoc signed, not Developer ID signed
or notarized.

## Install a prebuilt app

Requires **macOS 26+ on Apple Silicon**. Download `Jot-macos-arm64.zip` and
`checksums.txt` from [Releases](https://github.com/jmdelafe/jot/releases).
In the folder containing both downloads, verify the archive:

```sh
shasum -a 256 -c checksums.txt
```

Unzip it, move `Jot.app` to `/Applications`, and open it. macOS may block the
first launch because the app is not notarized. If you trust the download,
use **System Settings > Privacy & Security > Open Anyway** after attempting
to open it. Do not disable Gatekeeper globally.

Quit Jot before replacing an older copy, and back up your notes before upgrading.
Only Apple Silicon downloads are provided; source builds remain available below.

## Install from source

### Requirements

- macOS 26+
- Swift 6.2+ (Xcode Command Line Tools or a full Xcode installation)
- Node.js 24+ and npm

### Build and launch

```sh
git clone https://github.com/jmdelafe/jot.git
cd jot
make bootstrap
make run
```

`make bootstrap` installs the locked editor dependencies. `make run` builds the
editor and release app, creates an ad-hoc-signed `build/Jot.app`, and launches
it. This uses the same ad-hoc signing as the release downloads.

To keep a local installation, quit Jot and copy `build/Jot.app` to
`/Applications`. Run only one copy at a time; copies share the same notes
directory. Updates are manual: rebuild, quit the running copy, and replace it.

After code changes, quit Jot and run `make run` again. `make build` updates the
debug build; it does not update or restart the packaged `build/Jot.app`.

## Using Jot

- **Open/hide:** press **⌥⌘N**, click the menu bar icon, or launch Jot again.
  ⌥-click the icon for a new note; right-click it for a menu.
- **Window:** translucent dark glass that looks the same focused or not, independent of the system appearance.
  Drag the title bar to move it. The note title is centered and
  faint; when the pointer is over the window it fades out and the traffic
  lights and the ⌘, list, and + buttons (Actions, Browse Notes, New Note)
  fade in. The window grows and shrinks with its content and remembers its
  width.
- **Multiple notes:** **⌘N** creates a note (an empty note is reused, and
  empty notes are discarded when you leave them). **⌘P** opens a searchable
  list of notes, with pinned notes first. In the list, **⇧⌘P** pins and **⌃X**
  deletes. Deleted notes stay in *Recently Deleted* for 60 days, where you can
  restore them.
- **Actions (⌘K):** pin, copy with formatting (**⇧⌘C**) or as Markdown, HTML,
  or plain text, export to a file, or delete.
- **Formatting:** use Markdown-style shortcuts such as `## `, `- `, `- [ ] `,
  and `> `,
  or the formatting pill that appears over selected text. **⌘C** copies the
  selection as plain text; **⇧⌘C** copies it with formatting (the whole note
  if nothing is selected). Both show "Copied to Clipboard" after a successful
  copy. Formatted copy includes HTML and RTF for rich-text apps, plus a
  plain-text fallback.
  **⌘V** pastes plain text in the surrounding style; **⇧⌘V** preserves
  supported formatting (headings, lists, links, and inline styles).
  Pasting a URL over selected text with **⌘V** links it.
  Placing the cursor in formatted text reveals its editable Markdown, with the
  markers dimmed and the formatting still shown; moving away renders it again.
  Lists stay rendered while editing, including the item
  under the cursor, so bullets, numbering, and checkboxes remain visible.
  **⌘L** edits a link.
- **Escape** closes the open palette or popover, otherwise it hides Jot.

## Data, privacy, and recovery

Notes are stored locally in the sandbox container, one JSON file per note plus
an index:

```text
~/Library/Containers/com.jmdelafe.jot/Data/Library/Application Support/Jot/Notes/
```

A note saved by an earlier single-note version (`Jot/note.json`) is imported
automatically on first launch.

Jot has no account, sync, or telemetry service. Notes are not encrypted by Jot;
they are ordinary JSON files protected by your macOS account and disk settings.
Links open in your default browser.

For a full backup, quit Jot and copy the entire `Jot` application-support folder,
including `Notes/index.json` and every note file. To restore, quit Jot, keep a
copy of the current folder, and replace it with a known-good backup. Markdown,
HTML, and plain-text exports are useful portable copies, but are not a full
backup of the library's formatting and metadata.

Save errors leave pending edits in memory and show a **Retry** action. Check
disk space and folder permissions; keep Jot open or copy/export the current
note until saving succeeds. A normal quit is cancelled if edits cannot be
saved. Force-quit, a crash, or loss of power can still lose edits within the
autosave delay, so keep backups of important notes.

Unreadable data is copied to a uniquely named `.corrupt-…json` backup before
Jot replaces it. Do not remove those backups until recovery is complete.
Recently Deleted is not a permanent backup: notes are purged after 60 days.

### macOS permissions

Release downloads and local builds are ad-hoc signed, not notarized.
Gatekeeper may flag downloaded copies; see the installation instructions above.
The app remains sandboxed. Its network client entitlement is required for
WebKit's helper processes to initialize, even though the editor loads only
bundled content and works offline. The user-selected read-write file
entitlement is used only by the export save panel.

## Development

| Command | Purpose |
| --- | --- |
| `make build` | Build the editor and debug Swift app |
| `make test` | Typecheck the editor and run editor and Swift tests |
| `make test-editor` | Typecheck and test only the editor |
| `make test-swift` | Run only the Swift test runner |
| `make check` | Run tests and build both components |
| `make bundle` | Create and verify a local release build at `build/Jot.app` without launching |
| `make dist` | Build an Apple Silicon app ZIP and SHA-256 checksums in `build/release/` |
| `make release VERSION=…` | Tag `origin/master` and trigger a GitHub release (see below) |
| `make clean` | Remove Swift and app build output and editor caches |

App builds target only `Jot`; the separate `JotTestRunner` is built and run by
`make test-swift`. Swift tests run through an executable rather than `swift test`.
This works around a Command Line Tools-only toolchain issue where the
SwiftPM test driver builds the test bundle but does not execute its tests.
The Makefile selects the native build backend so Swift Testing macros load
on CLT-only toolchains, with a separate `.build/testing` cache:

```sh
swift run --build-system native --scratch-path .build/testing JotTestRunner
```

Swift 6.4 deprecates this backend; retain the workaround until the executable
test runner works with the replacement. If a copied build cache refers to a
different checkout, run `make clean` before rebuilding. If `tsc` or `vite`
cannot be found, run `make bootstrap`.

The app version lives in `Packaging/Info.plist`; the private editor package
has no separate release version. See [CONTRIBUTING.md](CONTRIBUTING.md) for
dependency updates, bug reporting, and the source-release checklist.

### Continuous integration

GitHub Actions runs `.github/workflows/ci.yml` on every pull request and on
pushes to `master`. The **Editor** job typechecks and tests the editor on
Ubuntu and audits the locked dependency tree. The **Swift** job builds the
editor bundle, runs `make test-swift`, and builds and verifies the Apple Silicon
download on macOS 26. Run `make check`, `make dist`, and
`cd editor && npm run audit` locally before a release. The
[contribution guide](CONTRIBUTING.md) documents the temporary, expiring
exception for one build/test dependency advisory.
On release tags, CI passes the download to the Release workflow; ordinary CI
runs do not publish downloads or change repository visibility.

### Releases

Versions follow [Semantic Versioning 2.0.0](https://semver.org). Release tags
are `v` + the version, for example `v0.1.0-alpha.1`, `v0.1.0-rc.1`, or
`v0.1.0`. The tag's `MAJOR.MINOR.PATCH` must equal `CFBundleShortVersionString`
in `Packaging/Info.plist` (macOS only allows numeric app versions there, so
pre-release suffixes live only in the tag).

To release, bump the version in `Info.plist` if needed and merge to `master`,
then from an up-to-date, clean `master` checkout run:

```sh
make release VERSION=0.1.0-alpha.1
```

This validates the version and pushes the tag. `.github/workflows/release.yml`
then reruns CI and publishes `Jot-macos-arm64.zip`, `checksums.txt`, and the
GitHub source archives, with `.github/release-notes.md` and generated changelog
notes. The app includes Jot's license and third-party notices. Tags with a
pre-release suffix are marked as pre-releases.

## Project layout

- `Sources/Jot/`: AppKit/WebKit app, global hotkey, floating panel, and editor bridge.
- `Sources/JotCore/`: Shared document, bridge protocol, and persistence logic.
- `Sources/JotTestRunner/`: Swift Testing suites and executable test runner.
- `editor/`: TipTap/ProseMirror editor built with TypeScript and Vite.
- `Packaging/`: App metadata and sandbox entitlements.
- `.github/workflows/`: Continuous integration and releases.
- `scripts/`: Release tag validation and tagging scripts.

## License

Jot is available under the [MIT license](LICENSE). Third-party dependencies
retain their own licenses.
