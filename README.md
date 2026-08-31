# Jot

A macOS 26+ menu bar scratchpad. Press **⌥⌘N** anywhere to summon a small
floating rich-text panel, jot something down, and dismiss it — your note is
always there next time. No Dock icon, no windows to manage, no network
access.

## Requirements

- macOS 26+ (Apple Silicon)
- Swift 6.2+ toolchain (Command Line Tools are sufficient; a full Xcode.app
  install is **not** required — see [Deviations](#deviations-from-the-plan))
- Node.js 20+ and npm (only needed to build the bundled editor)

## Building and running

```sh
make bootstrap   # npm install for the editor (once, or after package.json changes)
make check       # editor typecheck + tests + build, Swift tests, Swift build
make run         # builds an ad-hoc-signed build/Jot.app and launches it
```

Other targets: `make build` (debug build only), `make bundle` (release build
+ app bundle, no launch), `make test` (tests only), `make clean`.

The app is unsigned by a real Developer ID — it's ad-hoc codesigned
(`codesign --sign -`) purely so the sandbox and entitlements are honored
locally. Gatekeeper will still flag it as coming from an unidentified
developer on another machine.

## Using Jot

- **⌥⌘N** toggles the panel open/closed from anywhere, in any app.
- The panel is a borderless, non-activating floating panel with a Liquid
  Glass (`NSGlassEffectView`) background over a transparent `WKWebView`.
- Formatting: bold, italic, strikethrough, headings, bullet/numbered lists,
  and blockquotes, all reachable via Markdown-style input rules (e.g. `## `,
  `- `, `1. `, `> `) and a small format bar.
- **Clear Note** (in the panel) asks for confirmation before wiping content.
- Content saves automatically (debounced) to a single JSON file in the
  sandboxed container's Application Support directory:
  `~/Library/Containers/com.jmdelafe.jot/Data/Library/Application Support/Jot/note.json`.
  Notes persist across hide/show and full app relaunch.
- If that file is ever corrupted/unreadable, Jot shows an alert rather than
  silently discarding it, and leaves the original file untouched on disk.
- The app requests no Accessibility permission (see below) and makes no
  network requests of any kind.

## Project layout

```
Package.swift              SwiftPM manifest: JotCore (library), Jot (app),
                            JotTestRunner (test runner, see below)
Sources/JotCore/           Pure-Foundation logic: bridge JSON/message types,
                            NoteDocument, NoteStore (sandboxed persistence)
Sources/Jot/                AppKit/WebKit app: status item, hotkey, panel,
                            editor bridge, app delegate
Sources/JotTestRunner/     Swift Testing suite + custom entry point (see
                            "Why JotTestRunner instead of swift test" below)
editor/                     TipTap/ProseMirror editor, built with Vite +
                            TypeScript, output inlined into
                            Sources/Jot/Resources/editor/index.html
Packaging/                  Info.plist and Jot.entitlements used by `make bundle`
```

## Testing

- **Editor** (`editor/`): Vitest, 15 tests covering the ProseMirror schema,
  input rules, and the native bridge's message contract. Run with
  `npm run typecheck && npx vitest run`.
- **Swift** (`Sources/JotTestRunner/`): Swift Testing, 31 tests covering
  `JSONValue`, `InboundBridgeMessage` decoding/validation, `NoteDocument`
  serialization/validation, and `NoteStore` load/save/debounce behavior.
  Run with `swift run JotTestRunner`.
- `HotkeyManager` has no automated tests by design — registering a real
  Carbon global hotkey has OS-level side effects that aren't safe to
  exercise in an automated test run. It was instead verified manually (see
  below).

### Why `JotTestRunner` instead of `swift test`

On this machine's toolchain (Swift 6.3.3, Command Line Tools only, no
Xcode.app), `swift test` builds the `.xctest` bundle successfully but the
SwiftPM test driver never actually invokes it: the command prints "Build
complete!" and exits `0` with **no test output at all**, even for a suite
containing a deliberately failing `#expect`. This was confirmed three ways:
invoking `swift test` directly, invoking the underlying
`swiftpm-testing-helper` binary directly with correct paths, and reproducing
the identical silent no-op from a brand-new, from-scratch minimal SwiftPM
package — ruling out anything specific to this project.

The workaround: the tested logic lives in a separate library target
(`JotCore`), and `JotTestRunner` is a plain executable target whose entry
point calls Swift Testing's own entry point directly
(`await Testing.__swiftPMEntryPoint() as Never`), bypassing the
`.xctest`/dlopen mechanism entirely. Run via `swift run JotTestRunner`, this
produces full, correct console output and exit codes (`0` on all-pass, `1`
on any failure) — verified in both directions.

This may well be specific to this exact pre-release CLT-only toolchain and
not necessary on a machine with a full Xcode.app install; if `swift test`
works normally there, the plain `.testTarget` approach would work too. This
repo keeps the `JotTestRunner` approach since it's the one verified to work
here and doesn't cost anything on a machine where `swift test` also works.

## Manual verification performed

Since UI automation (synthetic keystrokes/screen capture) has limited
Accessibility/Screen Recording permissions available in this environment,
the following was verified directly against a running `build/Jot.app`:

- App launches, stays running, and creates its sandbox container at
  `~/Library/Containers/com.jmdelafe.jot/`.
- Exactly one menu bar (status) item is created; clicking it opens a
  620×440 borderless panel (verified via the Accessibility API), and
  clicking again toggles it.
- `lsof -p <pid> -i` shows no TCP/IP network connections at any point
  (only local Unix-domain XPC sockets, which are normal for any sandboxed
  app) — confirms the no-network requirement.
- No `kTCCServiceAccessibility` prompt is triggered for Jot, consistent
  with using Carbon `RegisterEventHotKey` instead of a `CGEventTap`.
- `codesign --verify --deep --strict build/Jot.app` succeeds.

Not independently verified in this pass: pixel-level Liquid Glass rendering
and end-to-end typed-content persistence through a real keystroke (both are
covered indirectly — the former by `NSGlassEffectView` being used exactly as
documented by Apple, the latter by the 31 passing `NoteStore`/`NoteDocument`
tests plus the debounce logic itself).

## Deviations from the plan

- **`swift test` doesn't run tests on this toolchain** — replaced with the
  `JotCore`/`JotTestRunner` structure described above. This is the most
  significant deviation; see that section for the full story.
- **`editor/.npmrc`** pins the npm registry explicitly, working around a
  corporate registry configuration that otherwise causes `npm install` to
  hang indefinitely in this environment.
- **No automated tests for `HotkeyManager`** — deliberate, to avoid
  registering a real global hotkey (with real OS-level side effects) inside
  an automated test run.
- Everything else (sandboxing, entitlements, SwiftPM-only/no-Xcode-project
  build, bundled TipTap editor, Liquid Glass panel, Carbon hotkey, JSON
  file persistence) follows the approved plan as written.
