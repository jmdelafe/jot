import AppKit
import WebKit
import JotCore

/// Owns the floating panel, the always-warm editor web view, and the note
/// store, wiring the bridge messages to persistence and outbound link
/// handling. The editor is created once and kept alive for the app's
/// lifetime so repeated hotkey presses are instant.
@MainActor
final class PanelController: NSObject {
    private let panel: JotPanel
    private let bridge: EditorBridge
    private let noteStore: NoteStore
    private var currentDocument: NoteDocument = .empty
    private var hasLoadedInitialDocument = false
    private var pendingFocusAfterReady = false

    /// Presented when a stored note fails validation on load.
    var onCorruptedNote: ((_ preservedURL: URL) -> Void)?
    var onInvalidBridgeMessage: ((Error) -> Void)?

    init(noteStore: NoteStore) {
        self.noteStore = noteStore
        self.panel = JotPanel()
        self.bridge = EditorBridge()
        super.init()

        panel.contentView = Self.makeGlassContentView(embedding: bridge.webView)
        panel.onEscape = { [weak self] in self?.hide() }
        panel.delegate = self

        bridge.onReady = { [weak self] in self?.handleEditorReady() }
        bridge.onContentChanged = { [weak self] json in self?.handleContentChanged(json) }
        bridge.onOpenLink = { url in NSWorkspace.shared.open(url) }
        bridge.onInvalidMessage = { [weak self] error in self?.onInvalidBridgeMessage?(error) }

        do {
            try bridge.loadEditor()
        } catch {
            // Loading the bundled editor should never fail in a correctly
            // packaged build; if it does, there is nothing useful to show.
            assertionFailure("Failed to load bundled editor: \(error)")
        }
    }

    var isVisible: Bool { panel.isVisible }

    func toggle() {
        if panel.isVisible {
            hide()
        } else {
            show()
        }
    }

    func show() {
        recenterIfOffscreen()
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        if hasLoadedInitialDocument {
            bridge.focusEditor()
        } else {
            pendingFocusAfterReady = true
        }
    }

    func hide() {
        panel.orderOut(nil)
        Task { await noteStore.flushPendingSave() }
    }

    /// Invoked from the status bar menu's "Clear Note" item. Requires
    /// confirmation whenever there is non-empty content.
    func requestClearNote() {
        guard currentDocument != .empty else {
            performClear()
            return
        }
        let alert = NSAlert()
        alert.messageText = "Clear Note?"
        alert.informativeText = "This removes all text from your note. This cannot be undone."
        alert.addButton(withTitle: "Clear Note")
        alert.addButton(withTitle: "Cancel")
        alert.alertStyle = .warning
        if alert.runModal() == .alertFirstButtonReturn {
            performClear()
        }
    }

    /// Cancels any pending debounce and writes the current in-memory
    /// document immediately. Call before app termination.
    func flushSynchronously() async {
        await noteStore.flushPendingSave()
    }

    private func performClear() {
        bridge.clearDocument()
    }

    private func handleEditorReady() {
        Task {
            do {
                let loaded = try await noteStore.load() ?? .empty
                currentDocument = loaded
                await MainActor.run {
                    bridge.loadDocument(loaded)
                    hasLoadedInitialDocument = true
                    if pendingFocusAfterReady {
                        pendingFocusAfterReady = false
                        bridge.focusEditor()
                    }
                }
            } catch NoteStoreError.corrupted(let preservedURL) {
                currentDocument = .empty
                await MainActor.run {
                    bridge.loadDocument(.empty)
                    hasLoadedInitialDocument = true
                    onCorruptedNote?(preservedURL)
                    if pendingFocusAfterReady {
                        pendingFocusAfterReady = false
                        bridge.focusEditor()
                    }
                }
            } catch {
                await MainActor.run {
                    hasLoadedInitialDocument = true
                    onInvalidBridgeMessage?(error)
                }
            }
        }
    }

    private func handleContentChanged(_ json: JSONValue) {
        guard let document = NoteDocument(validating: json) else {
            onInvalidBridgeMessage?(NoteStoreError.invalidDocumentShape)
            return
        }
        currentDocument = document
        Task { await noteStore.scheduleDebouncedSave(document) }
    }

    /// Wraps the web view in the macOS 26 Liquid Glass material so the
    /// panel's chrome matches the system's floating-surface language. The
    /// web view itself stays visually transparent (see `EditorBridge`) so
    /// the glass shows through behind the text.
    private static func makeGlassContentView(embedding webView: NSView) -> NSView {
        let glass = NSGlassEffectView()
        glass.style = .regular
        glass.cornerRadius = 16
        glass.contentView = webView
        return glass
    }

    private func recenterIfOffscreen() {
        let frame = panel.frame
        let onScreen = NSScreen.screens.contains { $0.visibleFrame.intersects(frame) }
        if !onScreen {
            panel.center()
        }
    }
}

extension PanelController: NSWindowDelegate {
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        hide()
        return false
    }
}
