import Testing
import Foundation
@testable import JotCore

/// A controllable clock so recency ordering and retention are deterministic.
final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current = Date(timeIntervalSince1970: 1_700_000_000)
    var now: Date { lock.withLock { current } }
    func advance(_ seconds: TimeInterval) { lock.withLock { current += seconds } }
}

private final class SaveErrors: @unchecked Sendable {
    private let lock = NSLock()
    private var errors: [String] = []
    var count: Int { lock.withLock { errors.count } }
    func record(_ error: Error) { lock.withLock { errors.append(String(describing: error)) } }
}

private final class FailingPreservationFileManager: FileManager, @unchecked Sendable {
    override func copyItem(at source: URL, to destination: URL) throws {
        throw CocoaError(.fileWriteNoPermission)
    }
}

private final class FailingMigrationFileManager: FileManager, @unchecked Sendable {
    override func moveItem(at source: URL, to destination: URL) throws {
        throw CocoaError(.fileWriteNoPermission)
    }
}

private final class FailingRemovalFileManager: FileManager, @unchecked Sendable {
    override func removeItem(at url: URL) throws {
        throw CocoaError(.fileWriteNoPermission)
    }
}

private func document(_ lines: String...) -> NoteDocument {
    NoteDocument(json: .object([
        "type": .string("doc"),
        "content": .array(lines.map { line in
            .object([
                "type": .string("paragraph"),
                "content": .array([.object(["type": .string("text"), "text": .string(line)])])
            ])
        })
    ]))
}

@Suite("NotesLibrary")
struct NotesLibraryTests {
    private func makeDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("JotTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func makeLibrary(_ directory: URL, clock: TestClock = TestClock()) -> NotesLibrary {
        NotesLibrary(directoryURL: directory, now: { clock.now })
    }

    private func withBlockedWrite(to url: URL, _ operation: () async throws -> Void) async throws {
        let manager = FileManager.default
        let backup = url.appendingPathExtension("test-backup")
        let existed = manager.fileExists(atPath: url.path)
        if existed { try manager.moveItem(at: url, to: backup) }
        defer {
            do {
                if manager.fileExists(atPath: url.path) { try manager.removeItem(at: url) }
                if existed { try manager.moveItem(at: backup, to: url) }
            } catch {
                Issue.record(error)
            }
        }
        try manager.createDirectory(at: url, withIntermediateDirectories: false)
        try await operation()
    }

    @Test("first run opens a single empty untitled note")
    func firstRun() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let opened = try await makeLibrary(directory).bootstrap()
        #expect(opened.document == .empty)
        #expect(opened.summary.title == NoteSummary.untitled)
        #expect(await makeLibrary(directory).snapshot().notes.isEmpty)
    }

    @Test("edits persist and the title comes from the first non-empty line")
    func editsPersist() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let opened = try await library.bootstrap()
        let summary = await library.updateCurrent(document("  ", "Groceries", "milk"), noteID: opened.summary.id)
        #expect(summary?.title == "Groceries")
        try await library.flush()

        let reopened = try await makeLibrary(directory).bootstrap()
        #expect(reopened.summary.id == opened.summary.id)
        #expect(reopened.document == document("  ", "Groceries", "milk"))
        #expect(reopened.summary.searchText == "Groceries\nmilk")
    }

    @Test("edits addressed to a note that is no longer current are ignored")
    func staleEditsIgnored() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let first = try await library.bootstrap()
        await library.updateCurrent(document("First"), noteID: first.summary.id)
        let second = try await library.createNote()
        #expect(await library.updateCurrent(document("Late"), noteID: first.summary.id) == nil)
        try await library.flush()
        let reopened = try await library.open(first.summary.id)
        #expect(reopened.document == document("First"))
        #expect(second.summary.id != first.summary.id)
    }

    @Test("debounced edits coalesce into a single write")
    func debouncedSave() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let opened = try await library.bootstrap()
        await library.updateCurrent(document("a"), noteID: opened.summary.id, debounce: .milliseconds(100))
        await library.updateCurrent(document("ab"), noteID: opened.summary.id, debounce: .milliseconds(100))
        let file = directory.appendingPathComponent("Notes/\(opened.summary.id.uuidString).json")
        #expect(!FileManager.default.fileExists(atPath: file.path))
        try await Task.sleep(for: .milliseconds(400))
        #expect(try NoteDocument.deserialize(Data(contentsOf: file)) == document("ab"))
    }

    @Test("creating a note while the current one is empty reuses it")
    func newNoteReusesEmpty() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let opened = try await library.bootstrap()
        let created = try await library.createNote()
        #expect(created.summary.id == opened.summary.id)
    }

    @Test("switching away from an empty note discards it")
    func emptyNotesDiscarded() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let clock = TestClock()
        let library = makeLibrary(directory, clock: clock)
        let first = try await library.bootstrap()
        await library.updateCurrent(document("Keep"), noteID: first.summary.id)
        clock.advance(1)
        let blank = try await library.createNote()
        clock.advance(1)
        _ = try await library.open(first.summary.id)
        let ids = await library.snapshot().notes.map(\.id)
        #expect(ids == [first.summary.id])
        #expect(!ids.contains(blank.summary.id))
    }

    @Test("snapshot lists pinned first, then most recently opened, then deleted")
    func snapshotOrdering() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let clock = TestClock()
        let library = makeLibrary(directory, clock: clock)
        let a = try await library.bootstrap()
        await library.updateCurrent(document("A"), noteID: a.summary.id)
        clock.advance(1)
        let b = try await library.createNote()
        await library.updateCurrent(document("B"), noteID: b.summary.id)
        clock.advance(1)
        let c = try await library.createNote()
        await library.updateCurrent(document("C"), noteID: c.summary.id)
        clock.advance(1)
        try await library.setPinned(a.summary.id, true)
        try await library.delete(b.summary.id)

        let snapshot = await library.snapshot()
        #expect(snapshot.currentID == c.summary.id)
        #expect(snapshot.notes.map(\.title) == ["A", "C", "B"])
        #expect(snapshot.notes.last?.isDeleted == true)
    }

    @Test("deleting the current note opens the next one; restore brings it back")
    func deleteAndRestore() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let clock = TestClock()
        let library = makeLibrary(directory, clock: clock)
        let a = try await library.bootstrap()
        await library.updateCurrent(document("A"), noteID: a.summary.id)
        clock.advance(1)
        let b = try await library.createNote()
        await library.updateCurrent(document("B"), noteID: b.summary.id)

        let replacement = try await library.delete(b.summary.id)
        #expect(replacement?.summary.id == a.summary.id)
        #expect(replacement?.document == document("A"))

        let restored = try await library.restore(b.summary.id)
        #expect(restored.document == document("B"))
        #expect(await library.snapshot().notes.allSatisfy { !$0.isDeleted })
    }

    @Test("deleting the only note starts a fresh one")
    func deleteOnlyNote() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let a = try await library.bootstrap()
        await library.updateCurrent(document("A"), noteID: a.summary.id)
        let replacement = try await library.delete(a.summary.id)
        #expect(replacement?.summary.id != a.summary.id)
        #expect(replacement?.document == .empty)
    }

    @Test("notes deleted more than 60 days ago are purged on launch")
    func retention() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let clock = TestClock()
        let library = makeLibrary(directory, clock: clock)
        let a = try await library.bootstrap()
        await library.updateCurrent(document("Old"), noteID: a.summary.id)
        try await library.delete(a.summary.id)
        try await library.flush()

        clock.advance(59 * 86_400)
        #expect(try await makeLibrary(directory, clock: clock).bootstrapThenSnapshot().contains { $0.id == a.summary.id })
        clock.advance(2 * 86_400)
        #expect(try await !makeLibrary(directory, clock: clock).bootstrapThenSnapshot().contains { $0.id == a.summary.id })
        #expect(!FileManager.default.fileExists(atPath: directory.appendingPathComponent("Notes/\(a.summary.id.uuidString).json").path))
    }

    @Test("the single-note file from earlier versions is migrated and backed up")
    func legacyMigration() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try document("Legacy", "body").serialized().write(to: directory.appendingPathComponent("note.json"))
        let opened = try await makeLibrary(directory).bootstrap()
        #expect(opened.summary.title == "Legacy")
        #expect(opened.document == document("Legacy", "body"))
        #expect(!FileManager.default.fileExists(atPath: directory.appendingPathComponent("note.json").path))
        #expect(FileManager.default.fileExists(atPath: directory.appendingPathComponent("note.migrated.json").path))
    }

    @Test("a corrupt legacy note is preserved and reported")
    func corruptLegacy() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try Data("{ nope".utf8).write(to: directory.appendingPathComponent("note.json"))
        let opened = try await makeLibrary(directory).bootstrap()
        let preserved = try #require(opened.preservedCorruptURL)
        #expect(String(data: try Data(contentsOf: preserved), encoding: .utf8) == "{ nope")
        #expect(opened.document == .empty)
    }

    @Test("a corrupt index is rebuilt from the note files")
    func corruptIndexRebuilt() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let a = try await library.bootstrap()
        await library.updateCurrent(document("Survivor"), noteID: a.summary.id)
        try await library.flush()
        try Data("garbage".utf8).write(to: directory.appendingPathComponent("Notes/index.json"))

        let reopened = try await makeLibrary(directory).bootstrap()
        #expect(reopened.preservedCorruptURL != nil)
        #expect(reopened.summary.id == a.summary.id)
        #expect(reopened.document == document("Survivor"))
    }

    @Test("a corrupt note file opens empty and is preserved")
    func corruptNoteFile() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let a = try await library.bootstrap()
        await library.updateCurrent(document("X"), noteID: a.summary.id)
        try await library.flush()
        try Data("bad".utf8).write(to: directory.appendingPathComponent("Notes/\(a.summary.id.uuidString).json"))

        let reopened = try await makeLibrary(directory).bootstrap()
        #expect(reopened.document == .empty)
        #expect(reopened.preservedCorruptURL != nil)
    }

    @Test("failed document writes remain pending and retry without another edit")
    func failedSaveRetries() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let opened = try await library.bootstrap()
        await library.updateCurrent(document("Saved"), noteID: opened.summary.id)
        try await library.flush()
        await library.updateCurrent(document("Latest"), noteID: opened.summary.id, debounce: .seconds(60))

        let url = directory.appendingPathComponent("Notes/\(opened.summary.id.uuidString).json")
        try await withBlockedWrite(to: url) {
            await #expect(throws: (any Error).self) { try await library.flush() }
            let current = try await library.open(opened.summary.id)
            #expect(current.document == document("Latest"))
        }
        try await library.flush()
        #expect(try await makeLibrary(directory).bootstrap().document == document("Latest"))
    }

    @Test("debounced save errors are reported and the edits can still be saved")
    func debouncedSaveFailure() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let errors = SaveErrors()
        let library = NotesLibrary(directoryURL: directory, onSaveError: { errors.record($0) })
        let opened = try await library.bootstrap()
        let url = directory.appendingPathComponent("Notes/\(opened.summary.id.uuidString).json")
        try await withBlockedWrite(to: url) {
            await library.updateCurrent(document("Keep me"), noteID: opened.summary.id, debounce: .milliseconds(50))
            try await Task.sleep(for: .milliseconds(400))
            #expect(errors.count == 1)
        }
        try await library.flush()
        #expect(try await makeLibrary(directory).bootstrap().document == document("Keep me"))
    }

    @Test("unsaved edits prevent opening, creating or deleting the current note")
    func failedSaveBlocksTransitions() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let first = try await library.bootstrap()
        await library.updateCurrent(document("First"), noteID: first.summary.id)
        let second = try await library.createNote()
        await library.updateCurrent(document("Unsaved"), noteID: second.summary.id, debounce: .seconds(60))

        let url = directory.appendingPathComponent("Notes/\(second.summary.id.uuidString).json")
        try await withBlockedWrite(to: url) {
            await #expect(throws: (any Error).self) { try await library.open(first.summary.id) }
            await #expect(throws: (any Error).self) { try await library.createNote() }
            await #expect(throws: (any Error).self) { try await library.delete(second.summary.id) }
            #expect(await library.snapshot().currentID == second.summary.id)
            let current = try await library.open(second.summary.id)
            #expect(current.document == document("Unsaved"))
        }
        try await library.flush()
        #expect(try await makeLibrary(directory).bootstrap().document == document("Unsaved"))
    }

    @Test("failed index commits leave the editor's note and library metadata unchanged")
    func failedIndexRollsBackTransitions() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let clock = TestClock()
        let library = makeLibrary(directory, clock: clock)
        let first = try await library.bootstrap()
        await library.updateCurrent(document("First"), noteID: first.summary.id)
        clock.advance(1)
        let second = try await library.createNote()
        await library.updateCurrent(document("Second"), noteID: second.summary.id)
        let deleted = try await library.createNote()
        await library.updateCurrent(document("Deleted"), noteID: deleted.summary.id)
        try await library.delete(deleted.summary.id)
        let before = await library.snapshot()

        try await withBlockedWrite(to: directory.appendingPathComponent("Notes/index.json")) {
            await #expect(throws: (any Error).self) { try await library.open(first.summary.id) }
            #expect(await library.snapshot() == before)
            await #expect(throws: (any Error).self) { try await library.createNote() }
            #expect(await library.snapshot() == before)
            await #expect(throws: (any Error).self) { try await library.delete(second.summary.id) }
            #expect(await library.snapshot() == before)
            await #expect(throws: (any Error).self) { try await library.restore(deleted.summary.id) }
            #expect(await library.snapshot() == before)
            await #expect(throws: (any Error).self) { try await library.setPinned(first.summary.id, true) }
            #expect(await library.snapshot() == before)
        }
        #expect(try await library.open(first.summary.id).document == document("First"))
    }

    @Test("an index write failure is retried even after the document was saved")
    func failedIndexSaveRetries() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let opened = try await library.bootstrap()
        await library.updateCurrent(document("Updated title"), noteID: opened.summary.id, debounce: .seconds(60))
        try await withBlockedWrite(to: directory.appendingPathComponent("Notes/index.json")) {
            await #expect(throws: (any Error).self) { try await library.flush() }
        }
        try await library.flush()
        let reopened = try await makeLibrary(directory).bootstrap()
        #expect(reopened.summary.title == "Updated title")
        #expect(reopened.document == document("Updated title"))
    }

    @Test("a missing note file is reported instead of opening empty")
    func missingNoteFile() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let first = try await library.bootstrap()
        await library.updateCurrent(document("First"), noteID: first.summary.id)
        let blank = try await library.createNote()
        let url = directory.appendingPathComponent("Notes/\(first.summary.id.uuidString).json")
        try FileManager.default.removeItem(at: url)
        await #expect(throws: (any Error).self) { try await library.open(first.summary.id) }
        #expect(await library.snapshot().currentID == blank.summary.id)
        try document("First").serialized().write(to: url)
        #expect(try await library.open(first.summary.id).document == document("First"))
    }

    @Test("corrupt data is not replaced when its backup cannot be created")
    func preservationFailure() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let first = try await library.bootstrap()
        await library.updateCurrent(document("First"), noteID: first.summary.id)
        try await library.flush()
        let url = directory.appendingPathComponent("Notes/\(first.summary.id.uuidString).json")
        let corrupt = Data("corrupt but irreplaceable".utf8)
        try corrupt.write(to: url)
        let failing = NotesLibrary(directoryURL: directory, fileManager: FailingPreservationFileManager())
        await #expect(throws: (any Error).self) { try await failing.bootstrap() }
        #expect(await failing.snapshot().notes.isEmpty)
        #expect(await failing.snapshot().currentID == nil)
        #expect(try Data(contentsOf: url) == corrupt)
    }

    @Test("a failed permanent deletion leaves the note listed and on disk")
    func permanentDeletionFailure() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = NotesLibrary(directoryURL: directory, fileManager: FailingRemovalFileManager())
        let first = try await library.bootstrap()
        await library.updateCurrent(document("Deleted"), noteID: first.summary.id)
        try await library.delete(first.summary.id)
        await #expect(throws: (any Error).self) { try await library.purge(first.summary.id) }
        #expect(await library.snapshot().notes.contains { $0.id == first.summary.id && $0.isDeleted })
        let url = directory.appendingPathComponent("Notes/\(first.summary.id.uuidString).json")
        #expect(try NoteDocument.deserialize(Data(contentsOf: url)) == document("Deleted"))
    }

    @Test("repeated corruption recovery preserves distinct backups")
    func distinctCorruptBackups() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let first = try await library.bootstrap()
        await library.updateCurrent(document("First"), noteID: first.summary.id)
        try await library.flush()
        let url = directory.appendingPathComponent("Notes/\(first.summary.id.uuidString).json")
        let corrupt = Data("corrupt original".utf8)
        try corrupt.write(to: url)
        let firstRecovery = try await makeLibrary(directory).bootstrap()
        let secondRecovery = try await makeLibrary(directory).bootstrap()
        let firstBackup = try #require(firstRecovery.preservedCorruptURL)
        let secondBackup = try #require(secondRecovery.preservedCorruptURL)
        #expect(firstBackup != secondBackup)
        #expect(try Data(contentsOf: firstBackup) == corrupt)
        #expect(try Data(contentsOf: secondBackup) == corrupt)
    }

    @Test("migration commits the imported note before moving the legacy file")
    func migrationBackupFailure() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let legacy = directory.appendingPathComponent("note.json")
        try document("Legacy").serialized().write(to: legacy)
        let failing = NotesLibrary(directoryURL: directory, fileManager: FailingMigrationFileManager())
        await #expect(throws: (any Error).self) { try await failing.bootstrap() }
        #expect(try NoteDocument.deserialize(Data(contentsOf: legacy)) == document("Legacy"))
        #expect(try await makeLibrary(directory).bootstrap().document == document("Legacy"))
    }

    @Test("an unavailable notes directory is reported during startup")
    func unavailableNotesDirectory() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try Data("not a directory".utf8).write(to: directory.appendingPathComponent("Notes"))
        await #expect(throws: (any Error).self) { try await makeLibrary(directory).bootstrap() }
    }

    @Test("a missing index is rebuilt without abandoning existing note files")
    func missingIndexRebuilt() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let first = try await library.bootstrap()
        await library.updateCurrent(document("Survivor"), noteID: first.summary.id)
        try await library.flush()
        try FileManager.default.removeItem(at: directory.appendingPathComponent("Notes/index.json"))
        let reopened = try await makeLibrary(directory).bootstrap()
        #expect(reopened.summary.id == first.summary.id)
        #expect(reopened.document == document("Survivor"))
    }

    @Test("plain text extraction joins blocks and ignores empty ones")
    func plainText() {
        let doc = NoteDocument(json: .object([
            "type": .string("doc"),
            "content": .array([
                .object(["type": .string("heading"), "content": .array([.object(["type": .string("text"), "text": .string("Title")])])]),
                .object(["type": .string("paragraph")]),
                .object(["type": .string("bulletList"), "content": .array([
                    .object(["type": .string("listItem"), "content": .array([
                        .object(["type": .string("paragraph"), "content": .array([
                            .object(["type": .string("text"), "text": .string("one ")]),
                            .object(["type": .string("text"), "text": .string("bold"), "marks": .array([.object(["type": .string("bold")])])])
                        ])])
                    ])])
                ])])
            ])
        ]))
        #expect(doc.plainText == "Title\none bold")
        #expect(NoteDocument.empty.plainText.isEmpty)
    }

    @Test("notes payload carries ids, titles and millisecond dates")
    func notesPayload() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = makeLibrary(directory)
        let a = try await library.bootstrap()
        await library.updateCurrent(document("Hello"), noteID: a.summary.id)
        let payload = OutboundBridgePayload.notes(await library.snapshot())
        let object = try #require(payload.objectValue)
        #expect(object["currentId"]?.stringValue == a.summary.id.uuidString)
        guard case .array(let notes)? = object["notes"], let first = notes.first?.objectValue else {
            Issue.record("expected notes array")
            return
        }
        #expect(first["title"]?.stringValue == "Hello")
        #expect(first["openedAt"]?.numberValue == 1_700_000_000_000)
        #expect(first["deletedAt"] == .null)
        #expect(first["updatedAt"] == nil)
    }
}

extension NotesLibrary {
    fileprivate func bootstrapThenSnapshot() throws -> [NoteSummary] {
        _ = try bootstrap()
        return snapshot().notes
    }
}
