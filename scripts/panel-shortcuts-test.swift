import AppKit

@MainActor
final class TestApplication: NSApplication {
    var actions: [Selector] = []

    override func sendAction(_ action: Selector, to target: Any?, from sender: Any?) -> Bool {
        actions.append(action)
        return true
    }
}

@main
struct PanelShortcutsTest {
    @MainActor
    static func main() {
        let app = TestApplication.shared as! TestApplication
        let panel = JotPanel()
        func check(_ keyCode: UInt16, _ characters: String, _ flags: NSEvent.ModifierFlags, _ expected: Selector?) {
            app.actions.removeAll()
            let event = NSEvent.keyEvent(
                with: .keyDown, location: .zero, modifierFlags: flags, timestamp: 0,
                windowNumber: panel.windowNumber, context: nil, characters: characters,
                charactersIgnoringModifiers: characters, isARepeat: false, keyCode: keyCode
            )!
            panel.keyDown(with: event)
            precondition(app.actions == (expected.map { [$0] } ?? []), "Unexpected action for \(flags)")
        }
        check(0x07, "x", .command, #selector(NSText.cut(_:)))
        check(0x07, "x", [.command, .shift], nil)
        check(0x07, "x", [.command, .option], nil)
        check(0x07, "x", [.command, .control], nil)
        check(0x09, "v", .command, #selector(NSText.paste(_:)))
        print("Panel shortcut routing passed")
    }
}
