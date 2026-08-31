/**
 * Typed bridge protocol shared conceptually with the Swift side
 * (`Sources/Jot/Bridge/BridgeMessages.swift`). Keep the two definitions in
 * sync manually: this is intentionally the *only* vocabulary the web layer
 * is allowed to send or receive.
 */

/** Arbitrary JSON value used to carry a TipTap document losslessly. */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

/** Messages sent from the web layer to native Swift. */
export type OutboundMessage =
  | { type: "ready" }
  | { type: "contentChanged"; document: JSONValue }
  | { type: "openLink"; url: string };

/** Messages the native Swift layer sends into the web layer. */
export interface NativeBridge {
  loadDocument(json: string): void;
  focusEditor(): void;
  clearDocument(): void;
}

export function isOutboundMessage(value: unknown): value is OutboundMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  const message = value as { type: unknown };
  switch (message.type) {
    case "ready":
      return true;
    case "contentChanged":
      return "document" in message;
    case "openLink":
      return typeof (message as { url?: unknown }).url === "string";
    default:
      return false;
  }
}
