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
    private let noteStore = NoteStore()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        let panelController = PanelController(noteStore: noteStore)
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
        statusItemController.onClearNote = { [weak panelController] in panelController?.requestClearNote() }
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
        alert.informativeText = "Jot started with a blank note because the saved file was unreadable. "
            + "The original file was kept at:\n\(preservedURL.path)"
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
