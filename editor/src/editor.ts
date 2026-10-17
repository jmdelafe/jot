import { Editor } from "@tiptap/core";
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
import type { JSONValue } from "./protocol";
import { LiveMarkdown, renderedDocument } from "./liveMarkdown";
import { MarkdownHistory, markdownHistoryKey } from "./markdownHistory";

export interface JotEditor {
  editor: Editor;
  linkPopover: LinkPopover;
  loadDocument(json: string): void;
  clearDocument(): void;
  focus(): void;
}

const EMPTY_DOCUMENT = { type: "doc", content: [{ type: "paragraph" }] };

export function createEditor(mountEl: HTMLElement): JotEditor {
  const linkPopover = new LinkPopover();
  // The shortcuts extension needs a reference to the editor it will be
  // attached to, but the editor's extension list must be supplied before
  // the Editor instance exists, so we thread it through a mutable box.
  const editorRef: { current: Editor | null } = { current: null };

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
      bridge.contentChanged(renderedDocument(current).toJSON() as JSONValue);
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
    loadDocument(json: string) {
      linkPopover.close(false);
      const parsed = JSON.parse(json) as JSONValue;
      editor.chain().setContent(parsed as never, false).setMeta(markdownHistoryKey, "reset").run();
    },
    clearDocument() {
      linkPopover.close(false);
      editor.commands.setContent(EMPTY_DOCUMENT, false);
      bridge.contentChanged(EMPTY_DOCUMENT as unknown as JSONValue);
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
