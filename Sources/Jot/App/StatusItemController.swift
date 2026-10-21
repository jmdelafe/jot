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
            button.image = NSImage(systemSymbolName: "square.and.pencil", accessibilityDescription: "Jot")
            button.image?.isTemplate = true
            button.toolTip = "Jot — click to open, ⌥-click for a new note"
            button.target = self
            button.action = #selector(handleClick)
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
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
