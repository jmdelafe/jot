import { Editor, getHTMLFromFragment } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
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
import type { ExportFormat, JSONValue, NotePayload } from "./protocol";
import { LiveMarkdown, renderedDocument } from "./liveMarkdown";
import { MarkdownHistory, markdownHistoryKey } from "./markdownHistory";

export interface JotEditor {
  editor: Editor;
  linkPopover: LinkPopover;
  /** The native id of the note being edited; `null` until one is loaded. */
  readonly noteId: string | null;
  loadNote(note: NotePayload): void;
  /** The note serialized for copy/export, always from rendered rich text. */
  serialize(format: ExportFormat): string;
  focus(): void;
}

const EMPTY_DOCUMENT = { type: "doc", content: [{ type: "paragraph" }] };

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
        placeholder: "Jot down anything…"
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
      LiveMarkdown,
      MarkdownHistory,
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
