import AppKit

@MainActor
enum Clipboard {
    enum ClipboardError: LocalizedError {
        case writeFailed
        case invalidHTML

        var errorDescription: String? {
            switch self {
            case .writeFailed: "Could not write to the clipboard. Please try copying again."
            case .invalidHTML: "Could not read the clipboard's formatted text."
            }
        }
    }

    static func copyText(_ text: String, to pasteboard: NSPasteboard = .general) throws {
        pasteboard.clearContents()
        guard pasteboard.setString(text, forType: .string) else {
            throw ClipboardError.writeFailed
        }
    }

    static func copyRichText(html: String, text: String, to pasteboard: NSPasteboard = .general) throws {
        let html = "<meta charset=\"utf-8\">" + html
        let attributed = try NSAttributedString(
            data: Data(html.utf8),
            options: [.documentType: NSAttributedString.DocumentType.html],
            documentAttributes: nil
        )
        let rtf = try attributed.data(
            from: NSRange(location: 0, length: attributed.length),
            documentAttributes: [.documentType: NSAttributedString.DocumentType.rtf]
        )
        let item = NSPasteboardItem()
        // Native editors often prefer RTF; web editors generally use HTML.
        guard item.setData(rtf, forType: .rtf),
            item.setString(html, forType: .html),
            item.setString(text, forType: .string)
        else {
            throw ClipboardError.writeFailed
        }
        pasteboard.clearContents()
        guard pasteboard.writeObjects([item]) else {
            throw ClipboardError.writeFailed
        }
    }

    static func readRichText(from pasteboard: NSPasteboard = .general) throws -> (html: String?, text: String)? {
        if let html = pasteboard.string(forType: .html), !html.isEmpty {
            return (html, pasteboard.string(forType: .string) ?? "")
        }
        if let rtf = pasteboard.data(forType: .rtf) {
            let attributed = try NSAttributedString(
                data: rtf,
                options: [.documentType: NSAttributedString.DocumentType.rtf],
                documentAttributes: nil
            )
            let data = try attributed.data(
                from: NSRange(location: 0, length: attributed.length),
                documentAttributes: [
                    .documentType: NSAttributedString.DocumentType.html,
                    .characterEncoding: String.Encoding.utf8.rawValue,
                    // Keep styles in the markup; the editor does not import stylesheets.
                    .excludedElements: ["style"]
                ]
            )
            guard let html = String(data: data, encoding: .utf8) else {
                throw ClipboardError.invalidHTML
            }
            return (html, attributed.string)
        }
        return pasteboard.string(forType: .string).map { (nil, $0) }
    }
}
