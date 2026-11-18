import { Node, type Editor } from "@tiptap/core";
import { DOMParser, Fragment, type Mark, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Transform } from "@tiptap/pm/transform";

interface MarkdownRuntime {
  parser: { parse(markdown: string): string };
  serializer: { serialize(document: ProseMirrorNode): string };
}

declare module "@tiptap/core" {
  interface Storage {
    markdown: MarkdownRuntime;
  }
}

const sourceName = "markdownSource";
const liveMarkdownKey = new PluginKey<boolean>("liveMarkdown");

function markdown(editor: Editor): MarkdownRuntime {
  return editor.storage.markdown;
}

// markdown-it trims an empty "- [ ]", which hides it from the task-list
// plugin, so pad it with a placeholder that is removed after parsing.
const emptyTask = /^(\s*(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\])[ \t]*$/gm;
const taskPlaceholder = "\u2060";

function parseSource(editor: Editor, node: ProseMirrorNode): Fragment {
  if (node.textContent === node.attrs.source) {
    return Fragment.from(editor.schema.nodeFromJSON(node.attrs.original));
  }
  const source = node.textContent.replace(emptyTask, `$1 ${taskPlaceholder}`);
  const container = document.createElement("div");
  container.innerHTML = markdown(editor).parser.parse(source).replaceAll(taskPlaceholder, "");
  return DOMParser.fromSchema(editor.schema).parse(container).content;
}

/** Never persist the temporary source node, even while the user is typing. */
export function renderedDocument(editor: Editor): ProseMirrorNode {
  const nodes: ProseMirrorNode[] = [];
  editor.state.doc.forEach(node => {
    if (node.type.name === sourceName) {
      parseSource(editor, node).forEach(child => nodes.push(child));
    } else {
      nodes.push(node);
    }
  });
  return editor.schema.topNodeType.create(null, nodes);
}

// Align visible text with its escaped Markdown representation to keep the
// caret beside the same character when entering or leaving source mode.
function sourcePositions(source: string, text: string): number[] {
  if (!text) return [source.length];
  const positions: number[] = [];
  let position = 0;
  for (let index = 0; index < text.length; index++) {
    const next = source.indexOf(text[index], position);
    positions.push(next < 0 ? position : next);
    if (next >= 0) position = next + 1;
  }
  positions.push(position);
  return positions;
}

function textOffset(node: ProseMirrorNode, position: number): number {
  return node.textBetween(0, Math.max(0, Math.min(position, node.content.size)), "", "").length;
}

function positionAtTextOffset(doc: ProseMirrorNode, offset: number): number {
  let result = 1;
  let remaining = offset;
  doc.descendants((node, position) => {
    if (remaining < 0) return false;
    if (node.isText) {
      result = position + Math.min(remaining, node.nodeSize);
      remaining -= node.nodeSize;
      if (remaining <= 0) remaining = -1;
    } else if (node.isTextblock && remaining === 0) {
      result = position + 1;
      remaining = -1;
      return false;
    }
    return true;
  });
  return result;
}

function renderSources(editor: Editor, tr: Transaction, keepPosition: number | null = null): void {
  const replacements: { node: ProseMirrorNode; position: number }[] = [];
  tr.doc.forEach((node, position) => {
    if (node.type.name === sourceName && position !== keepPosition) replacements.push({ node, position });
  });
  for (const { node, position } of replacements.reverse()) {
    const { anchor, head } = tr.selection;
    const fragment = parseSource(editor, node);
    const rendered = editor.schema.topNodeType.create(null, fragment);
    const positions = sourcePositions(node.textContent, rendered.textContent);
    const mapPosition = (value: number) => {
      const offset = Math.max(0, Math.min(value - position - 1, node.textContent.length));
      const index = positions.findIndex(value => value >= offset);
      const plainOffset = index < 0 ? rendered.textContent.length : index;
      return position + positionAtTextOffset(rendered, plainOffset);
    };
    const mappedAnchor = anchor > position && anchor < position + node.nodeSize ? mapPosition(anchor) : null;
    const mappedHead = head > position && head < position + node.nodeSize ? mapPosition(head) : null;
    tr.replaceWith(position, position + node.nodeSize, fragment);
    if (mappedAnchor !== null || mappedHead !== null) {
      tr.setSelection(TextSelection.between(
        tr.doc.resolve(mappedAnchor ?? tr.selection.anchor),
        tr.doc.resolve(mappedHead ?? tr.selection.head)
      ));
      if (anchor === head && anchor === position + 1 + node.attrs.caret &&
          node.textContent === node.attrs.source && node.attrs.typingMarks !== null) {
        tr.setStoredMarks(node.attrs.typingMarks.map((mark: ReturnType<Mark["toJSON"]>) =>
          editor.schema.markFromJSON(mark)));
      }
    }
  }
}

export function renderedState(editor: Editor, state = editor.state): EditorState {
  const tr = state.tr;
  renderSources(editor, tr);
  return EditorState.create({
    schema: editor.schema, doc: tr.doc, selection: tr.selection, storedMarks: tr.storedMarks
  });
}

/** Toolbar commands operate on rich text, not on the temporary Markdown node. */
export function withRenderedMarkdown(editor: Editor, run: () => void): void {
  const enabled = liveMarkdownKey.getState(editor.state) ?? false;
  const tr = editor.state.tr.setMeta(liveMarkdownKey, false).setMeta("addToHistory", false);
  renderSources(editor, tr);
  editor.view.dispatch(tr);
  try {
    run();
  } finally {
    editor.view.dispatch(editor.state.tr.setMeta(liveMarkdownKey, enabled).setMeta("addToHistory", false));
  }
}

export const LiveMarkdown = Node.create({
  name: sourceName,
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes() {
    return {
      source: { default: "" },
      original: { default: null },
      typingMarks: { default: null },
      caret: { default: 0 }
    };
  },
  renderHTML() {
    return ["pre", { "data-markdown-source": "", class: "jot-markdown-source" }, ["code", 0]];
  },
  addKeyboardShortcuts() {
    const run = (command: () => boolean) => {
      if (this.editor.state.selection.$from.parent.type.name !== sourceName) return false;
      withRenderedMarkdown(this.editor, command);
      return true;
    };
    return {
      "Mod-b": () => run(() => this.editor.commands.toggleBold()),
      "Mod-i": () => run(() => this.editor.commands.toggleItalic()),
      "Mod-u": () => run(() => this.editor.commands.toggleUnderline()),
      "Mod-Shift-x": () => run(() => this.editor.commands.toggleStrike()),
      "Mod-e": () => run(() => this.editor.commands.toggleCode()),
      "Mod-Shift-9": () => run(() => this.editor.commands.toggleTaskList()),
      "Shift-Enter": () => {
        if (this.editor.state.selection.$from.parent.type.name !== sourceName) return false;
        return this.editor.commands.command(({ tr }) => {
          tr.insertText("\n");
          return true;
        });
      },
      Enter: () => run(() => this.editor.commands.first([
        ({ commands }) => commands.newlineInCode(),
        ({ commands }) => commands.splitListItem("listItem"),
        ({ commands }) => commands.splitListItem("taskItem"),
        ({ commands }) => commands.createParagraphNear(),
        ({ commands }) => commands.liftEmptyBlock(),
        ({ commands }) => commands.splitBlock()
      ]))
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin<boolean>({
      key: liveMarkdownKey,
      state: {
        init: () => false,
        apply: (tr, enabled) => tr.getMeta(liveMarkdownKey) ?? enabled
      },
      props: {
        handleDOMEvents: {
          focus: view => {
            view.dispatch(view.state.tr.setMeta(liveMarkdownKey, true).setMeta("addToHistory", false));
            return false;
          },
          blur: view => {
            view.dispatch(view.state.tr.setMeta(liveMarkdownKey, false).setMeta("addToHistory", false));
            return false;
          }
        }
      },
      appendTransaction(transactions, _oldState, state) {
        if (!transactions.some(tr => tr.docChanged || tr.selectionSet || tr.getMeta(liveMarkdownKey) !== undefined)) {
          return null;
        }
        const enabled = liveMarkdownKey.getState(state);
        const tr = state.tr;
        const { $from, $to } = state.selection;
        const activePosition = enabled && $from.depth > 0 && $from.index(0) === $to.index(0)
          ? $from.before(1) : null;
        renderSources(editor, tr, activePosition);
        if (enabled && tr.selection instanceof TextSelection && tr.selection.$from.depth > 0) {
          const { $from: from, $to: to } = tr.selection;
          const node = from.node(1);
          let hasMarks = false;
          let hasList = node.type.isInGroup("list");
          node.descendants(child => {
            if (child.marks.length > 0) hasMarks = true;
            if (child.type.isInGroup("list")) hasList = true;
          });
          if (from.index(0) === to.index(0) && node.type.name !== sourceName && !hasList &&
              (node.type.name !== "paragraph" || hasMarks)) {
            const position = from.before(1);
            const document = editor.schema.topNodeType.create(null, node);
            let source = markdown(editor).serializer.serialize(document);
            const positions = sourcePositions(source, node.textContent);
            let anchor = positions[textOffset(node, tr.selection.anchor - position - 1)];
            let head = positions[textOffset(node, tr.selection.head - position - 1)];
            if (tr.selection.empty && tr.selection.$from.parent.isTextblock) {
              // A temporary marker locates the caret inside Markdown delimiters
              // and carries pending typing styles. It never enters the document.
              let marker = "JOTCURSOR";
              while (JSON.stringify(node.toJSON()).includes(marker)) marker += "X";
              const tagged = new Transform(document).insert(
                tr.selection.anchor - position,
                editor.schema.text(marker, state.storedMarks ?? tr.selection.$from.marks())
              );
              const taggedSource = markdown(editor).serializer.serialize(tagged.doc);
              anchor = taggedSource.indexOf(marker);
              head = anchor;
              source = taggedSource.replace(marker, "");
            }
            const sourceNode = editor.schema.nodes[sourceName].create(
              {
                source, original: node.toJSON(), caret: anchor,
                typingMarks: state.storedMarks?.map(mark => mark.toJSON()) ?? null
              },
              source ? editor.schema.text(source) : null
            );
            tr.replaceWith(position, position + node.nodeSize, sourceNode);
            tr.setSelection(TextSelection.create(tr.doc, position + 1 + anchor, position + 1 + head));
          }
        }
        return tr.docChanged ? tr.setMeta("addToHistory", false) : null;
      }
    })];
  }
});
