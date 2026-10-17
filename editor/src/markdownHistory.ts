import { Extension, type CommandProps } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";
import { ReplaceStep } from "@tiptap/pm/transform";
import { renderedState } from "./liveMarkdown";

interface Snapshot {
  doc: Node;
  anchor: number;
  head: number;
}

interface History {
  past: Snapshot[];
  future: Snapshot[];
  current: Snapshot;
  lastTyping: number;
}

const historyKey = new PluginKey<History>("markdownHistory");

// Presentation-only replacements cannot be mapped through ProseMirror's step
// history without losing edits. Keep history in the same rich form we persist.
export const MarkdownHistory = Extension.create({
  name: "markdownHistory",
  addCommands() {
    const restore = (direction: "undo" | "redo") => () => ({ state, tr, dispatch }: CommandProps) => {
      const history = historyKey.getState(state);
      const target = direction === "undo" ? history?.past.at(-1) : history?.future[0];
      if (!target) return false;
      if (dispatch) {
        tr.replaceWith(0, tr.doc.content.size, target.doc.content);
        tr.setSelection(TextSelection.between(tr.doc.resolve(target.anchor), tr.doc.resolve(target.head)));
        tr.setMeta(historyKey, direction);
      }
      return true;
    };
    return { undo: restore("undo"), redo: restore("redo") };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => this.editor.commands.undo(),
      "Mod-Shift-z": () => this.editor.commands.redo(),
      "Mod-y": () => this.editor.commands.redo()
    };
  },
  addProseMirrorPlugins() {
    const snapshot = (state: Parameters<typeof renderedState>[1]): Snapshot => {
      const rendered = renderedState(this.editor, state);
      return { doc: rendered.doc, anchor: rendered.selection.anchor, head: rendered.selection.head };
    };
    return [new Plugin<History>({
      key: historyKey,
      state: {
        init: (_, state) => ({ past: [], future: [], current: snapshot(state), lastTyping: 0 }),
        apply: (tr, history, _oldState, state) => {
          const current = snapshot(state);
          const action = tr.getMeta(historyKey);
          if (action === "reset") {
            return { past: [], future: [], current, lastTyping: 0 };
          }
          if (action === "undo") {
            return {
              past: history.past.slice(0, -1),
              future: [history.current, ...history.future],
              current, lastTyping: 0
            };
          }
          if (action === "redo") {
            return {
              past: [...history.past, history.current],
              future: history.future.slice(1),
              current, lastTyping: 0
            };
          }
          if (!tr.docChanged || tr.getMeta("addToHistory") === false || current.doc.eq(history.current.doc)) {
            return {
              ...history, current,
              lastTyping: tr.selectionSet && !tr.docChanged && tr.getMeta("addToHistory") !== false
                ? 0 : history.lastTyping
            };
          }
          const typing = tr.steps.every(step => step instanceof ReplaceStep &&
            (step.slice.size === 0 || step.slice.content.firstChild?.isText));
          const grouped = typing && tr.time - history.lastTyping < 500;
          return {
            past: grouped ? history.past : [...history.past, history.current].slice(-100),
            future: [], current, lastTyping: typing ? tr.time : 0
          };
        }
      },
      props: {
        handleDOMEvents: {
          beforeinput: (_view, event) => {
            const inputType = (event as InputEvent).inputType;
            if (inputType !== "historyUndo" && inputType !== "historyRedo") return false;
            event.preventDefault();
            return inputType === "historyUndo" ? this.editor.commands.undo() : this.editor.commands.redo();
          }
        }
      }
    })];
  }
});

export { historyKey as markdownHistoryKey };
