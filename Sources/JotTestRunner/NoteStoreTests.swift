import Testing
import Foundation
@testable import JotCore

@Suite("NoteStore")
struct NoteStoreTests {
    private func makeTemporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("JotTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test("load returns nil when no note has ever been saved")
    func loadReturnsNilOnFirstRun() async throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = NoteStore(directoryURL: directory)
        let loaded = try await store.load()
        #expect(loaded == nil)
    }

    @Test("save writes the document and load reads back an equal document")
    func saveThenLoadRoundTrips() async throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = NoteStore(directoryURL: directory)
        let document = NoteDocument(json: .object([
            "type": .string("doc"),
            "content": .array([.object(["type": .string("paragraph")])])
        ]))

        try await store.save(document)
        let loaded = try await store.load()

        #expect(loaded == document)
    }

    @Test("save is atomic: the file on disk is always a complete, parseable document")
    func saveWritesCompleteFile() async throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = NoteStore(directoryURL: directory)
        try await store.save(.empty)

        let data = try Data(contentsOf: directory.appendingPathComponent("note.json"))
        _ = try NoteDocument.deserialize(data) // Does not throw.
    }

    @Test("load throws corrupted and preserves the original file when the stored JSON is invalid")
    func loadThrowsOnCorruptFile() async throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let noteURL = directory.appendingPathComponent("note.json")
        try Data("{ this is not valid json".utf8).write(to: noteURL)

        let store = NoteStore(directoryURL: directory)
        do {
            _ = try await store.load()
            Issue.record("expected NoteStoreError.corrupted to be thrown")
        } catch NoteStoreError.corrupted(let preservedURL) {
            #expect(FileManager.default.fileExists(atPath: preservedURL.path))
            #expect(!FileManager.default.fileExists(atPath: noteURL.path))
            let preservedContents = try Data(contentsOf: preservedURL)
            #expect(String(data: preservedContents, encoding: .utf8) == "{ this is not valid json")
        }
    }

    @Test("load throws corrupted when the stored JSON is well-formed but not a valid document")
    func loadThrowsOnWrongShape() async throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let noteURL = directory.appendingPathComponent("note.json")
        try Data(#"{"type":"paragraph"}"#.utf8).write(to: noteURL)

        let store = NoteStore(directoryURL: directory)
        await #expect(throws: NoteStoreError.self) {
            _ = try await store.load()
        }
    }

    @Test("scheduleDebouncedSave coalesces rapid calls into a single write of the latest document")
    func debouncedSaveCoalesces() async throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = NoteStore(directoryURL: directory)

        let first = NoteDocument(json: .object(["type": .string("doc"), "content": .array([.object(["type": .string("paragraph"), "attrs": .object(["n": .number(1)])])])]))
        let second = NoteDocument(json: .object(["type": .string("doc"), "content": .array([.object(["type": .string("paragraph"), "attrs": .object(["n": .number(2)])])])]))

        await store.scheduleDebouncedSave(first, delay: .milliseconds(400))
        await store.scheduleDebouncedSave(second, delay: .milliseconds(400))

        // Before the debounce fires, nothing should be on disk yet.
        #expect(try await store.load() == nil)

        try await Task.sleep(for: .milliseconds(700))

        let loaded = try await store.load()
        #expect(loaded == second)
    }

    @Test("flushPendingSave immediately writes a scheduled document and cancels the timer")
    func flushPendingSaveWritesImmediately() async throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = NoteStore(directoryURL: directory)
        let document = NoteDocument(json: .object(["type": .string("doc")]))

        await store.scheduleDebouncedSave(document, delay: .seconds(30))
        await store.flushPendingSave()

        let loaded = try await store.load()
        #expect(loaded == document)
    }

    @Test("flushPendingSave is a no-op when nothing is pending")
    func flushPendingSaveNoOpWhenIdle() async throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = NoteStore(directoryURL: directory)
        let flushed = await store.flushPendingSave()
        #expect(flushed == nil)
    }
}
