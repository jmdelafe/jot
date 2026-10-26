import { Extension, type Editor } from "@tiptap/core";
import { Fragment, Mark, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { withRenderedMarkdown } from "./liveMarkdown";

/**
 * Pastes only the clipboard's plain text, styled like text typed at the
 * caret. The transaction deliberately lacks the `paste` UI event so TipTap's
 * paste rules leave Markdown syntax and URLs literal.
 */
export const PlainTextPaste = Extension.create({
  name: "plainTextPaste",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({
      key: new PluginKey("plainTextPaste"),
      props: {
        handlePaste: (view, event, slice) => {
          const text = event.clipboardData?.getData("text/plain") ||
            slice.content.textBetween(0, slice.content.size, "\n", "\n");
          if (!text) return true;
          if (view.state.selection.$from.parent.type.name === "markdownSource") {
            // Insert into rich text so pasted characters are escaped, not parsed as Markdown.
            withRenderedMarkdown(editor, () => insertPlainText(editor, text));
          } else {
            insertPlainText(editor, text);
          }
          return true;
        }
      }
    })];
  }
});

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
