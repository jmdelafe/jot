import AppKit

/// The menu bar entry point: a status item with a menu offering the actions
/// that aren't reachable via the fixed global hotkey alone.
@MainActor
final class StatusItemController {
    private let statusItem: NSStatusItem

    var onToggle: (() -> Void)?
    var onClearNote: (() -> Void)?
    var onQuit: (() -> Void)?

    init() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "square.and.pencil", accessibilityDescription: "Jot")
            button.image?.isTemplate = true
        }
        statusItem.menu = buildMenu()
    }

    private func buildMenu() -> NSMenu {
        let menu = NSMenu()

        let toggleItem = NSMenuItem(title: "Show/Hide Jot", action: #selector(handleToggle), keyEquivalent: "n")
        toggleItem.keyEquivalentModifierMask = [.option, .command]
        toggleItem.target = self
        menu.addItem(toggleItem)

        menu.addItem(.separator())

        let clearItem = NSMenuItem(title: "Clear Note…", action: #selector(handleClearNote), keyEquivalent: "")
        clearItem.target = self
        menu.addItem(clearItem)

        menu.addItem(.separator())

        let quitItem = NSMenuItem(title: "Quit Jot", action: #selector(handleQuit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        return menu
    }

    @objc private func handleToggle() {
        onToggle?()
    }

    @objc private func handleClearNote() {
        onClearNote?()
    }

    @objc private func handleQuit() {
        onQuit?()
    }
}
