import Testing
import Foundation
@testable import JotCore

@Suite("NoteDocument")
struct NoteDocumentTests {
    @Test("empty document is a valid doc with a single empty paragraph")
    func emptyDocumentShape() {
        #expect(NoteDocument.validate(NoteDocument.empty.json))
        let object = NoteDocument.empty.json.objectValue
        #expect(object?["type"]?.stringValue == "doc")
    }

    @Test("validates any object with type doc and no content")
    func validatesMinimalDoc() {
        let json: JSONValue = .object(["type": .string("doc")])
        #expect(NoteDocument.validate(json))
    }

    @Test("validates a doc whose content is an array")
    func validatesDocWithArrayContent() {
        let json: JSONValue = .object(["type": .string("doc"), "content": .array([])])
        #expect(NoteDocument.validate(json))
    }

    @Test("rejects a doc whose content is not an array",
          arguments: [
            JSONValue.object(["type": .string("doc"), "content": .string("nope")]),
            JSONValue.object(["type": .string("doc"), "content": .null]),
            JSONValue.object(["type": .string("doc"), "content": .object([:])])
          ])
    func rejectsNonArrayContent(json: JSONValue) {
        #expect(!NoteDocument.validate(json))
    }

    @Test("rejects a non-object root", arguments: [
        JSONValue.array([]), JSONValue.string("doc"), JSONValue.null, JSONValue.number(1)
    ])
    func rejectsNonObjectRoot(json: JSONValue) {
        #expect(!NoteDocument.validate(json))
    }

    @Test("rejects an object missing or mismatching the doc type")
    func rejectsWrongType() {
        #expect(!NoteDocument.validate(.object(["type": .string("paragraph")])))
        #expect(!NoteDocument.validate(.object([:])))
    }

    @Test("serialize/deserialize round-trips a document losslessly")
    func serializationRoundTrip() throws {
        let document = NoteDocument(json: .object([
            "type": .string("doc"),
            "content": .array([
                .object(["type": .string("heading"), "attrs": .object(["level": .number(2)])])
            ])
        ]))
        let data = try document.serialized()
        let restored = try NoteDocument.deserialize(data)
        #expect(restored == document)
    }

    @Test("deserialize throws invalidDocumentShape for well-formed JSON that isn't a doc")
    func deserializeRejectsInvalidShape() {
        let data = Data(#"{"type":"paragraph"}"#.utf8)
        #expect(throws: NoteStoreError.invalidDocumentShape) {
            _ = try NoteDocument.deserialize(data)
        }
    }

    @Test("deserialize throws a decoding error for malformed JSON")
    func deserializeRejectsMalformedJSON() {
        let data = Data("{not json".utf8)
        #expect(throws: (any Error).self) {
            _ = try NoteDocument.deserialize(data)
        }
    }

    @Test("init(validating:) fails for invalid shapes and succeeds for valid ones")
    func validatingInitializer() {
        #expect(NoteDocument(validating: .object(["type": .string("doc")])) != nil)
        #expect(NoteDocument(validating: .object(["type": .string("paragraph")])) == nil)
    }
}
