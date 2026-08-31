import type { JSONValue, OutboundMessage } from "./protocol";

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
  contentChanged(document: JSONValue): void {
    post({ type: "contentChanged", document });
  },
  openLink(url: string): void {
    post({ type: "openLink", url });
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
