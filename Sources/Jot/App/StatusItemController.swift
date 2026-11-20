import AppKit

/// The menu bar entry point. Like Raycast Notes: click toggles the note
/// window, Option-click starts a new note, and right-click (or
/// Control-click) shows the menu.
@MainActor
final class StatusItemController: NSObject {
    private let statusItem: NSStatusItem

    var onToggle: (() -> Void)?
    var onNewNote: (() -> Void)?
    var onBrowseNotes: (() -> Void)?
    var onQuit: (() -> Void)?

    override init() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        super.init()
        if let button = statusItem.button {
            button.image = Self.menuBarImage()
            button.toolTip = "Jot — click to open, ⌥-click for a new note"
            button.target = self
            button.action = #selector(handleClick)
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
    }

    private static func menuBarImage() -> NSImage {
        let image = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { _ in
            NSColor.black.set()
            let note = NSBezierPath()
            note.lineWidth = 1.2
            note.lineJoinStyle = .round
            note.move(to: NSPoint(x: 3, y: 1.5))
            note.line(to: NSPoint(x: 12, y: 1.5))
            note.line(to: NSPoint(x: 16, y: 5.5))
            note.line(to: NSPoint(x: 16, y: 14.5))
            note.curve(to: NSPoint(x: 14.5, y: 16), controlPoint1: NSPoint(x: 16, y: 15.3), controlPoint2: NSPoint(x: 15.3, y: 16))
            note.line(to: NSPoint(x: 3.5, y: 16))
            note.curve(to: NSPoint(x: 2, y: 14.5), controlPoint1: NSPoint(x: 2.7, y: 16), controlPoint2: NSPoint(x: 2, y: 15.3))
            note.line(to: NSPoint(x: 2, y: 3))
            note.curve(to: NSPoint(x: 3, y: 1.5), controlPoint1: NSPoint(x: 2, y: 2.2), controlPoint2: NSPoint(x: 2.4, y: 1.5))
            note.close()
            note.move(to: NSPoint(x: 12, y: 1.5))
            note.line(to: NSPoint(x: 12, y: 5.5))
            note.line(to: NSPoint(x: 16, y: 5.5))
            note.stroke()

            let lines = NSBezierPath()
            lines.lineWidth = 1.4
            lines.lineCapStyle = .round
            lines.move(to: NSPoint(x: 5, y: 11.7))
            lines.line(to: NSPoint(x: 12.5, y: 13))
            lines.move(to: NSPoint(x: 5, y: 8.6))
            lines.line(to: NSPoint(x: 12.5, y: 9.9))
            lines.stroke()
            NSBezierPath(ovalIn: NSRect(x: 4.4, y: 5, width: 1.7, height: 1.7)).fill()
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "Jot"
        return image
    }

    @objc private func handleClick() {
        let event = NSApp.currentEvent
        let flags = event?.modifierFlags ?? []
        if event?.type == .rightMouseUp || flags.contains(.control) {
            showMenu()
        } else if flags.contains(.option) {
            onNewNote?()
        } else {
            onToggle?()
        }
    }

    private func showMenu() {
        let menu = NSMenu()
        menu.addItem(item("Open Jot", #selector(handleToggle), key: "n", modifiers: [.option, .command]))
        menu.addItem(item("New Note", #selector(handleNewNote)))
        menu.addItem(item("Browse Notes…", #selector(handleBrowseNotes)))
        menu.addItem(.separator())
        menu.addItem(item("Quit Jot", #selector(handleQuit), key: "q"))
        // Attaching the menu only for this click keeps left-click free for
        // toggling the window.
        statusItem.menu = menu
        statusItem.button?.performClick(nil)
        statusItem.menu = nil
    }

    private func item(_ title: String, _ action: Selector, key: String = "", modifiers: NSEvent.ModifierFlags = [.command]) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.keyEquivalentModifierMask = modifiers
        item.target = self
        return item
    }

    @objc private func handleToggle() { onToggle?() }
    @objc private func handleNewNote() { onNewNote?() }
    @objc private func handleBrowseNotes() { onBrowseNotes?() }
    @objc private func handleQuit() { onQuit?() }
}
