import Foundation

public enum NoteStoreError: Error, Equatable {
    case invalidDocumentShape
    /// The stored file exists but is unreadable/corrupt. The original file
    /// is preserved next to `preservedURL` rather than being overwritten so
    /// nothing is silently destroyed.
    case corrupted(preservedURL: URL)
}

/// Owns the single note's on-disk representation. All file I/O happens off
/// the main actor and writes are atomic (write-to-temp + rename), so a crash
/// or force-quit mid-save cannot leave a half-written file.
public actor NoteStore {
    private let fileURL: URL
    private let fileManager: FileManager
    private var pendingSaveTask: Task<Void, Never>?
    private var latestPendingDocument: NoteDocument?

    /// - Parameter directoryURL: Defaults to
    ///   `~/Library/Application Support/Jot`. Overridable for tests so they
    ///   never touch the real user's data.
    public init(directoryURL: URL? = nil, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        let directory = directoryURL ?? NoteStore.defaultDirectory(fileManager: fileManager)
        self.fileURL = directory.appendingPathComponent("note.json")
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    public static func defaultDirectory(fileManager: FileManager = .default) -> URL {
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent("Jot", isDirectory: true)
    }

    /// Loads the persisted note. Returns `nil` on first run (no file yet).
    /// Throws `.corrupted` if a file exists but cannot be parsed as a valid
    /// document — callers must surface this rather than silently starting
    /// empty.
    public func load() throws -> NoteDocument? {
        guard fileManager.fileExists(atPath: fileURL.path) else { return nil }
        let data = try Data(contentsOf: fileURL)
        do {
            return try NoteDocument.deserialize(data)
        } catch {
            let preserved = preserveCorruptFile()
            throw NoteStoreError.corrupted(preservedURL: preserved)
        }
    }

    /// Immediately and atomically persists `document`, cancelling any
    /// pending debounced save.
    @discardableResult
    public func save(_ document: NoteDocument) throws -> NoteDocument {
        pendingSaveTask?.cancel()
        pendingSaveTask = nil
        latestPendingDocument = nil
        let data = try document.serialized()
        try data.write(to: fileURL, options: .atomic)
        return document
    }

    /// Schedules a debounced save. Repeated calls within `delay` coalesce
    /// into a single write of the most recent document.
    public func scheduleDebouncedSave(_ document: NoteDocument, delay: Duration = .milliseconds(400)) {
        latestPendingDocument = document
        pendingSaveTask?.cancel()
        pendingSaveTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.flushPendingSave()
        }
    }

    /// Cancels any pending debounce timer and writes the latest requested
    /// document immediately, if one is outstanding. Call this when hiding
    /// the panel or terminating the app so no edits are lost.
    @discardableResult
    public func flushPendingSave() -> NoteDocument? {
        pendingSaveTask?.cancel()
        pendingSaveTask = nil
        guard let document = latestPendingDocument else { return nil }
        latestPendingDocument = nil
        if let data = try? document.serialized() {
            try? data.write(to: fileURL, options: .atomic)
        }
        return document
    }

    private func preserveCorruptFile() -> URL {
        let timestamp = Int(Date().timeIntervalSince1970)
        let preservedURL = fileURL.deletingLastPathComponent()
            .appendingPathComponent("note.corrupt-\(timestamp).json")
        try? fileManager.moveItem(at: fileURL, to: preservedURL)
        return preservedURL
    }
}
