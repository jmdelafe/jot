import AppKit
import WebKit
import UniformTypeIdentifiers
import JotCore

/// Owns the floating panel, the always-warm editor web view, and the notes
/// library, wiring bridge messages to persistence, window chrome and
/// clipboard/export. The editor is created once and kept alive for the app's
/// lifetime so repeated hotkey presses are instant.
@MainActor
final class PanelController: NSObject {
    private let panel: JotPanel
    private let bridge: EditorBridge
    private let library: NotesLibrary
    private var currentNoteID: UUID?
    private var isEditorReady = false
    private var pendingFocusAfterReady = false
    private var pendingNewNoteAfterReady = false
    private var pendingShowNotesAfterReady = false
    private var preferredContentHeight: CGFloat?

    /// Presented when a stored note or index fails validation on load.
    var onCorruptedNote: ((_ preservedURL: URL) -> Void)?
    var onPersistenceError: ((Error) -> Void)?
    var onInvalidBridgeMessage: ((Error) -> Void)?

    /// Centered, Raycast-style note title. The native title is hidden because
    /// AppKit leading-aligns it next to the traffic lights.
    private let titleLabel = PassthroughLabel(labelWithString: NoteSummary.untitled)

    init(library: NotesLibrary) {
        self.library = library
        self.panel = JotPanel()
        self.bridge = EditorBridge()
        super.init()

        panel.contentView = Self.makeGlassContentView(embedding: bridge.webView, title: titleLabel)
        let accessory = makeTitlebarAccessory()
        panel.addTitlebarAccessoryViewController(accessory)
        panel.revealOnHover([accessory.view])
        panel.onEscape = { [weak self] in self?.hide() }
        panel.delegate = self

        bridge.onMessage = { [weak self] message in self?.handle(message) }
        bridge.onInvalidMessage = { [weak self] error in self?.onInvalidBridgeMessage?(error) }

        do {
            try bridge.loadEditor()
        } catch {
            NSLog("Jot: failed to load bundled editor: \(error)")
        }
    }

    var isVisible: Bool { panel.isVisible }

    func toggle() {
        if panel.isVisible && panel.isKeyWindow {
            hide()
        } else {
            show()
        }
    }

    func show() {
        recenterIfOffscreen()
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        panel.syncChromeWithPointer()
        panel.makeFirstResponder(bridge.webView)
        if isEditorReady {
            bridge.focusEditor()
        } else {
            pendingFocusAfterReady = true
        }
    }

    func hide() {
        panel.orderOut(nil)
        Task {
            do {
                try await library.flush()
            } catch {
                onPersistenceError?(error)
            }
        }
    }

    /// Opens a fresh note (reusing the current one if it is still empty).
    func newNote() {
        show()
        guard isEditorReady else {
            pendingNewNoteAfterReady = true
            return
        }
        Task {
            do {
                present(try await library.createNote())
                bridge.focusEditor()
            } catch {
                onPersistenceError?(error)
            }
        }
    }

    /// Shows the panel with the searchable note browser open.
    func showNotesBrowser() {
        show()
        if isEditorReady {
            bridge.showNotes()
        } else {
            pendingShowNotesAfterReady = true
        }
    }

    /// Writes any pending edits immediately. Call before app termination.
    func flushSynchronously() async throws {
        try await library.flush()
    }

    func retryPersistence() async throws {
        if isEditorReady {
            try await library.flush()
        } else {
            try await loadLibrary()
        }
    }

    // MARK: - Bridge

    private func handle(_ message: InboundBridgeMessage) {
        switch message {
        case .ready:
            handleEditorReady()
        case .contentChanged(let noteID, let json):
            guard let document = NoteDocument(validating: json) else {
                onInvalidBridgeMessage?(NoteStoreError.invalidDocumentShape)
                return
            }
            Task {
                if let summary = await library.updateCurrent(document, noteID: noteID) {
                    updateTitle(summary.title)
                }
            }
        case .openLink(let url):
            NSWorkspace.shared.open(url)
        case .newNote:
            newNote()
        case .openNote(let id):
            perform { try await $0.open(id) }
        case .restoreNote(let id):
            perform { try await $0.restore(id) }
        case .deleteNote(let id):
            perform { try await $0.delete(id) }
        case .purgeNote(let id):
            perform { try await $0.purge(id); return nil }
        case .setPinned(let id, let pinned):
            perform { try await $0.setPinned(id, pinned); return nil }
        case .requestNotes:
            Task { bridge.setNotes(await library.snapshot()) }
        case .copyText(let text):
            do {
                try Clipboard.copyText(text)
                bridge.clipboardCopied()
            } catch {
                NSAlert(error: error).runModal()
            }
        case .copyRichText(let html, let text):
            do {
                try Clipboard.copyRichText(html: html, text: text)
                bridge.clipboardCopied()
            } catch {
                NSAlert(error: error).runModal()
            }
        case .pasteRichText(let noteID):
            guard noteID == currentNoteID else { return }
            do {
                if let content = try Clipboard.readRichText() {
                    bridge.pasteRichText(noteID: noteID, html: content.html, text: content.text)
                }
            } catch {
                NSAlert(error: error).runModal()
            }
        case .exportNote(let format, let text):
            export(text, as: format)
        case .preferredHeight(let height):
            preferredContentHeight = CGFloat(height)
            applyPreferredHeight()
        case .hide:
            hide()
        }
    }

    /// Runs a library operation; if it switched notes, loads the new one.
    /// Always refreshes the browser list afterwards.
    private func perform(_ operation: @escaping @Sendable (NotesLibrary) async throws -> OpenedNote?) {
        Task {
            do {
                if let opened = try await operation(library) {
                    present(opened)
                }
            } catch {
                onPersistenceError?(error)
            }
            bridge.setNotes(await library.snapshot())
        }
    }

    private func handleEditorReady() {
        Task {
            do {
                try await loadLibrary()
            } catch {
                onPersistenceError?(error)
            }
        }
    }

    private func loadLibrary() async throws {
        present(try await library.bootstrap())
        isEditorReady = true
        if pendingNewNoteAfterReady {
            pendingNewNoteAfterReady = false
            present(try await library.createNote())
        }
        if pendingShowNotesAfterReady {
            pendingShowNotesAfterReady = false
            bridge.showNotes()
        } else if pendingFocusAfterReady {
            bridge.focusEditor()
        }
        pendingFocusAfterReady = false
    }

    private func present(_ opened: OpenedNote) {
        currentNoteID = opened.summary.id
        bridge.loadNote(opened)
        updateTitle(opened.summary.title)
        if let preserved = opened.preservedCorruptURL {
            onCorruptedNote?(preserved)
        }
    }

    private func updateTitle(_ title: String) {
        if panel.title != title {
            panel.title = title
            titleLabel.stringValue = title
        }
    }

    // MARK: - Export

    private func export(_ text: String, as format: ExportFormat) {
        let savePanel = NSSavePanel()
        let type = UTType(filenameExtension: format.fileExtension) ?? .plainText
        savePanel.allowedContentTypes = [type]
        savePanel.canCreateDirectories = true
        let baseName = panel.title.isEmpty ? NoteSummary.untitled : panel.title
        savePanel.nameFieldStringValue = Self.sanitizedFileName(baseName) + "." + format.fileExtension
        savePanel.beginSheetModal(for: panel) { response in
            guard response == .OK, let url = savePanel.url else { return }
            do {
                try Data(text.utf8).write(to: url, options: .atomic)
            } catch {
                NSAlert(error: error).runModal()
            }
        }
    }

    private static func sanitizedFileName(_ name: String) -> String {
        let cleaned = name.components(separatedBy: CharacterSet(charactersIn: "/:\\\\")).joined(separator: "-")
        return String(cleaned.prefix(60)).trimmingCharacters(in: .whitespaces)
    }

    // MARK: - Window chrome

    /// Grows or shrinks the panel to fit its content, keeping the top edge
    /// fixed, like Raycast Notes. Bounded so it never covers the screen.
    private func applyPreferredHeight() {
        guard let contentHeight = preferredContentHeight, !panel.inLiveResize else { return }
        let frame = panel.frame
        let chrome = frame.height - panel.contentLayoutRect.height
        let visible = (panel.screen ?? NSScreen.main)?.visibleFrame ?? frame
        let maximum = max(panel.minSize.height, min(visible.height * 0.75, frame.maxY - visible.minY))
        let height = min(max((contentHeight + chrome).rounded(), panel.minSize.height), maximum)
        guard abs(height - frame.height) >= 1 else { return }
        let newFrame = NSRect(x: frame.minX, y: frame.maxY - height, width: frame.width, height: height)
        panel.setFrame(newFrame, display: true, animate: false)
    }

    private func makeTitlebarAccessory() -> NSTitlebarAccessoryViewController {
        func button(_ symbol: String, _ label: String, _ action: Selector) -> NSButton {
            let image = NSImage(systemSymbolName: symbol, accessibilityDescription: label) ?? NSImage()
            let button = NSButton(image: image, target: self, action: action)
            button.isBordered = false
            button.bezelStyle = .accessoryBarAction
            button.contentTintColor = .secondaryLabelColor
            button.toolTip = label
            button.setAccessibilityLabel(label)
            button.symbolConfiguration = .init(pointSize: 13, weight: .regular)
            return button
        }
        let stack = NSStackView(views: [
            button("command", "Actions (⌘K)", #selector(handleActionsButton)),
            button("list.bullet.rectangle", "Browse Notes (⌘P)", #selector(handleNotesButton)),
            button("plus", "New Note (⌘N)", #selector(handleNewNoteButton)),
        ])
        stack.orientation = .horizontal
        stack.spacing = 10
        stack.edgeInsets = NSEdgeInsets(top: 0, left: 0, bottom: 0, right: 12)
        let container = NSView()
        stack.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
        ])
        container.frame.size = NSSize(width: stack.fittingSize.width, height: 28)
        let accessory = NSTitlebarAccessoryViewController()
        accessory.layoutAttribute = .trailing
        accessory.view = container
        return accessory
    }

    @objc private func handleActionsButton() { bridge.showActions() }
    @objc private func handleNotesButton() { bridge.showNotes() }
    @objc private func handleNewNoteButton() { newNote() }

    /// Milky in light mode, charcoal in dark mode, so the glass keeps a calm,
    /// paper-like tone instead of taking on whatever window is behind it.
    private static let glassTint = NSColor(name: "JotGlassTint") { appearance in
        appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            ? NSColor(srgbRed: 0.12, green: 0.12, blue: 0.15, alpha: 0.5)
            : NSColor(white: 1, alpha: 0.5)
    }

    /// Wraps the web view in the macOS 26 Liquid Glass material so the
    /// panel's chrome matches the system's floating-surface language. The
    /// web view itself stays visually transparent (see `EditorBridge`) so
    /// the glass shows through behind the text.
    private static func makeGlassContentView(embedding webView: NSView, title: NSTextField) -> NSView {
        let glass = NSGlassEffectView()
        glass.style = .regular
        glass.cornerRadius = 18
        glass.tintColor = glassTint
        let content = NSView()
        glass.contentView = content
        webView.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(webView)
        // Leave the native title bar available for dragging and window controls.
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: content.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])
        title.font = .systemFont(ofSize: 12)
        title.textColor = .tertiaryLabelColor
        title.alignment = .center
        title.lineBreakMode = .byTruncatingTail
        title.translatesAutoresizingMaskIntoConstraints = false
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        content.addSubview(title)
        NSLayoutConstraint.activate([
            title.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            title.centerYAnchor.constraint(equalTo: content.topAnchor, constant: 16),
            title.widthAnchor.constraint(lessThanOrEqualTo: content.widthAnchor, constant: -240),
        ])
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

    func windowDidEndLiveResize(_ notification: Notification) {
        applyPreferredHeight()
    }
}

/// A label that never intercepts clicks, so the title bar under it stays
/// draggable.
final class PassthroughLabel: NSTextField {
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}
