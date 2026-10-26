import { Editor, getHTMLFromFragment } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { DOMParser } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import { bridge } from "./bridge";
import { createShortcutsExtension } from "./shortcuts";
import { LinkPopover } from "./linkPopover";
import type { ClipboardContent, ExportFormat, JSONValue, NotePayload } from "./protocol";
import { LiveMarkdown, renderedDocument, renderedState, withRenderedMarkdown } from "./liveMarkdown";
import { MarkdownHistory, markdownHistoryKey } from "./markdownHistory";
import { PlainTextPaste, insertPlainText } from "./plainPaste";

export interface JotEditor {
  editor: Editor;
  linkPopover: LinkPopover;
  /** The native id of the note being edited; `null` until one is loaded. */
  readonly noteId: string | null;
  loadNote(note: NotePayload): void;
  /** The note serialized for copy/export, always from rendered rich text. */
  serialize(format: ExportFormat): string;
  /** Copy the current selection as plain text, returning false when it is empty. */
  copySelection(): boolean;
  /** Copy the selection, or the whole note when nothing is selected, as rich text. */
  copyFormatted(): void;
  pasteFormatted(content: ClipboardContent): void;
  focus(): void;
}

const EMPTY_DOCUMENT = { type: "doc", content: [{ type: "paragraph" }] };
const PLACEHOLDER = "Jot down anything…";

function isBlankDocument(doc: ProseMirrorNode): boolean {
  const only = doc.childCount === 1 ? doc.firstChild : null;
  return only !== null && only.type.name === "paragraph" && only.childCount === 0;
}

export function createEditor(mountEl: HTMLElement): JotEditor {
  const linkPopover = new LinkPopover();
  // The shortcuts extension needs a reference to the editor it will be
  // attached to, but the editor's extension list must be supplied before
  // the Editor instance exists, so we thread it through a mutable box.
  const editorRef: { current: Editor | null } = { current: null };
  let noteId: string | null = null;

  const editor = new Editor({
    element: mountEl,
    autofocus: false,
    content: EMPTY_DOCUMENT,
    extensions: [
      StarterKit.configure({
        history: false,
        heading: { levels: [1, 2, 3] }
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true
      }),
      Placeholder.configure({
        // Tiptap treats a doc of several empty paragraphs as empty, which would
        // show the placeholder on the first line after pressing Enter.
        placeholder: ({ editor: current }) => (isBlankDocument(current.state.doc) ? PLACEHOLDER : "")
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
      LiveMarkdown,
      MarkdownHistory,
      PlainTextPaste,
      createShortcutsExtension(() => linkPopover.open(editorRef.current!))
    ],
    onUpdate({ editor: current }) {
      if (noteId === null) return;
      bridge.contentChanged(noteId, renderedDocument(current).toJSON() as JSONValue);
    },
    onCreate({ editor: current }) {
      bridge.ready();
      installExternalLinkHandling(current);
    },
    onDestroy() {
      linkPopover.destroy();
    }
  });
  editorRef.current = editor;


  return {
    editor,
    linkPopover,
    get noteId() {
      return noteId;
    },
    loadNote(note: NotePayload) {
      linkPopover.close(false);
      noteId = note.id;
      editor.chain().setContent(note.document as never, false).setMeta(markdownHistoryKey, "reset").run();
      // Like a scratchpad, reopening a note continues where it ends.
      editor.commands.setTextSelection(TextSelection.atEnd(editor.state.doc).from);
    },
    serialize(format: ExportFormat) {
      const doc = renderedDocument(editor);
      switch (format) {
        case "markdown":
          return (editor.storage.markdown as { serializer: { serialize(node: unknown): string } })
            .serializer.serialize(doc);
        case "html":
          return getHTMLFromFragment(doc.content, editor.schema);
        case "plainText":
          return doc.textBetween(0, doc.content.size, "\n", "\n");
      }
    },
    copySelection() {
      const state = renderedState(editor);
      if (state.selection.empty) return false;
      const { from, to } = state.selection;
      const text = state.doc.textBetween(from, to, "\n", "\n");
      if (!text) return false;
      bridge.copyText(text);
      return true;
    },
    copyFormatted() {
      const state = renderedState(editor);
      const { selection, doc } = state;
      const content = selection.empty ? doc.content : selection.content().content;
      const from = selection.empty ? 0 : selection.from;
      const to = selection.empty ? doc.content.size : selection.to;
      bridge.copyRichText(
        getHTMLFromFragment(content, editor.schema),
        doc.textBetween(from, to, "\n", "\n")
      );
    },
    pasteFormatted({ html, text }) {
      withRenderedMarkdown(editor, () => {
        const { state } = editor;
        if (!html) {
          insertPlainText(editor, text);
          return;
        }
        const container = document.createElement("div");
        container.innerHTML = html;
        const slice = DOMParser.fromSchema(editor.schema).parseSlice(container, {
          preserveWhitespace: true,
          context: state.selection.$from
        });
        if (slice.content.size === 0) {
          insertPlainText(editor, text);
          return;
        }
        if (state.selection.$from.parent.type.spec.code) {
          insertPlainText(editor, text || slice.content.textBetween(0, slice.content.size, "\n", "\n"));
          return;
        }
        editor.view.dispatch(state.tr.replaceSelection(slice)
          .setMeta("preventAutolink", true).scrollIntoView());
      });
    },
    focus() {
      editor.commands.focus("end");
    }
  };
}

/**
 * Links must never navigate the embedded WKWebView (there is no browser
 * chrome to go "back" from). Intercept clicks on rendered links and hand the
 * URL to native code, which opens it via NSWorkspace.
 */
function installExternalLinkHandling(editor: Editor): void {
  editor.view.dom.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    event.preventDefault();
    bridge.openLink(anchor.href);
  });
}
