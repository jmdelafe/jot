import { isActive, type Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import type { LinkPopover } from "./linkPopover";
import { renderedState, withRenderedMarkdown } from "./liveMarkdown";

interface ButtonSpec {
  label: string;
  glyph: string;
  isActive?: (state: EditorState) => boolean;
  isDisabled?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const SHORTCUTS: Record<string, string> = {
  "Heading 1": "⌥⌘1", "Heading 2": "⌥⌘2", "Heading 3": "⌥⌘3",
  Bold: "⌘B", Italic: "⌘I", Underline: "⌘U", Strikethrough: "⇧⌘X", "Inline code": "⌘E",
  "Bulleted list": "⇧⌘8", "Numbered list": "⇧⌘7", "Task list": "⇧⌘9",
  Quote: "⇧⌘B", "Code block": "⌥⌘C", Link: "⌘L"
};

const GROUPS: ButtonSpec[][] = [
  [
    { label: "Heading 1", glyph: "H1", isActive: (s) => isActive(s, "heading", { level: 1 }), run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: "Heading 2", glyph: "H2", isActive: (s) => isActive(s, "heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Heading 3", glyph: "H3", isActive: (s) => isActive(s, "heading", { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() }
  ],
  [
    { label: "Bold", glyph: "B", isActive: (s) => isActive(s, "bold"), run: (e) => e.chain().focus().toggleBold().run() },
    { label: "Italic", glyph: "I", isActive: (s) => isActive(s, "italic"), run: (e) => e.chain().focus().toggleItalic().run() },
    { label: "Underline", glyph: "U", isActive: (s) => isActive(s, "underline"), run: (e) => e.chain().focus().toggleUnderline().run() },
    { label: "Strikethrough", glyph: "S", isActive: (s) => isActive(s, "strike"), run: (e) => e.chain().focus().toggleStrike().run() },
    { label: "Inline code", glyph: "<>", isActive: (s) => isActive(s, "code"), run: (e) => e.chain().focus().toggleCode().run() }
  ],
  [
    { label: "Bulleted list", glyph: "•", isActive: (s) => isActive(s, "bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", glyph: "1.", isActive: (s) => isActive(s, "orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
    { label: "Task list", glyph: "☑", isActive: (s) => isActive(s, "taskList"), run: (e) => e.chain().focus().toggleTaskList().run() },
    { label: "Quote", glyph: "❝", isActive: (s) => isActive(s, "blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
    { label: "Code block", glyph: "{ }", isActive: (s) => isActive(s, "codeBlock"), run: (e) => e.chain().focus().toggleCodeBlock().run() }
  ],
  [
    { label: "Link", glyph: "🔗", isActive: (s) => isActive(s, "link"), run: () => void 0 },
    { label: "Horizontal rule", glyph: "―", run: (e) => e.chain().focus().setHorizontalRule().run() }
  ]
];

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const PILL_GAP = 8;

/** Centres the pill over the selection, dropping below it when there is no room above. */
export function placePill(
  anchor: Box,
  pill: { width: number; height: number },
  viewportWidth: number
): { left: number; top: number } {
  const centred = (anchor.left + anchor.right) / 2 - pill.width / 2;
  const left = Math.max(PILL_GAP, Math.min(centred, viewportWidth - pill.width - PILL_GAP));
  const above = anchor.top - pill.height - PILL_GAP;
  return { left, top: above >= PILL_GAP ? above : anchor.bottom + PILL_GAP };
}

function selectionBox(editor: Editor): Box | null {
  const { from, to } = editor.state.selection;
  try {
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    return {
      left: Math.min(start.left, end.left),
      right: Math.max(start.right, end.right),
      top: Math.min(start.top, end.top),
      bottom: Math.max(start.bottom, end.bottom)
    };
  } catch {
    // The view has no layout yet (e.g. it is not attached to the document).
    return null;
  }
}

/** Mounts the formatting buttons as a floating pill that hovers over a non-empty selection. */
export function mountFormatBar(container: HTMLElement, editor: Editor, linkPopover: LinkPopover): void {
  container.innerHTML = "";
  const buttons: { spec: ButtonSpec; el: HTMLButtonElement }[] = [];

  GROUPS.forEach((group, groupIndex) => {
    const groupEl = document.createElement("div");
    groupEl.className = "jot-format-group";
    groupEl.setAttribute("role", "group");
    groupEl.setAttribute("aria-label", `Formatting group ${groupIndex + 1}`);

    for (const spec of group) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jot-format-button";
      button.textContent = spec.glyph;
      button.title = SHORTCUTS[spec.label] ? `${spec.label}  ${SHORTCUTS[spec.label]}` : spec.label;
      button.setAttribute("aria-label", spec.label);
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => {
        if (spec.label === "Link") {
          linkPopover.open(editor);
        } else {
          withRenderedMarkdown(editor, () => spec.run(editor));
        }
      });
      groupEl.appendChild(button);
      buttons.push({ spec, el: button });
    }
    container.appendChild(groupEl);
  });

  const reposition = () => {
    const box = editor.state.selection.empty ? null : selectionBox(editor);
    container.hidden = !box;
    if (!box) return;
    const { left, top } = placePill(
      box,
      { width: container.offsetWidth, height: container.offsetHeight },
      window.innerWidth
    );
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
  };

  const refresh = () => {
    const state = renderedState(editor);
    for (const { spec, el } of buttons) {
      el.classList.toggle("is-active", Boolean(spec.isActive?.(state)));
      el.disabled = Boolean(spec.isDisabled?.(editor));
    }
    reposition();
  };

  editor.on("transaction", refresh);
  editor.on("selectionUpdate", refresh);
  document.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);
  refresh();
}
