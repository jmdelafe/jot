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
    private var isPresentingPersistenceError = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        let library = NotesLibrary(onSaveError: { [weak self] error in
            Task { @MainActor in
                self?.presentPersistenceError(error)
            }
        })
        let panelController = PanelController(library: library)
        self.panelController = panelController
        panelController.onCorruptedNote = { [weak self] preservedURL in
            self?.presentCorruptedNoteAlert(preservedURL: preservedURL)
        }
        panelController.onPersistenceError = { [weak self] error in
            self?.presentPersistenceError(error)
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

    /// Cancel an ordinary quit if pending edits cannot be saved.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let panelController else { return .terminateNow }
        Task { @MainActor in
            do {
                try await panelController.flushSynchronously()
                NSApp.reply(toApplicationShouldTerminate: true)
            } catch {
                NSApp.reply(toApplicationShouldTerminate: false)
                presentPersistenceError(error)
            }
        }
        return .terminateLater
    }

    private func presentPersistenceError(_ error: Error) {
        NSLog("Jot: notes storage error: \(error)")
        guard !isPresentingPersistenceError else { return }
        isPresentingPersistenceError = true
        defer { isPresentingPersistenceError = false }
        panelController?.show()
        let alert = NSAlert()
        alert.messageText = "Couldn't Access Saved Notes"
        alert.informativeText = "Check available disk space and folder permissions, then retry. "
            + "Pending edits are still in memory. Keep Jot open until saving succeeds; "
            + "you can also copy or export the current note for safekeeping.\n\n\(error.localizedDescription)"
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Retry")
        alert.addButton(withTitle: "Keep Jot Open")
        if alert.runModal() == .alertFirstButtonReturn {
            Task { @MainActor in
                do {
                    try await panelController?.retryPersistence()
                } catch {
                    presentPersistenceError(error)
                }
            }
        }
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
