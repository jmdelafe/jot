import Foundation
import WebKit
import JotCore

/// Owns the always-warm WKWebView hosting the TipTap editor and the narrow
/// typed bridge between it and native Swift. The message vocabulary is
/// deliberately small: ready, content changed, and open link.
///
/// Everything here runs on the main actor because `WKWebView` itself is
/// main-actor-isolated; `MessageRelay` is the one deliberate exception,
/// forwarding back onto the main actor explicitly since
/// `WKScriptMessageHandler` callbacks arrive without actor context.
@MainActor
final class EditorBridge: NSObject {
    let webView: WKWebView

    var onReady: (() -> Void)?
    var onContentChanged: ((JSONValue) -> Void)?
    var onOpenLink: ((URL) -> Void)?
    var onInvalidMessage: ((Error) -> Void)?

    override init() {
        let configuration = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()

        configuration.userContentController.add(Self.MessageRelay(handler: { [weak self] message in
            self?.handle(message)
        }), name: "jot")

        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        webView.navigationDelegate = self
    }

    func loadEditor() throws {
        guard let indexURL = Self.locateBundledEditorIndex() else {
            throw EditorBridgeError.missingBundledEditor
        }
        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
    }

    /// Resolves `editor/index.html` without going through SwiftPM's
    /// generated `Bundle.module` accessor, which hard-crashes (`fatalError`)
    /// if its single hardcoded path guess doesn't match. A real, packaged
    /// `Jot.app` places the resource bundle under `Contents/Resources`
    /// (found via `Bundle.main.resourceURL`), while `swift run`/loose debug
    /// binaries have it copied alongside the executable (found via
    /// `Bundle.main.bundleURL`). Trying both keeps both flows working.
    private static func locateBundledEditorIndex() -> URL? {
        let resourceBundleName = "Jot_Jot.bundle"
        let candidateDirectories = [
            Bundle.main.resourceURL,
            Bundle.main.bundleURL,
        ]
        for case let directory? in candidateDirectories {
            let bundleURL = directory.appendingPathComponent(resourceBundleName)
            if let bundle = Bundle(url: bundleURL),
                let indexURL = bundle.url(forResource: "index", withExtension: "html", subdirectory: "editor")
            {
                return indexURL
            }
        }
        return nil
    }

    func loadDocument(_ document: NoteDocument) {
        evaluate(function: "window.jot && window.jot.loadDocument", withJSONArgument: document.json)
    }

    func focusEditor() {
        evaluateJavaScript("window.jot && window.jot.focusEditor && window.jot.focusEditor();")
    }

    func clearDocument() {
        evaluateJavaScript("window.jot && window.jot.clearDocument && window.jot.clearDocument();")
    }

    private func evaluate(function: String, withJSONArgument value: JSONValue) {
        do {
            let data = try JSONEncoder().encode(value)
            let jsonText = String(data: data, encoding: .utf8) ?? "null"
            // Re-encoding the already-JSON text as a Swift string produces a
            // properly escaped JS string literal we can safely splice in.
            let literalData = try JSONEncoder().encode(jsonText)
            let literal = String(data: literalData, encoding: .utf8) ?? "\"\""
            evaluateJavaScript("(\(function))(\(literal));")
        } catch {
            onInvalidMessage?(error)
        }
    }

    private func evaluateJavaScript(_ script: String) {
        webView.evaluateJavaScript(script) { [weak self] _, error in
            if let error {
                self?.onInvalidMessage?(error)
            }
        }
    }

    private func handle(_ message: WKScriptMessage) {
        do {
            let decoded = try InboundBridgeMessage.decode(fromScriptMessageBody: message.body)
            switch decoded {
            case .ready:
                onReady?()
            case .contentChanged(let json):
                onContentChanged?(json)
            case .openLink(let url):
                onOpenLink?(url)
            }
        } catch {
            onInvalidMessage?(error)
        }
    }

    /// `WKScriptMessageHandler` retains its target strongly via the content
    /// controller, so this indirection avoids `EditorBridge` retaining
    /// itself through the web view's configuration. `WKScriptMessageHandler`
    /// itself is declared `@MainActor`, so this conforming method is
    /// main-actor-isolated even though the class isn't globally so.
    private final class MessageRelay: NSObject, WKScriptMessageHandler {
        let handler: @MainActor (WKScriptMessage) -> Void
        init(handler: @escaping @MainActor (WKScriptMessage) -> Void) {
            self.handler = handler
        }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            handler(message)
        }
    }
}

enum EditorBridgeError: Error {
    case missingBundledEditor
    case webContentProcessTerminated
}

extension EditorBridge: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        // Links open via NSWorkspace, never inside the editor, including
        // script-initiated navigations classified as `.other` by WebKit.
        if navigationAction.request.url?.isFileURL == true {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        onInvalidMessage?(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        onInvalidMessage?(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        onInvalidMessage?(EditorBridgeError.webContentProcessTerminated)
    }
}
