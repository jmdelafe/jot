/**
 * Typed bridge protocol shared conceptually with the Swift side
 * (`Sources/JotCore/Bridge/BridgeMessages.swift`). Keep the two definitions
 * in sync manually: this is intentionally the *only* vocabulary the web
 * layer is allowed to send or receive.
 */

/** Arbitrary JSON value used to carry a TipTap document losslessly. */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export type ExportFormat = "markdown" | "html" | "plainText";

/** Messages sent from the web layer to native Swift. */
export type OutboundMessage =
  | { type: "ready" }
  | { type: "contentChanged"; noteId: string; document: JSONValue }
  | { type: "openLink"; url: string }
  | { type: "newNote" }
  | { type: "openNote"; id: string }
  | { type: "deleteNote"; id: string }
  | { type: "restoreNote"; id: string }
  | { type: "purgeNote"; id: string }
  | { type: "setPinned"; id: string; pinned: boolean }
  | { type: "requestNotes" }
  | { type: "copyText"; text: string }
  | { type: "exportNote"; format: ExportFormat; text: string }
  | { type: "preferredHeight"; height: number }
  | { type: "hide" };

/** One entry of the note browser, as sent by native `setNotes`. */
export interface NoteListItem {
  id: string;
  title: string;
  searchText: string;
  pinned: boolean;
  openedAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface NotesPayload {
  currentId: string | null;
  notes: NoteListItem[];
}

export interface NotePayload {
  id: string;
  document: JSONValue;
}

/** Functions native Swift calls on `window.jot`. JSON arrives as strings. */
export interface NativeBridge {
  loadNote(json: string): void;
  setNotes(json: string): void;
  focusEditor(): void;
  showNotes(): void;
  showActions(): void;
}

const ID_TYPES = new Set(["openNote", "deleteNote", "restoreNote", "purgeNote"]);
const BARE_TYPES = new Set(["ready", "newNote", "requestNotes", "hide"]);
const EXPORT_FORMATS = new Set(["markdown", "html", "plainText"]);

export function isOutboundMessage(value: unknown): value is OutboundMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  const message = value as Record<string, unknown>;
  const type = message.type;
  if (typeof type !== "string") return false;
  if (BARE_TYPES.has(type)) return true;
  if (ID_TYPES.has(type)) return typeof message.id === "string";
  switch (type) {
    case "contentChanged":
      return typeof message.noteId === "string" && "document" in message;
    case "openLink":
      return typeof message.url === "string";
    case "setPinned":
      return typeof message.id === "string" && typeof message.pinned === "boolean";
    case "copyText":
      return typeof message.text === "string";
    case "exportNote":
      return typeof message.text === "string" && EXPORT_FORMATS.has(message.format as string);
    case "preferredHeight":
      return typeof message.height === "number" && Number.isFinite(message.height) && message.height >= 0;
    default:
      return false;
  }
}
