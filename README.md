# Jot

A macOS menu bar scratchpad. Press **⌥⌘N** to toggle a floating rich-text
panel. Your note saves automatically and stays available across app launches.
No Dock icon, account, or network access required.

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
it. Click the menu bar icon or press **⌥⌘N** to open or hide the panel.

Use the format bar or Markdown-style shortcuts such as `## `, `- `, and
`> ` to format your note. **Clear Note** asks for confirmation before
removing its contents.

Notes are stored locally in the sandbox container:

```text
~/Library/Containers/com.jmdelafe.jot/Data/Library/Application Support/Jot/note.json
```

The app is signed for local development, not notarized for distribution.
Gatekeeper may flag it when copied to another machine.

## Development

| Command | Purpose |
| --- | --- |
| `make build` | Build the editor and debug Swift app |
| `make test` | Typecheck the editor and run editor and Swift tests |
| `make check` | Run tests and build both components |
| `make bundle` | Create a release app at `build/Jot.app` without launching |
| `make clean` | Remove Swift and app build output and editor caches |

Swift tests run through `swift run JotTestRunner` rather than `swift test`.
This works around a Command Line Tools-only toolchain issue where the
SwiftPM test driver builds the test bundle but does not execute its tests.

## Project layout

- `Sources/Jot/`: AppKit/WebKit app, global hotkey, floating panel, and editor bridge.
- `Sources/JotCore/`: Shared document, bridge protocol, and persistence logic.
- `Sources/JotTestRunner/`: Swift Testing suites and executable test runner.
- `editor/`: TipTap/ProseMirror editor built with TypeScript and Vite.
- `Packaging/`: App metadata and sandbox entitlements.
