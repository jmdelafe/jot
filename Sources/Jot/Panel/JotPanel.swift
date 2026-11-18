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
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 260),
            styleMask: [.titled, .closable, .resizable, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isFloatingPanel = true
        appearance = NSAppearance(named: .darkAqua)
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        titlebarAppearsTransparent = true
        titleVisibility = .hidden
        title = "Untitled"
        isOpaque = false
        backgroundColor = .clear
        isMovableByWindowBackground = true
        isReleasedWhenClosed = false
        minSize = NSSize(width: 240, height: 420)
        hidesOnDeactivate = false
        standardWindowButton(.zoomButton)?.isHidden = true
        standardWindowButton(.miniaturizeButton)?.isHidden = true
        let restored = setFrameUsingName("JotPanel")
        setFrameAutosaveName("JotPanel")
        if !restored {
            center()
        } else if frame.width < minSize.width || frame.height < minSize.height {
            // Frames saved before the minimum was raised; keep the top edge fixed.
            let size = NSSize(width: max(frame.width, minSize.width), height: max(frame.height, minSize.height))
            setFrame(NSRect(x: frame.minX, y: frame.maxY - size.height, width: size.width, height: size.height), display: false)
        }
    }

    private var hoverRevealedViews: [NSView] = []

    /// Keeps the window quiet at rest: the traffic lights and `extraViews`
    /// fade in only while the pointer is over the panel.
    func revealOnHover(_ extraViews: [NSView]) {
        hoverRevealedViews = [standardWindowButton(.closeButton)?.superview].compactMap { $0 } + extraViews
        contentView?.addTrackingArea(
            NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self)
        )
        syncChromeWithPointer(animated: false)
    }

    /// The pointer may already be over the panel when it is shown, which
    /// produces no enter event.
    func syncChromeWithPointer(animated: Bool = true) {
        setChromeVisible(frame.contains(NSEvent.mouseLocation), animated: animated)
    }

    override func mouseEntered(with event: NSEvent) { setChromeVisible(true, animated: true) }
    override func mouseExited(with event: NSEvent) { setChromeVisible(false, animated: true) }

    private func setChromeVisible(_ visible: Bool, animated: Bool) {
        let alpha: CGFloat = visible ? 1 : 0
        guard animated else {
            hoverRevealedViews.forEach { $0.alphaValue = alpha }
            return
        }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.25
            hoverRevealedViews.forEach { $0.animator().alphaValue = alpha }
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
        if event.keyCode == kVK_ANSI_V,
            event.modifierFlags.intersection(.deviceIndependentFlagsMask)
                .intersection([.command, .shift, .option, .control]) == .command,
            NSApp.sendAction(#selector(NSText.paste(_:)), to: nil, from: self)
        {
            return
        }
        super.keyDown(with: event)
    }
}

private let kVK_Escape: UInt16 = 0x35
private let kVK_ANSI_V: UInt16 = 0x09
