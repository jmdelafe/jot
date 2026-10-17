import AppKit

/// A borderless-feeling, always-on-top panel that can become key (so typing
/// works) without activating a Dock icon or appearing in Cmd-Tab, and that
/// stays visible across Spaces — including full-screen Spaces — and when
/// another app becomes active.
final class JotPanel: NSPanel {
    var onEscape: (() -> Void)?

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    convenience init() {
        self.init(
            contentRect: NSRect(x: 0, y: 0, width: 620, height: 440),
            styleMask: [.titled, .closable, .resizable, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isFloatingPanel = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        titlebarAppearsTransparent = true
        titleVisibility = .hidden
        isOpaque = false
        backgroundColor = .clear
        isMovableByWindowBackground = true
        isReleasedWhenClosed = false
        minSize = NSSize(width: 360, height: 260)
        hidesOnDeactivate = false
        standardWindowButton(.zoomButton)?.isHidden = true
        let restored = setFrameUsingName("JotPanel")
        setFrameAutosaveName("JotPanel")
        if !restored {
            center()
        }
    }

    /// `Escape` hides the panel without quitting the app; it must not be
    /// swallowed by any child view first.
    override func cancelOperation(_ sender: Any?) {
        onEscape?()
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == kVK_Escape {
            onEscape?()
            return
        }
        super.keyDown(with: event)
    }
}

private let kVK_Escape: UInt16 = 0x35
