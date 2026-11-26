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
    private var hoverHiddenViews: [NSView] = []

    /// Keeps the window quiet at rest: the traffic lights and `extraViews`
    /// fade in only while the pointer is over the panel, and `restingViews`
    /// fade out to make room for them.
    func revealOnHover(_ extraViews: [NSView], hiding restingViews: [NSView] = []) {
        hoverRevealedViews = [standardWindowButton(.closeButton)?.superview].compactMap { $0 } + extraViews
        hoverHiddenViews = restingViews
        contentView?.addTrackingArea(
            NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self)
        )
        syncChromeWithPointer(animated: false)
    }

    /// The pointer may already be over the panel when it is shown, which
    /// produces no enter event.
    func syncChromeWithPointer(animated: Bool = true) {
        alignCloseButton()
        setChromeVisible(frame.contains(NSEvent.mouseLocation), animated: animated)
    }

    func alignCloseButton() {
        guard let button = standardWindowButton(.closeButton), let titlebar = button.superview else { return }
        titlebar.layoutSubtreeIfNeeded()
        let center = titlebar.convert(NSPoint(x: 18, y: frame.height - 18), from: nil)
        button.setFrameOrigin(NSPoint(x: center.x - button.frame.width / 2, y: center.y - button.frame.height / 2))
    }

    override func mouseEntered(with event: NSEvent) { setChromeVisible(true, animated: true) }
    override func mouseExited(with event: NSEvent) { setChromeVisible(false, animated: true) }

    private func setChromeVisible(_ visible: Bool, animated: Bool) {
        let views = hoverRevealedViews.map { ($0, visible) } + hoverHiddenViews.map { ($0, !visible) }
        guard animated else {
            views.forEach { view, shown in view.alphaValue = shown ? 1 : 0 }
            return
        }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.25
            views.forEach { view, shown in view.animator().alphaValue = shown ? 1 : 0 }
        }
    }

    /// `Escape` hides the panel without quitting the app; it must not be
    /// swallowed by any child view first.
    override func cancelOperation(_ sender: Any?) {
        onEscape?()
    }

    /// Jot has no main menu (it's an accessory app), so the standard
    /// Cmd-Q key equivalent must be handled here.
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if event.keyCode == kVK_ANSI_Q,
            event.modifierFlags.intersection([.command, .shift, .option, .control]) == .command
        {
            NSApp.terminate(nil)
            return true
        }
        return super.performKeyEquivalent(with: event)
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
        if event.keyCode == kVK_ANSI_X,
            event.modifierFlags.intersection(.deviceIndependentFlagsMask)
                .intersection([.command, .shift, .option, .control]) == .command,
            NSApp.sendAction(#selector(NSText.cut(_:)), to: nil, from: self)
        {
            return
        }
        super.keyDown(with: event)
    }
}

final class JotGlassView: NSGlassEffectView {
    override func layout() {
        super.layout()
        // AppKit can restore the standard button position during window layout.
        (window as? JotPanel)?.alignCloseButton()
    }
}

private let kVK_Escape: UInt16 = 0x35
private let kVK_ANSI_V: UInt16 = 0x09
private let kVK_ANSI_X: UInt16 = 0x07
private let kVK_ANSI_Q: UInt16 = 0x0C
