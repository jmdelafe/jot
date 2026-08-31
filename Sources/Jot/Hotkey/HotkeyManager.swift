import Carbon.HIToolbox
import Foundation

/// Registers Jot's fixed global show/hide shortcut (Option+Command+N) using
/// the legacy Carbon hotkey APIs. This deliberately avoids the Accessibility
/// permission that `CGEventTap`-based global shortcuts require — Carbon
/// hotkeys only ever see the one key combination they register.
final class HotkeyManager {
    enum RegistrationError: Error {
        case eventHandlerInstallFailed(OSStatus)
        case hotKeyRegistrationFailed(OSStatus)
    }

    private static let signature: OSType = {
        // A 4-character code identifying Jot's hotkeys to Carbon.
        let bytes: [UInt8] = Array("JotH".utf8)
        return bytes.reduce(0) { ($0 << 8) | OSType($1) }
    }()

    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?
    private let onHotKey: () -> Void

    init(onHotKey: @escaping () -> Void) {
        self.onHotKey = onHotKey
    }

    deinit {
        unregister()
    }

    /// Registers Option+Command+N. Throws instead of failing silently so the
    /// caller can show an actionable alert per the product decisions.
    func register(keyCode: UInt32 = UInt32(kVK_ANSI_N),
                  modifiers: UInt32 = UInt32(optionKey | cmdKey)) throws {
        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: OSType(kEventHotKeyPressed)
        )

        let selfPointer = Unmanaged.passUnretained(self).toOpaque()
        let installStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            { _, eventRef, userData in
                guard let eventRef, let userData else { return noErr }
                var hotKeyID = EventHotKeyID()
                let status = GetEventParameter(
                    eventRef,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &hotKeyID
                )
                guard status == noErr, hotKeyID.signature == HotkeyManager.signature else {
                    return noErr
                }
                let manager = Unmanaged<HotkeyManager>.fromOpaque(userData).takeUnretainedValue()
                manager.onHotKey()
                return noErr
            },
            1,
            &eventType,
            selfPointer,
            &eventHandlerRef
        )
        guard installStatus == noErr else {
            throw RegistrationError.eventHandlerInstallFailed(installStatus)
        }

        let hotKeyID = EventHotKeyID(signature: HotkeyManager.signature, id: 1)
        var ref: EventHotKeyRef?
        let registerStatus = RegisterEventHotKey(
            keyCode,
            modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &ref
        )
        guard registerStatus == noErr, let ref else {
            if let eventHandlerRef {
                RemoveEventHandler(eventHandlerRef)
            }
            eventHandlerRef = nil
            throw RegistrationError.hotKeyRegistrationFailed(registerStatus)
        }
        hotKeyRef = ref
    }

    func unregister() {
        if let hotKeyRef {
            UnregisterEventHotKey(hotKeyRef)
            self.hotKeyRef = nil
        }
        if let eventHandlerRef {
            RemoveEventHandler(eventHandlerRef)
            self.eventHandlerRef = nil
        }
    }
}
