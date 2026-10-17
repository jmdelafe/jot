import Foundation

/// Lightweight per-note metadata kept in the library index so the note
/// browser can list and search every note without reading note bodies.
public struct NoteSummary: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var title: String
    /// Plain text of the note, capped, used for search and emptiness checks.
    public var searchText: String
    public var createdAt: Date
    public var updatedAt: Date
    public var openedAt: Date
    public var isPinned: Bool
    public var deletedAt: Date?

    public static let untitled = "Untitled"
    static let titleLimit = 80
    static let searchTextLimit = 2_000

    public init(id: UUID = UUID(), now: Date) {
        self.id = id
        self.title = Self.untitled
        self.searchText = ""
        self.createdAt = now
        self.updatedAt = now
        self.openedAt = now
        self.isPinned = false
        self.deletedAt = nil
    }

    public var isEmpty: Bool { searchText.isEmpty }
    public var isDeleted: Bool { deletedAt != nil }

    mutating func apply(_ document: NoteDocument) {
        let text = document.plainText
        title = Self.title(fromPlainText: text)
        searchText = String(text.prefix(Self.searchTextLimit))
    }

    static func title(fromPlainText text: String) -> String {
        let firstLine = text.split(whereSeparator: \.isNewline)
            .lazy
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first { !$0.isEmpty }
        guard let firstLine else { return untitled }
        return String(firstLine.prefix(titleLimit))
    }
}

extension NoteDocument {
    /// Text content with one line per block, used for titles and search.
    public var plainText: String {
        var lines: [String] = []
        var current = ""
        func visit(_ node: JSONValue) {
            guard let object = node.objectValue else { return }
            let type = object["type"]?.stringValue
            if type == "text", let text = object["text"]?.stringValue {
                current += text
                return
            }
            if type == "hardBreak" {
                lines.append(current)
                current = ""
                return
            }
            if case .array(let children)? = object["content"] {
                children.forEach(visit)
            }
            if type == "paragraph" || type == "heading" || type == "codeBlock" {
                lines.append(current)
                current = ""
            }
        }
        visit(json)
        if !current.isEmpty { lines.append(current) }
        return lines
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
    }
}
