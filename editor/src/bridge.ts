import type { ExportFormat, JSONValue, OutboundMessage } from "./protocol";

/**
 * Thin wrapper around the WKScriptMessageHandler bridge. Falls back to a
 * console-only stub outside WebKit (e.g. under `npm run dev` or vitest) so
 * the editor is still usable/testable without a native host.
 */
function post(message: OutboundMessage): void {
  const handler = window.webkit?.messageHandlers?.jot;
  if (handler) {
    handler.postMessage(message);
  } else {
    // eslint-disable-next-line no-console
    console.debug("[jot-bridge:dev]", message);
  }
}

export const bridge = {
  ready(): void {
    post({ type: "ready" });
  },
  contentChanged(noteId: string, document: JSONValue): void {
    post({ type: "contentChanged", noteId, document });
  },
  openLink(url: string): void {
    post({ type: "openLink", url });
  },
  newNote(): void {
    post({ type: "newNote" });
  },
  openNote(id: string): void {
    post({ type: "openNote", id });
  },
  deleteNote(id: string): void {
    post({ type: "deleteNote", id });
  },
  restoreNote(id: string): void {
    post({ type: "restoreNote", id });
  },
  purgeNote(id: string): void {
    post({ type: "purgeNote", id });
  },
  setPinned(id: string, pinned: boolean): void {
    post({ type: "setPinned", id, pinned });
  },
  requestNotes(): void {
    post({ type: "requestNotes" });
  },
  copyText(text: string): void {
    post({ type: "copyText", text });
  },
  copyRichText(html: string, text: string): void {
    post({ type: "copyRichText", html, text });
  },
  pasteRichText(noteId: string): void {
    post({ type: "pasteRichText", noteId });
  },
  exportNote(format: ExportFormat, text: string): void {
    post({ type: "exportNote", format, text });
  },
  preferredHeight(height: number): void {
    post({ type: "preferredHeight", height });
  },
  hide(): void {
    post({ type: "hide" });
  }
};

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        jot?: {
          postMessage(message: OutboundMessage): void;
        };
      };
    };
  }
}
