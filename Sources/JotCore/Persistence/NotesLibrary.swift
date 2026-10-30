import Foundation

public enum NoteStoreError: Error, Equatable {
    case invalidDocumentShape
    /// The stored file exists but is unreadable/corrupt. The original file
    /// is preserved at `preservedURL` rather than being overwritten so
    /// nothing is silently destroyed.
    case corrupted(preservedURL: URL)
    case noteNotFound
}

/// A note that has just become the current note, ready to hand to the editor.
public struct OpenedNote: Equatable, Sendable {
    public let summary: NoteSummary
    public let document: NoteDocument
    /// Set when the note's file was unreadable and Jot opened it empty; the
    /// original bytes were preserved at this URL.
    public let preservedCorruptURL: URL?
}

/// The full browsable state of the library, as shown in the note browser.
public struct NotesSnapshot: Equatable, Sendable {
    public let currentID: UUID?
    /// Active notes (pinned first, then most recently opened) followed by
    /// recently deleted notes (most recently deleted first).
    public let notes: [NoteSummary]
}

/// Owns every note's on-disk representation:
///
///     Jot/Notes/index.json   — small metadata index (titles, dates, pins)
///     Jot/Notes/<uuid>.json  — one TipTap document per note
///
/// Only the current note's body is held in memory. All file I/O happens off
/// the main actor, writes are atomic, and edits are debounced so typing never
/// touches the disk more than a few times per second.
public actor NotesLibrary {
    public static let deletedRetention: TimeInterval = 60 * 24 * 60 * 60

    private struct Index: Codable {
        var version = 1
        var currentID: UUID?
        var notes: [NoteSummary] = []
    }

    private let rootDirectory: URL
    private let notesDirectory: URL
    private let indexURL: URL
    private let fileManager: FileManager
    private let now: @Sendable () -> Date
    private let onSaveError: @Sendable (Error) -> Void

    private var index = Index()
    private var currentDocument: NoteDocument = .empty
    private var documentDirty = false
    private var indexDirty = false
    private var pendingSaveTask: Task<Void, Never>?

    /// - Parameter directoryURL: Defaults to
    ///   `~/Library/Application Support/Jot`. Overridable for tests.
    public init(
        directoryURL: URL? = nil,
        fileManager: FileManager = .default,
        now: @escaping @Sendable () -> Date = { Date() },
        onSaveError: @escaping @Sendable (Error) -> Void = { error in
            NSLog("Jot: could not save notes: \(error)")
        }
    ) {
        self.fileManager = fileManager
        self.now = now
        self.onSaveError = onSaveError
        rootDirectory = directoryURL ?? Self.defaultDirectory(fileManager: fileManager)
        notesDirectory = rootDirectory.appendingPathComponent("Notes", isDirectory: true)
        indexURL = notesDirectory.appendingPathComponent("index.json")
    }

    public static func defaultDirectory(fileManager: FileManager = .default) -> URL {
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent("Jot", isDirectory: true)
    }

    // MARK: - Lifecycle

    /// Loads the index (migrating the single-note `note.json` from earlier
    /// versions on first run), purges notes deleted more than 60 days ago,
    /// and opens the last current note — or a fresh one.
    public func bootstrap() throws -> OpenedNote {
        try fileManager.createDirectory(at: notesDirectory, withIntermediateDirectories: true)
        return try committingChanges {
            var preserved: URL?
            if fileManager.fileExists(atPath: indexURL.path) {
                let data = try Data(contentsOf: indexURL)
                do {
                    index = try JSONDecoder().decode(Index.self, from: data)
                } catch {
                    preserved = try preserve(indexURL, as: "index")
                    index = try rebuildIndexFromNoteFiles()
                    indexDirty = true
                }
            } else {
                index = try rebuildIndexFromNoteFiles()
                if index.notes.isEmpty {
                    preserved = try migrateLegacyNote()
                }
                indexDirty = true
            }
            try purgeExpiredDeletedNotes()

            let candidate = index.currentID.flatMap { id in index.notes.first { $0.id == id && !$0.isDeleted } }
                ?? activeNotesByRecency().first
            let opened: OpenedNote
            if let candidate {
                opened = try activate(candidate.id)
            } else {
                opened = startNewNote()
            }
            guard let preserved else { return opened }
            return OpenedNote(summary: opened.summary, document: opened.document, preservedCorruptURL: preserved)
        }
    }

    // MARK: - Editing

    /// Records new content for the current note and schedules a debounced
    /// save. Returns the refreshed summary (for the window title).
    @discardableResult
    public func updateCurrent(
        _ document: NoteDocument,
        noteID: UUID,
        debounce delay: Duration = .milliseconds(400)
    ) -> NoteSummary? {
        guard noteID == index.currentID, let position = position(of: noteID) else { return nil }
        currentDocument = document
        index.notes[position].apply(document)
        index.notes[position].updatedAt = now()
        documentDirty = true
        indexDirty = true
        pendingSaveTask?.cancel()
        pendingSaveTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            do {
                try await self?.flush()
            } catch {
                self?.onSaveError(error)
            }
        }
        return index.notes[position]
    }

    /// Writes any pending edits immediately. Call when hiding the panel,
    /// switching notes, or terminating.
    public func flush() throws {
        pendingSaveTask?.cancel()
        pendingSaveTask = nil
        if documentDirty, let id = index.currentID {
            try currentDocument.serialized().write(to: noteURL(id), options: .atomic)
            documentDirty = false
        }
        try writeIndexIfNeeded()
    }

    // MARK: - Library operations

    public func snapshot() -> NotesSnapshot {
        let deleted = index.notes
            .filter(\.isDeleted)
            .sorted { ($0.deletedAt ?? .distantPast) > ($1.deletedAt ?? .distantPast) }
        return NotesSnapshot(currentID: index.currentID, notes: activeNotesByRecency() + deleted)
    }

    public func open(_ id: UUID) throws -> OpenedNote {
        if id == index.currentID, let summary = index.notes.first(where: { $0.id == id }) {
            return OpenedNote(summary: summary, document: currentDocument, preservedCorruptURL: nil)
        }
        guard let summary = index.notes.first(where: { $0.id == id }), !summary.isDeleted else {
            throw NoteStoreError.noteNotFound
        }
        try flush()
        return try committingChanges {
            try leaveCurrentNote()
            return try activate(summary.id)
        }
    }

    /// Opens a new empty note. If the current note is already empty it is
    /// reused rather than piling up blank notes.
    public func createNote() throws -> OpenedNote {
        try flush()
        return try committingChanges {
            if let id = index.currentID, let position = position(of: id), index.notes[position].isEmpty {
                index.notes[position].openedAt = now()
                indexDirty = true
                return OpenedNote(summary: index.notes[position], document: currentDocument, preservedCorruptURL: nil)
            }
            try leaveCurrentNote()
            return startNewNote()
        }
    }

    /// Moves a note to Recently Deleted (or removes it outright if it has no
    /// content). If it was the current note, returns the note opened in its
    /// place.
    @discardableResult
    public func delete(_ id: UUID) throws -> OpenedNote? {
        guard let position = position(of: id) else { throw NoteStoreError.noteNotFound }
        let wasCurrent = id == index.currentID
        try flush()
        return try committingChanges {
            if index.notes[position].isEmpty {
                try removeNote(at: position)
            } else {
                index.notes[position].deletedAt = now()
                index.notes[position].isPinned = false
            }
            indexDirty = true
            if wasCurrent {
                index.currentID = nil
                if let next = activeNotesByRecency().first {
                    return try activate(next.id)
                }
                return startNewNote()
            }
            return nil
        }
    }

    /// Restores a recently deleted note and opens it.
    public func restore(_ id: UUID) throws -> OpenedNote {
        guard let position = position(of: id) else { throw NoteStoreError.noteNotFound }
        try flush()
        return try committingChanges {
            index.notes[position].deletedAt = nil
            indexDirty = true
            if id != index.currentID {
                try leaveCurrentNote()
            }
            return try activate(id)
        }
    }

    /// Permanently removes a note (used for "Delete Permanently").
    public func purge(_ id: UUID) throws {
        guard let position = position(of: id) else { throw NoteStoreError.noteNotFound }
        guard id != index.currentID else { return }
        try flush()
        try removeNote(at: position)
        indexDirty = true
        try writeIndexIfNeeded()
    }

    public func setPinned(_ id: UUID, _ pinned: Bool) throws {
        guard let position = position(of: id), !index.notes[position].isDeleted else {
            throw NoteStoreError.noteNotFound
        }
        try flush()
        try committingChanges {
            index.notes[position].isPinned = pinned
            indexDirty = true
        }
    }

    // MARK: - Internals

    private func noteURL(_ id: UUID) -> URL {
        notesDirectory.appendingPathComponent("\(id.uuidString).json")
    }

    private func position(of id: UUID) -> Int? {
        index.notes.firstIndex { $0.id == id }
    }

    private func activeNotesByRecency() -> [NoteSummary] {
        index.notes
            .filter { !$0.isDeleted }
            .sorted {
                if $0.isPinned != $1.isPinned { return $0.isPinned }
                return $0.openedAt > $1.openedAt
            }
    }

    /// Called only after flushing successfully.
    private func leaveCurrentNote() throws {
        if let id = index.currentID, let position = position(of: id),
           index.notes[position].isEmpty, !index.notes[position].isPinned {
            try removeNote(at: position)
            indexDirty = true
        }
        index.currentID = nil
    }

    private func activate(_ id: UUID) throws -> OpenedNote {
        guard let position = position(of: id) else { throw NoteStoreError.noteNotFound }
        var preserved: URL?
        var document = NoteDocument.empty
        let url = noteURL(id)
        if fileManager.fileExists(atPath: url.path) {
            let data = try Data(contentsOf: url)
            do {
                document = try NoteDocument.deserialize(data)
            } catch {
                preserved = try preserve(url, as: id.uuidString)
            }
        } else if !index.notes[position].isEmpty {
            throw CocoaError(.fileReadNoSuchFile, userInfo: [NSFilePathErrorKey: url.path])
        }
        index.notes[position].openedAt = now()
        index.currentID = id
        indexDirty = true
        currentDocument = document
        documentDirty = false
        return OpenedNote(summary: index.notes[position], document: document, preservedCorruptURL: preserved)
    }

    private func startNewNote() -> OpenedNote {
        let summary = NoteSummary(now: now())
        index.notes.append(summary)
        index.currentID = summary.id
        indexDirty = true
        currentDocument = .empty
        documentDirty = false
        return OpenedNote(summary: summary, document: .empty, preservedCorruptURL: nil)
    }

    private func removeNote(at position: Int) throws {
        let id = index.notes[position].id
        let url = noteURL(id)
        if fileManager.fileExists(atPath: url.path) {
            try fileManager.removeItem(at: url)
        }
        index.notes.remove(at: position)
    }

    private func purgeExpiredDeletedNotes() throws {
        let cutoff = now().addingTimeInterval(-Self.deletedRetention)
        let expired = index.notes.filter { ($0.deletedAt ?? .distantFuture) < cutoff }.map(\.id)
        for id in expired {
            if let position = position(of: id) {
                try removeNote(at: position)
                indexDirty = true
            }
        }
    }

    private func writeIndexIfNeeded() throws {
        guard indexDirty else { return }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(index).write(to: indexURL, options: .atomic)
        indexDirty = false
    }

    /// A failed index write must not switch the native current note while
    /// the editor is still displaying the previous one.
    private func committingChanges<T>(_ change: () throws -> T) throws -> T {
        let previousIndex = index
        let previousDocument = currentDocument
        let previousIndexDirty = indexDirty
        let previousDocumentDirty = documentDirty
        do {
            let result = try change()
            try writeIndexIfNeeded()
            return result
        } catch {
            index = previousIndex
            currentDocument = previousDocument
            indexDirty = previousIndexDirty
            documentDirty = previousDocumentDirty
            throw error
        }
    }

    /// Imports `Jot/note.json` from the single-note version of Jot. The
    /// original is kept as `note.migrated.json`.
    private func migrateLegacyNote() throws -> URL? {
        let legacyURL = rootDirectory.appendingPathComponent("note.json")
        guard fileManager.fileExists(atPath: legacyURL.path) else { return nil }
        let data = try Data(contentsOf: legacyURL)
        let document: NoteDocument
        do {
            document = try NoteDocument.deserialize(data)
        } catch {
            return try preserve(legacyURL, as: "note")
        }
        var summary = NoteSummary(now: now())
        summary.apply(document)
        if !summary.isEmpty {
            try document.serialized().write(to: noteURL(summary.id), options: .atomic)
            index.notes.append(summary)
            index.currentID = summary.id
            indexDirty = true
            try writeIndexIfNeeded()
        }
        var backupURL = rootDirectory.appendingPathComponent("note.migrated.json")
        if fileManager.fileExists(atPath: backupURL.path) {
            backupURL = rootDirectory.appendingPathComponent("note.migrated-\(UUID().uuidString).json")
        }
        try fileManager.moveItem(at: legacyURL, to: backupURL)
        return nil
    }

    private func rebuildIndexFromNoteFiles() throws -> Index {
        var rebuilt = Index()
        let files = try fileManager.contentsOfDirectory(
            at: notesDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey]
        )
        for url in files where url.pathExtension == "json" {
            guard let id = UUID(uuidString: url.deletingPathExtension().lastPathComponent) else { continue }
            let data = try Data(contentsOf: url)
            let document: NoteDocument
            do {
                document = try NoteDocument.deserialize(data)
            } catch {
                NSLog("Jot: leaving unreadable note at \(url.path): \(error)")
                continue
            }
            let modified = try url.resourceValues(forKeys: [.contentModificationDateKey])
                .contentModificationDate ?? now()
            var summary = NoteSummary(id: id, now: modified)
            summary.apply(document)
            rebuilt.notes.append(summary)
        }
        return rebuilt
    }

    private func preserve(_ url: URL, as name: String) throws -> URL {
        let timestamp = Int(now().timeIntervalSince1970)
        let preservedURL = url.deletingLastPathComponent()
            .appendingPathComponent("\(name).corrupt-\(timestamp)-\(UUID().uuidString).json")
        try fileManager.copyItem(at: url, to: preservedURL)
        return preservedURL
    }
}
