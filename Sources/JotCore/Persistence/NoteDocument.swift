import Foundation

/// The single persisted note. Wraps the canonical TipTap JSON document
/// (not Markdown) so every supported structure round-trips losslessly.
public struct NoteDocument: Equatable, Sendable {
    public var json: JSONValue

    /// A shallow structural check — this is not a full TipTap schema
    /// validator, but it rejects obviously-wrong payloads (wrong shape,
    /// wrong root type) before they are ever persisted or handed back to
    /// the editor.
    public static func validate(_ json: JSONValue) -> Bool {
        guard let object = json.objectValue else { return false }
        guard object["type"]?.stringValue == "doc" else { return false }
        if let content = object["content"] {
            if case .array = content {
                return true
            }
            return false
        }
        return true
    }

    public static let empty = NoteDocument(
        json: .object([
            "type": .string("doc"),
            "content": .array([.object(["type": .string("paragraph")])])
        ])
    )

    public init(json: JSONValue) {
        self.json = json
    }

    /// Fails if `json` is not a valid, well-shaped TipTap document.
    public init?(validating json: JSONValue) {
        guard NoteDocument.validate(json) else { return nil }
        self.json = json
    }

    public func serialized() throws -> Data {
        try JSONEncoder().encode(json)
    }

    public static func deserialize(_ data: Data) throws -> NoteDocument {
        let value = try JSONDecoder().decode(JSONValue.self, from: data)
        guard let document = NoteDocument(validating: value) else {
            throw NoteStoreError.invalidDocumentShape
        }
        return document
    }
}
