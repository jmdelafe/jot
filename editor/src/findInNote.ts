import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface FindMatch {
  from: number;
  to: number;
}

interface FindState {
  query: string;
  matches: FindMatch[];
  current: number;
}

type FindMeta = { query: string } | { current: number };

export const findKey = new PluginKey<FindState>("findInNote");

// Lowercase one character at a time so offsets in the folded text keep
// lining up with the document (some characters change length when lowered).
function fold(text: string): string {
  let result = "";
  for (let index = 0; index < text.length; index++) {
    const lower = text[index].toLowerCase();
    result += lower.length === 1 ? lower : text[index];
  }
  return result;
}

/** Case-insensitive literal matches of `query`, within each text block. */
export function findMatches(doc: ProseMirrorNode, query: string): FindMatch[] {
  const needle = fold(query);
  const matches: FindMatch[] = [];
  if (!needle) return matches;
  doc.descendants((node, position) => {
    if (!node.isTextblock) return true;
    let text = "";
    const positions: number[] = [];
    node.forEach((child, offset) => {
      // Non-text inline nodes (hard breaks) separate words like a newline.
      const content = child.isText ? child.text! : "\n";
      for (let index = 0; index < content.length; index++) {
        positions.push(position + 1 + offset + (child.isText ? index : 0));
      }
      text += content;
    });
    const haystack = fold(text);
    for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + needle.length)) {
      matches.push({ from: positions[index], to: positions[index + needle.length - 1] + 1 });
    }
    return false;
  });
  return matches;
}

export function findState(state: EditorState): FindState | undefined {
  return findKey.getState(state);
}

export const FindInNote = Extension.create({
  name: "findInNote",
  addProseMirrorPlugins() {
    return [new Plugin<FindState>({
      key: findKey,
      state: {
        init: () => ({ query: "", matches: [], current: 0 }),
        apply(tr, value, _oldState, state) {
          const meta = tr.getMeta(findKey) as FindMeta | undefined;
          if (meta && "query" in meta) {
            const matches = findMatches(state.doc, meta.query);
            // Start from the first match at or after the caret, like a browser.
            const after = matches.findIndex(match => match.from >= state.selection.from);
            return { query: meta.query, matches, current: Math.max(0, after) };
          }
          if (meta && "current" in meta) {
            const count = value.matches.length;
            return { ...value, current: count ? ((meta.current % count) + count) % count : 0 };
          }
          if (!tr.docChanged || !value.query) return value;
          const matches = findMatches(state.doc, value.query);
          return { ...value, matches, current: Math.min(value.current, Math.max(0, matches.length - 1)) };
        }
      },
      props: {
        decorations(state) {
          const value = findKey.getState(state);
          if (!value?.matches.length) return null;
          return DecorationSet.create(state.doc, value.matches.map((match, index) => Decoration.inline(
            match.from, match.to,
            { class: index === value.current ? "jot-find-match jot-find-match-current" : "jot-find-match" }
          )));
        }
      }
    })];
  }
});

/**
 * ⌘F bar for finding text in the current note. The editor keeps its own
 * selection on the current match, so closing the bar continues from there.
 */
export class FindBar {
  private readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly count: HTMLSpanElement;

  constructor(private readonly editor: Editor) {
    this.root = document.createElement("div");
    this.root.className = "jot-find-bar";
    this.root.setAttribute("role", "search");
    this.root.hidden = true;

    this.input = document.createElement("input");
    this.input.type = "search";
    this.input.placeholder = "Find in note";
    this.input.setAttribute("aria-label", "Find in note");
    this.input.spellcheck = false;
    this.input.addEventListener("input", () => this.search());
    this.input.addEventListener("keydown", event => this.onKey(event));

    this.count = document.createElement("span");
    this.count.className = "jot-find-count";
    this.count.setAttribute("aria-live", "polite");

    const button = (label: string, text: string, run: () => void) => {
      const element = document.createElement("button");
      element.type = "button";
      element.textContent = text;
      element.setAttribute("aria-label", label);
      // Keep focus in the input while clicking through matches.
      element.addEventListener("mousedown", event => event.preventDefault());
      element.addEventListener("click", run);
      return element;
    };

    this.root.append(
      this.input,
      this.count,
      button("Previous match", "‹", () => this.step(-1)),
      button("Next match", "›", () => this.step(1)),
      button("Close find", "×", () => this.close())
    );
    document.body.appendChild(this.root);
    editor.on("transaction", () => this.updateCount());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
    this.input.focus();
    this.input.select();
    this.search();
  }

  close(restoreFocus = true): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.editor.view.dispatch(this.editor.state.tr.setMeta(findKey, { query: "" }).setMeta("addToHistory", false));
    if (restoreFocus) this.editor.commands.focus();
  }

  /** Move to the next (1) or previous (-1) match. */
  step(direction: 1 | -1): void {
    const value = findState(this.editor.state);
    if (!value?.matches.length) return;
    this.editor.view.dispatch(this.editor.state.tr.setMeta(findKey, { current: value.current + direction }));
    this.reveal();
  }

  destroy(): void {
    this.root.remove();
  }

  private search(): void {
    this.editor.view.dispatch(this.editor.state.tr.setMeta(findKey, { query: this.input.value }));
    this.reveal();
  }

  private reveal(): void {
    const value = findState(this.editor.state);
    const match = value?.matches[value.current];
    if (!match) return;
    this.editor.view.dispatch(this.editor.state.tr
      .setSelection(TextSelection.create(this.editor.state.doc, match.from, match.to))
      .scrollIntoView());
  }

  private updateCount(): void {
    const value = findState(this.editor.state);
    const total = value?.matches.length ?? 0;
    this.count.textContent = !value?.query ? "" : total ? `${value.current + 1} of ${total}` : "No matches";
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      this.step(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      this.close();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
}
