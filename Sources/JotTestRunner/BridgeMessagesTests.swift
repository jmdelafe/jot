import Testing
import Foundation
@testable import JotCore

@Suite("InboundBridgeMessage")
struct BridgeMessagesTests {
    @Test("decodes a ready message")
    func decodesReady() throws {
        let message = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "ready"])
        #expect(message == .ready)
    }

    @Test("decodes a contentChanged message carrying the document")
    func decodesContentChanged() throws {
        let body: [String: Any] = [
            "type": "contentChanged",
            "document": ["type": "doc", "content": [] as [Any]]
        ]
        let message = try InboundBridgeMessage.decode(fromScriptMessageBody: body)
        guard case .contentChanged(let json) = message else {
            Issue.record("expected contentChanged")
            return
        }
        #expect(json.objectValue?["type"]?.stringValue == "doc")
    }

    @Test("decodes an openLink message with an http(s) URL", arguments: [
        "https://example.com/path", "http://example.com"
    ])
    func decodesOpenLink(urlString: String) throws {
        let message = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "openLink", "url": urlString])
        #expect(message == .openLink(URL(string: urlString)!))
    }

    @Test("rejects openLink with a non-http(s) scheme", arguments: [
        "file:///etc/passwd", "javascript:alert(1)", "ftp://example.com", "not a url"
    ])
    func rejectsUnsafeOpenLinkScheme(urlString: String) {
        #expect(throws: InboundBridgeMessage.ValidationError.invalidURL) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "openLink", "url": urlString])
        }
    }

    @Test("rejects a body that isn't valid JSON at all")
    func rejectsNonJSONBody() {
        #expect(throws: InboundBridgeMessage.ValidationError.unrecognizedPayload) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: NSObject())
        }
    }

    @Test("rejects a JSON body whose root isn't an object")
    func rejectsNonObjectBody() {
        #expect(throws: InboundBridgeMessage.ValidationError.unrecognizedPayload) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: [1, 2, 3])
        }
    }

    @Test("rejects a body missing a type field")
    func rejectsMissingType() {
        #expect(throws: InboundBridgeMessage.ValidationError.missingType) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: ["foo": "bar"])
        }
    }

    @Test("rejects an unknown message type")
    func rejectsUnknownType() {
        #expect(throws: InboundBridgeMessage.ValidationError.unknownType("bogus")) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "bogus"])
        }
    }

    @Test("rejects contentChanged missing its document field")
    func rejectsContentChangedMissingDocument() {
        #expect(throws: InboundBridgeMessage.ValidationError.missingDocument) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "contentChanged"])
        }
    }
}
