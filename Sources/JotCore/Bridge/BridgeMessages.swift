import Foundation

/// Messages sent from the embedded editor (web layer) to native Swift code.
/// This must be kept in sync with `editor/src/protocol.ts`'s
/// `OutboundMessage` union — it is intentionally the only vocabulary the web
/// layer is allowed to use.
public enum InboundBridgeMessage: Equatable, Sendable {
    case ready
    case contentChanged(JSONValue)
    case openLink(URL)

    public enum ValidationError: Error, Equatable {
        case unrecognizedPayload
        case missingType
        case unknownType(String)
        case missingDocument
        case invalidURL
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
        switch type {
        case "ready":
            return .ready
        case "contentChanged":
            guard let document = object["document"] else {
                throw ValidationError.missingDocument
            }
            return .contentChanged(document)
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
        default:
            throw ValidationError.unknownType(type)
        }
    }
}
