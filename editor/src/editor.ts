import { Editor, InputRule, getHTMLFromFragment } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { DOMParser } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
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

// Typing "- " makes a bullet before "[ ] " can be typed, so Markdown-style
// "- [ ] " would leave literal brackets. Turn that list item into a task.
const listItemToTask = new InputRule({
  find: /^\[([ xX])?\]\s$/,
  handler: ({ state, range, match, chain, can }) => {
    const $from = state.doc.resolve(range.from);
    if ($from.depth < 3) return null;
    const item = $from.node(-1);
    const outer = $from.node(-3).type.name;
    if (item.type.name !== "listItem" || item.childCount !== 1 || outer === "listItem" || outer === "taskItem" ||
        !can().liftListItem("listItem")) {
      return null;
    }
    // List commands expect a transaction without earlier steps, so the
    // typed brackets are removed last.
    chain()
      .liftListItem("listItem")
      .toggleTaskList()
      .updateAttributes("taskItem", { checked: match[1]?.toLowerCase() === "x" })
      .command(({ tr }) => {
        tr.delete(tr.mapping.map(range.from), tr.mapping.map(range.to));
        return true;
      })
      .run();
    return undefined;
  }
});

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
    editable: false,
    content: EMPTY_DOCUMENT,
    editorProps: { handleDOMEvents: { mousedown: openLinkOnCommandClick, click: keepLinkClickInEditor } },
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        trailingNode: false,
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true
        }
      }),
      Placeholder.configure({
        showOnlyWhenEditable: false,
        // Tiptap treats a doc of several empty paragraphs as empty, which would
        // show the placeholder on the first line after pressing Enter.
        placeholder: ({ editor: current }) => (isBlankDocument(current.state.doc) ? PLACEHOLDER : "")
      }),
      TaskList,
      TaskItem.extend({
        addInputRules() {
          return [...(this.parent?.() ?? []), listItemToTask];
        }
      }).configure({ nested: true }),
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
    onCreate() {
      bridge.ready();
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
      const document = note.document;
      if (typeof document !== "object" || document === null || Array.isArray(document) || document.type !== "doc") {
        throw new Error("Stored note must be a document.");
      }
      linkPopover.close(false);
      editor.chain().setContent(document, { emitUpdate: false }).setMeta(markdownHistoryKey, "reset").run();
      noteId = note.id;
      editor.setEditable(true, false);
      // Like a scratchpad, reopening a note continues where it ends.
      editor.commands.setTextSelection(TextSelection.atEnd(editor.state.doc).from);
    },
    serialize(format: ExportFormat) {
      const doc = renderedDocument(editor);
      switch (format) {
        case "markdown":
          return editor.storage.markdown.serializer.serialize(doc);
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
        const template = document.createElement("template");
        template.innerHTML = html;
        template.content.querySelectorAll(
          "applet, audio, base, bgsound, embed, frame, frameset, iframe, img, link, math, meta, object, script, source, style, svg, track, video"
        ).forEach(element => element.remove());
        template.content.querySelectorAll("*").forEach(element => {
          for (const attribute of Array.from(element.attributes)) {
            const name = attribute.localName.toLowerCase();
            if (
              /^(?:action|background|data|formaction|ping|poster|src|srcdoc|srcset|style)$/u.test(name) ||
              name.startsWith("on") ||
              (name === "href" && element.localName !== "a")
            ) {
              element.removeAttribute(attribute.name);
            }
          }
        });
        const container = document.createElement("div");
        container.append(template.content);
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
      // When the panel is shown, WebKit may only gain window focus after this
      // call and then resets the caret to the start of the note, revealing the
      // first heading's markdown source. Place it again once focus arrives.
      if (!document.hasFocus()) {
        window.addEventListener("focus", () => editor.commands.focus("end"), { once: true });
      }
    }
  };
}

const sourceLink = /\[[^\]\n]*\]\(([^()\s]*)(?:\s+"[^"\n]*")?\)|(https?:\/\/[^\s<>()]+)/gu;

/** The URL under a click: a rendered link, or link Markdown on the line being edited. */
function linkAt(view: EditorView, event: MouseEvent): string | null {
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (anchor) return anchor.href;
  const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!found) return null;
  const $pos = view.state.doc.resolve(found.pos);
  for (const { 0: match, 1: target, 2: bare, index } of $pos.parent.textContent.matchAll(sourceLink)) {
    if ($pos.parentOffset >= index && $pos.parentOffset <= index + match.length) return target ?? bare;
  }
  return null;
}

/**
 * ⌘-click hands the URL to native code, which opens it via NSWorkspace.
 * Handled on mousedown, before the caret moves and turns the line into
 * Markdown source.
 */
function openLinkOnCommandClick(view: EditorView, event: MouseEvent): boolean {
  if (!event.metaKey || event.button !== 0) return false;
  const url = linkAt(view, event);
  if (!url) return false;
  event.preventDefault();
  bridge.openLink(url);
  return true;
}

/**
 * Links must never navigate the embedded WKWebView (there is no browser
 * chrome to go "back" from); a plain click just edits the link.
 */
function keepLinkClickInEditor(_view: EditorView, event: MouseEvent): boolean {
  if ((event.target as Element | null)?.closest?.("a[href]")) event.preventDefault();
  return false;
}
