import Foundation

public enum ExportFormat: String, Sendable, CaseIterable {
    case markdown
    case html
    case plainText

    public var fileExtension: String {
        switch self {
        case .markdown: "md"
        case .html: "html"
        case .plainText: "txt"
        }
    }
}

/// Messages sent from the embedded editor (web layer) to native Swift code.
/// This must be kept in sync with `editor/src/protocol.ts`'s
/// `OutboundMessage` union — it is intentionally the only vocabulary the web
/// layer is allowed to use.
public enum InboundBridgeMessage: Equatable, Sendable {
    case ready
    /// `noteID` guards against late edits from a note the user already left.
    case contentChanged(noteID: UUID, document: JSONValue)
    case openLink(URL)
    case newNote
    case openNote(UUID)
    case deleteNote(UUID)
    case restoreNote(UUID)
    case purgeNote(UUID)
    case setPinned(UUID, Bool)
    case requestNotes
    case copyText(String)
    /// Rich text for the pasteboard, with a plain-text fallback.
    case copyRichText(html: String, text: String)
    case pasteRichText(noteID: UUID)
    case exportNote(ExportFormat, String)
    /// The height the web content would like, in points.
    case preferredHeight(Double)
    case hide

    public enum ValidationError: Error, Equatable {
        case unrecognizedPayload
        case missingType
        case unknownType(String)
        case missingDocument
        case invalidURL
        case invalidNoteID
        case invalidField(String)
    }

    /// Decodes and validates a raw WKScriptMessage body. Any payload that
    /// does not match the known protocol is rejected rather than guessed at.
    public static func decode(fromScriptMessageBody body: Any) throws -> InboundBridgeMessage {
        guard JSONSerialization.isValidJSONObject(body) else {
            throw ValidationError.unrecognizedPayload
        }
        let data = try JSONSerialization.data(withJSONObject: body)
        let value = try JSONDecoder().decode(JSONValue.self, from: data)
        guard let object = value.objectValue else {
            throw ValidationError.unrecognizedPayload
        }
        guard let type = object["type"]?.stringValue else {
            throw ValidationError.missingType
        }

        func noteID(_ key: String = "id") throws -> UUID {
            guard let raw = object[key]?.stringValue, let id = UUID(uuidString: raw) else {
                throw ValidationError.invalidNoteID
            }
            return id
        }
        func string(_ key: String) throws -> String {
            guard let value = object[key]?.stringValue else { throw ValidationError.invalidField(key) }
            return value
        }

        switch type {
        case "ready":
            return .ready
        case "contentChanged":
            let id = try noteID("noteId")
            guard let document = object["document"] else {
                throw ValidationError.missingDocument
            }
            return .contentChanged(noteID: id, document: document)
        case "openLink":
            guard
                let urlString = object["url"]?.stringValue,
                let url = URL(string: urlString),
                let scheme = url.scheme,
                ["http", "https"].contains(scheme.lowercased())
            else {
                throw ValidationError.invalidURL
            }
            return .openLink(url)
        case "newNote":
            return .newNote
        case "openNote":
            return .openNote(try noteID())
        case "deleteNote":
            return .deleteNote(try noteID())
        case "restoreNote":
            return .restoreNote(try noteID())
        case "purgeNote":
            return .purgeNote(try noteID())
        case "setPinned":
            guard let pinned = object["pinned"]?.boolValue else { throw ValidationError.invalidField("pinned") }
            return .setPinned(try noteID(), pinned)
        case "requestNotes":
            return .requestNotes
        case "copyText":
            return .copyText(try string("text"))
        case "copyRichText":
            return .copyRichText(html: try string("html"), text: try string("text"))
        case "pasteRichText":
            return .pasteRichText(noteID: try noteID("noteId"))
        case "exportNote":
            guard let format = ExportFormat(rawValue: try string("format")) else {
                throw ValidationError.invalidField("format")
            }
            return .exportNote(format, try string("text"))
        case "preferredHeight":
            guard let height = object["height"]?.numberValue, height.isFinite, height >= 0 else {
                throw ValidationError.invalidField("height")
            }
            return .preferredHeight(height)
        case "hide":
            return .hide
        default:
            throw ValidationError.unknownType(type)
        }
    }
}

/// Payloads native code sends into the editor.
public enum OutboundBridgePayload {
    /// `{ id, document }` for `window.jot.loadNote`.
    public static func note(_ opened: OpenedNote) -> JSONValue {
        .object([
            "id": .string(opened.summary.id.uuidString),
            "document": opened.document.json
        ])
    }

    /// `{ currentId, notes: [...] }` for `window.jot.setNotes`. Dates are
    /// milliseconds since 1970 so JavaScript can use them directly.
    public static func notes(_ snapshot: NotesSnapshot) -> JSONValue {
        func millis(_ date: Date) -> JSONValue { .number((date.timeIntervalSince1970 * 1000).rounded()) }
        return .object([
            "currentId": snapshot.currentID.map { .string($0.uuidString) } ?? .null,
            "notes": .array(snapshot.notes.map { note in
                .object([
                    "id": .string(note.id.uuidString),
                    "title": .string(note.title),
                    "searchText": .string(note.searchText),
                    "pinned": .bool(note.isPinned),
                    "openedAt": millis(note.openedAt),
                    "deletedAt": note.deletedAt.map(millis) ?? .null
                ])
            })
        ])
    }
}
