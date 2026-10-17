import AppKit
import JotCore

/// Wires together the status item, the hotkey, the panel/editor/persistence
/// stack, and macOS lifecycle events. Jot runs as a `.accessory` app: no Dock
/// icon, no menu bar app menu, only a status item.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItemController: StatusItemController?
    private var panelController: PanelController?
    private var hotkeyManager: HotkeyManager?
    private let library = NotesLibrary()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        let panelController = PanelController(library: library)
        self.panelController = panelController
        panelController.onCorruptedNote = { [weak self] preservedURL in
            self?.presentCorruptedNoteAlert(preservedURL: preservedURL)
        }
        panelController.onInvalidBridgeMessage = { error in
            // Surfacing every malformed bridge message as a user-facing alert
            // would be noisy for something that should never happen in a
            // correctly packaged build; log it so it's still discoverable.
            NSLog("Jot: invalid bridge message: \(error)")
        }

        let statusItemController = StatusItemController()
        statusItemController.onToggle = { [weak panelController] in panelController?.toggle() }
        statusItemController.onNewNote = { [weak panelController] in panelController?.newNote() }
        statusItemController.onBrowseNotes = { [weak panelController] in panelController?.showNotesBrowser() }
        statusItemController.onQuit = { NSApp.terminate(nil) }
        self.statusItemController = statusItemController

        let hotkeyManager = HotkeyManager { [weak panelController] in panelController?.toggle() }
        self.hotkeyManager = hotkeyManager
        do {
            try hotkeyManager.register()
        } catch {
            presentHotkeyRegistrationFailureAlert(error: error)
        }
    }

    /// Launching Jot again (Finder, Spotlight, `open`) brings the note up.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        panelController?.show()
        return false
    }

    /// Flush any pending debounced save before the app actually exits so a
    /// force-quit or system shutdown immediately after typing can't lose the
    /// last few hundred milliseconds of edits.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let panelController else { return .terminateNow }
        Task { @MainActor in
            await panelController.flushSynchronously()
            NSApp.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }

    private func presentCorruptedNoteAlert(preservedURL: URL) {
        let alert = NSAlert()
        alert.messageText = "Note Could Not Be Read"
        alert.informativeText = "Part of Jot's saved data was unreadable, so it was set aside instead of being "
            + "overwritten. The original file was kept at:\n\(preservedURL.path)"
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    private func presentHotkeyRegistrationFailureAlert(error: Error) {
        let alert = NSAlert()
        alert.messageText = "Couldn't Register Global Shortcut"
        alert.informativeText = "Jot couldn't register Option+Command+N, possibly because another app is already "
            + "using it. You can still open Jot from its menu bar icon.\n\nDetails: \(error)"
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }
}
