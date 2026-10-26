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
        let id = UUID()
        let body: [String: Any] = [
            "type": "contentChanged",
            "noteId": id.uuidString,
            "document": ["type": "doc", "content": [] as [Any]]
        ]
        let message = try InboundBridgeMessage.decode(fromScriptMessageBody: body)
        guard case .contentChanged(let noteID, let json) = message else {
            Issue.record("expected contentChanged")
            return
        }
        #expect(noteID == id)
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
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: [
                "type": "contentChanged", "noteId": UUID().uuidString
            ])
        }
    }

    @Test("rejects contentChanged without a valid note id")
    func rejectsContentChangedWithoutNoteID() {
        #expect(throws: InboundBridgeMessage.ValidationError.invalidNoteID) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: [
                "type": "contentChanged", "noteId": "nope", "document": ["type": "doc"]
            ])
        }
    }

    @Test("decodes note library commands")
    func decodesLibraryCommands() throws {
        let id = UUID()
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "newNote"]) == .newNote)
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "openNote", "id": id.uuidString]) == .openNote(id))
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "deleteNote", "id": id.uuidString]) == .deleteNote(id))
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "restoreNote", "id": id.uuidString]) == .restoreNote(id))
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "purgeNote", "id": id.uuidString]) == .purgeNote(id))
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "setPinned", "id": id.uuidString, "pinned": true]) == .setPinned(id, true))
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "requestNotes"]) == .requestNotes)
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "hide"]) == .hide)
    }

    @Test("decodes copy, export and sizing messages")
    func decodesUtilityMessages() throws {
        let id = UUID()
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "copyText", "text": "hi"]) == .copyText("hi"))
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "copyRichText", "html": "<p>hi</p>", "text": "hi"]) == .copyRichText(html: "<p>hi</p>", text: "hi"))
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "pasteRichText", "noteId": id.uuidString]) == .pasteRichText(noteID: id))
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "exportNote", "format": "html", "text": "<p>x</p>"]) == .exportNote(.html, "<p>x</p>"))
        #expect(try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "preferredHeight", "height": 240]) == .preferredHeight(240))
    }

    @Test("rejects malformed library and utility messages")
    func rejectsMalformedCommands() {
        #expect(throws: InboundBridgeMessage.ValidationError.invalidNoteID) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "pasteRichText"])
        }
        #expect(throws: InboundBridgeMessage.ValidationError.invalidNoteID) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "pasteRichText", "noteId": "invalid"])
        }
        #expect(throws: InboundBridgeMessage.ValidationError.invalidNoteID) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "openNote"])
        }
        #expect(throws: InboundBridgeMessage.ValidationError.invalidField("pinned")) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "setPinned", "id": UUID().uuidString])
        }
        #expect(throws: InboundBridgeMessage.ValidationError.invalidField("format")) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "exportNote", "format": "pdf", "text": ""])
        }
        #expect(throws: InboundBridgeMessage.ValidationError.invalidField("text")) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "copyRichText", "html": "<p>hi</p>"])
        }
        #expect(throws: InboundBridgeMessage.ValidationError.invalidField("height")) {
            _ = try InboundBridgeMessage.decode(fromScriptMessageBody: ["type": "preferredHeight", "height": -1])
        }
    }
}
