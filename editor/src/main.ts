import "./style.css";
import { createEditor } from "./editor";
import { mountFormatBar } from "./formatBar";
import type { NativeBridge } from "./protocol";

const editorMount = document.getElementById("editor");
const formatBarMount = document.getElementById("format-bar");

if (!editorMount || !formatBarMount) {
  throw new Error("Jot editor host is missing required DOM mount points.");
}

const jotEditor = createEditor(editorMount);
mountFormatBar(formatBarMount, jotEditor.editor, jotEditor.linkPopover);

const nativeBridge: NativeBridge = {
  loadDocument(json: string) {
    jotEditor.loadDocument(json);
  },
  focusEditor() {
    jotEditor.focus();
  },
  clearDocument() {
    jotEditor.clearDocument();
  }
};

window.jot = nativeBridge;

declare global {
  interface Window {
    jot: NativeBridge;
  }
}
