import { Extension, type Editor } from "@tiptap/core";
import { DOMParser, Fragment, Mark, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { withRenderedMarkdown } from "./liveMarkdown";

/**
 * Ignores clipboard HTML, but renders Markdown in its plain text. Ordinary
 * text keeps the caret's style, and code blocks keep everything literal.
 */
export const MarkdownPaste = Extension.create({
  name: "markdownPaste",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({
      key: new PluginKey("markdownPaste"),
      props: {
        handlePaste: (_view, event, slice) => {
          const text = event.clipboardData?.getData("text/plain") ||
            slice.content.textBetween(0, slice.content.size, "\n", "\n");
          if (!text) return true;
          withRenderedMarkdown(editor, () => insertMarkdownText(editor, text));
          return true;
        }
      }
    })];
  }
});

export function insertMarkdownText(editor: Editor, text: string): void {
  if (!text) return;
  const { state } = editor;
  if (state.selection.$from.parent.type.spec.code) {
    insertPlainText(editor, text);
    return;
  }
  const parser = editor.storage.markdown.parser;
  const { html } = parser.md.options;
  const { image, softbreak } = parser.md.renderer.rules;
  const container = document.createElement("div");
  // Clipboard Markdown must not interpret HTML or load external images.
  parser.md.options.html = false;
  parser.md.renderer.rules.image = () => "";
  // The parser's DOM normalization strips newline-only text after inline marks.
  parser.md.renderer.rules.softbreak = () => " ";
  try {
    container.innerHTML = parser.parse(text.replace(/\r\n?/g, "\n"), { inline: true });
  } finally {
    parser.md.options.html = html;
    parser.md.renderer.rules.image = image;
    parser.md.renderer.rules.softbreak = softbreak;
  }
  const slice = DOMParser.fromSchema(editor.schema).parseSlice(container, {
    preserveWhitespace: "full",
    context: state.selection.$from
  });
  let formatted = false;
  slice.content.descendants(node => {
    if ((!node.isText && node.type.name !== "paragraph") || node.marks.length > 0) formatted = true;
  });
  if (!formatted) {
    insertPlainText(editor, text);
    return;
  }
  editor.view.dispatch(state.tr.replaceSelection(slice).setMeta("preventAutolink", true).scrollIntoView());
}

export function insertPlainText(editor: Editor, text: string): void {
  if (!text) return;
  const { state } = editor.view;
  const { $from, $to, empty } = state.selection;
  const normalized = text.replace(/\r\n?/g, "\n");
  let slice: Slice;
  if ($from.parent.type.spec.code) {
    slice = new Slice(Fragment.from(state.schema.text(normalized)), 0, 0);
  } else {
    const marks = state.storedMarks ?? (empty ? $from.marks() : $from.marksAcross($to)) ?? Mark.none;
    const paragraphs = normalized.split("\n").map(line =>
      state.schema.nodes.paragraph.create(null, line ? state.schema.text(line, marks) : null));
    slice = new Slice(Fragment.from(paragraphs), 1, 1);
  }
  editor.view.dispatch(state.tr.replaceSelection(slice).setMeta("preventAutolink", true).scrollIntoView());
}
