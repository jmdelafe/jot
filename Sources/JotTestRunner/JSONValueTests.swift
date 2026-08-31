import Testing
import Foundation
@testable import JotCore


@Suite("JSONValue")
struct JSONValueTests {
    @Test("round-trips a representative document through encode/decode")
    func roundTripsThroughCoding() throws {
        let value: JSONValue = .object([
            "type": .string("doc"),
            "content": .array([
                .object([
                    "type": .string("paragraph"),
                    "content": .array([.object(["type": .string("text"), "text": .string("hi")])])
                ]),
                .null,
                .object(["flag": .bool(true), "count": .number(3)])
            ])
        ])

        let data = try JSONEncoder().encode(value)
        let decoded = try JSONDecoder().decode(JSONValue.self, from: data)

        #expect(decoded == value)
    }

    @Test("objectValue only unwraps object-shaped values")
    func objectValueAccessor() {
        #expect(JSONValue.object(["a": .string("b")]).objectValue == ["a": .string("b")])
        #expect(JSONValue.array([]).objectValue == nil)
        #expect(JSONValue.string("x").objectValue == nil)
    }

    @Test("stringValue only unwraps string-shaped values")
    func stringValueAccessor() {
        #expect(JSONValue.string("hello").stringValue == "hello")
        #expect(JSONValue.number(1).stringValue == nil)
    }

    @Test("decoding rejects nothing that JSONSerialization itself considers valid JSON",
          arguments: [
            Data("null".utf8),
            Data("true".utf8),
            Data("false".utf8),
            Data("1.5".utf8),
            Data("\"str\"".utf8),
            Data("[]".utf8),
            Data("{}".utf8)
          ])
    func decodesAllJSONPrimitiveShapes(data: Data) throws {
        _ = try JSONDecoder().decode(JSONValue.self, from: data)
    }
}
