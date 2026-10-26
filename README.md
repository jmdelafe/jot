# Jot

A fast, local, Raycast Notes-style scratchpad for the macOS menu bar. Press
**⌥⌘N** to toggle a floating Liquid Glass note. Notes save automatically and
stay available across app launches. No Dock icon, account, or internet
connection required.

## Requirements

- macOS 26+
- Swift 6.2+ (Xcode Command Line Tools or a full Xcode installation)
- Node.js 20+ and npm

## Quickstart

```sh
git clone https://github.com/jmdelafe/jot.git
cd jot
make bootstrap
make run
```

`make bootstrap` installs the editor dependencies. `make run` builds the
editor and release app, creates an ad-hoc-signed `build/Jot.app`, and launches
it.

After code changes, quit Jot and run `make run` again. `make build` updates the
debug build; it does not update or restart the packaged `build/Jot.app`.

### Using Jot

- **Open/hide:** press **⌥⌘N**, click the menu bar icon, or launch Jot again.
  ⌥-click the icon for a new note; right-click it for a menu.
- **Window:** drag the title bar to move it. The note title is centered; the
  ⌘, list, and + buttons open Actions, Browse Notes, and New Note. The window
  grows and shrinks with its content and remembers its width.
- **Multiple notes:** **⌘N** creates a note (an empty note is reused, and
  empty notes are discarded when you leave them). **⌘P** opens a searchable
  list of notes, with pinned notes first. In the list, **⇧⌘P** pins and **⌃X**
  deletes. Deleted notes stay in *Recently Deleted* for 60 days, where you can
  restore them.
- **Actions (⌘K):** pin, show or hide the format bar (**⇧⌘F**), copy with
  formatting (**⇧⌘C**) or as Markdown, HTML, or plain text, export to a file,
  or delete.
- **Formatting:** use Markdown-style shortcuts such as `## `, `- `, and `> `,
  or the optional format bar. **⌘C** copies the selection as plain text;
  **⇧⌘C** copies it with formatting (the whole note if nothing is selected).
  Both show "Copied to Clipboard" after a successful copy. Formatted copy
  includes HTML and RTF for rich-text apps, plus a plain-text fallback.
  **⌘V** pastes plain text in the surrounding style; **⇧⌘V** preserves
  supported formatting (headings, lists, links, and inline styles).
  Pasting a URL over selected text with **⌘V** links it.
  Placing the cursor in formatted text reveals its editable Markdown; moving
  away renders it again. **⌘L** edits a link.
- **Escape** closes the open palette or popover, otherwise it hides Jot.

Notes are stored locally in the sandbox container, one JSON file per note plus
an index:

```text
~/Library/Containers/com.jmdelafe.jot/Data/Library/Application Support/Jot/Notes/
```

A note saved by an earlier single-note version (`Jot/note.json`) is imported
automatically on first launch.

The app is signed for local development, not notarized for distribution.
Gatekeeper may flag it when copied to another machine.
The app remains sandboxed. Its network client entitlement is required for
WebKit's helper processes to initialize, even though the editor loads only
bundled content and works offline. The user-selected read-write file
entitlement is used only by the export save panel.

## Development

| Command | Purpose |
| --- | --- |
| `make build` | Build the editor and debug Swift app |
| `make test` | Typecheck the editor and run editor and Swift tests |
| `make check` | Run tests and build both components |
| `make bundle` | Create a release app at `build/Jot.app` without launching |
| `make clean` | Remove Swift and app build output and editor caches |

App builds target only `Jot`; the separate `JotTestRunner` is built and run by
`make test`. Swift tests run through `swift run JotTestRunner` rather than `swift test`.
This works around a Command Line Tools-only toolchain issue where the
SwiftPM test driver builds the test bundle but does not execute its tests.
If the default build system cannot load the Swift Testing macros, run
`swift run --build-system native JotTestRunner`.

## Project layout

- `Sources/Jot/`: AppKit/WebKit app, global hotkey, floating panel, and editor bridge.
- `Sources/JotCore/`: Shared document, bridge protocol, and persistence logic.
- `Sources/JotTestRunner/`: Swift Testing suites and executable test runner.
- `editor/`: TipTap/ProseMirror editor built with TypeScript and Vite.
- `Packaging/`: App metadata and sandbox entitlements.
