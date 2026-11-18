import "./style.css";
import { createEditor } from "./editor";
import { mountFormatBar } from "./formatBar";
import { Palette, type PaletteItem, type PaletteMode } from "./palette";
import { notesMode } from "./notesBrowser";
import { installAutosize } from "./autosize";
import { bridge } from "./bridge";
import type { ExportFormat, NativeBridge, NotePayload, NotesPayload, PastePayload } from "./protocol";

const editorMount = document.getElementById("editor");
const formatBarMount = document.getElementById("format-bar");

if (!editorMount || !formatBarMount) {
  throw new Error("Jot editor host is missing required DOM mount points.");
}

const jot = createEditor(editorMount);
let notes: NotesPayload = { currentId: null, notes: [] };

const focusEditor = () => jot.focus();
const palette = new Palette(() => autosize.schedule());
const autosize = installAutosize(editorMount, () => palette.isOpen);
jot.editor.on("update", () => autosize.schedule());

mountFormatBar(formatBarMount, jot.editor, jot.linkPopover);

const toast = document.createElement("div");
toast.className = "jot-toast";
toast.setAttribute("role", "status");
toast.hidden = true;
document.body.appendChild(toast);
let toastTimer: number | undefined;
function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 1400);
}

const currentNote = () => notes.notes.find(note => note.id === jot.noteId);

const noteActions = {
  open: (id: string) => bridge.openNote(id),
  restore: (id: string) => bridge.restoreNote(id),
  remove: (id: string) => bridge.deleteNote(id),
  purge: (id: string) => bridge.purgeNote(id),
  setPinned: (id: string, pinned: boolean) => bridge.setPinned(id, pinned)
};

function togglePinCurrent(): void {
  if (!jot.noteId) return;
  const pinned = currentNote()?.pinned ?? false;
  bridge.setPinned(jot.noteId, !pinned);
  showToast(pinned ? "Unpinned Note" : "Pinned Note");
}

function deleteCurrent(): void {
  if (jot.noteId) bridge.deleteNote(jot.noteId);
}

function copy(format: ExportFormat): void {
  bridge.copyText(jot.serialize(format));
}

function copyFormatted(): void {
  jot.copyFormatted();
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  markdown: "Markdown",
  html: "HTML",
  plainText: "Plain Text"
};

function actionItems(): PaletteItem[] {
  const pinned = currentNote()?.pinned ?? false;
  const formats = Object.keys(FORMAT_LABELS) as ExportFormat[];
  return [
    { id: "new", section: "Note", title: "New Note", shortcut: ["⌘", "N"], run: () => bridge.newNote() },
    { id: "browse", section: "Note", title: "Browse Notes", shortcut: ["⌘", "P"], run: showNotes },
    {
      id: "pin", section: "Note", title: pinned ? "Unpin Note" : "Pin Note",
      shortcut: ["⇧", "⌘", "P"], run: togglePinCurrent
    },
    {
      id: "copy-formatted", section: "Copy", title: "Copy with Formatting",
      shortcut: ["⇧", "⌘", "C"], run: copyFormatted
    },
    ...formats.map((format): PaletteItem => ({
      id: `copy-${format}`, section: "Copy", title: `Copy as ${FORMAT_LABELS[format]}`,
      run: () => copy(format)
    })),
    ...formats.map((format): PaletteItem => ({
      id: `export-${format}`, section: "Export", title: `Export as ${FORMAT_LABELS[format]}…`,
      run: () => bridge.exportNote(format, jot.serialize(format))
    })),
    { id: "delete", section: "Danger Zone", title: "Delete Note", shortcut: ["⌃", "X"], danger: true, run: deleteCurrent }
  ];
}

const actionsMode: PaletteMode = {
  name: "actions",
  placeholder: "Search for actions…",
  items: actionItems,
  onKey(event) {
    if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "x") {
      palette.close();
      deleteCurrent();
      return true;
    }
    return false;
  }
};

function showNotes(): void {
  bridge.requestNotes();
  palette.open(notesMode(() => notes, noteActions), focusEditor);
}

function showActions(): void {
  bridge.requestNotes();
  palette.open(actionsMode, focusEditor);
}

function togglePalette(mode: "notes" | "actions"): void {
  if (palette.modeName === mode) {
    palette.close();
  } else if (mode === "notes") {
    showNotes();
  } else {
    showActions();
  }
}

// Capture phase so app-level shortcuts win over the editor's own keymaps.
window.addEventListener("keydown", event => {
  if (!event.metaKey || event.altKey || event.ctrlKey) return;
  const key = event.key.toLowerCase();
  const inEditor = event.target instanceof Node && jot.editor.view.dom.contains(event.target);
  let handled = true;
  if (!event.shiftKey && key === "n") {
    palette.close(false);
    bridge.newNote();
  } else if (!event.shiftKey && key === "p") {
    togglePalette("notes");
  } else if (!event.shiftKey && key === "k") {
    togglePalette("actions");
  } else if (!event.shiftKey && key === "w") {
    bridge.hide();
  } else if (!event.shiftKey && key === "c" && !palette.isOpen && inEditor) {
    handled = jot.copySelection();
  } else if (event.shiftKey && key === "p" && !palette.isOpen) {
    togglePinCurrent();
  } else if (event.shiftKey && key === "c" && !palette.isOpen && inEditor) {
    copyFormatted();
  } else if (event.shiftKey && key === "v" && !palette.isOpen && inEditor) {
    if (jot.noteId) bridge.pasteRichText(jot.noteId);
    else handled = false;
  } else {
    handled = false;
  }
  if (handled) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

const nativeBridge: NativeBridge = {
  loadNote(json: string) {
    jot.loadNote(JSON.parse(json) as NotePayload);
    autosize.schedule();
    bridge.requestNotes();
  },
  setNotes(json: string) {
    notes = JSON.parse(json) as NotesPayload;
    palette.refresh();
  },
  focusEditor() {
    if (!palette.isOpen) focusEditor();
  },
  showNotes() {
    togglePalette("notes");
  },
  showActions() {
    togglePalette("actions");
  },
  clipboardCopied() {
    showToast("Copied to Clipboard");
  },
  pasteRichText(json: string) {
    const content = JSON.parse(json) as PastePayload;
    if (content.noteId === jot.noteId && !palette.isOpen) {
      jot.pasteFormatted(content);
    }
  }
};

window.jot = nativeBridge;

declare global {
  interface Window {
    jot: NativeBridge;
  }
}
