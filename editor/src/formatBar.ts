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
      button.title = spec.label;
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

  const refresh = () => {
    const state = renderedState(editor);
    for (const { spec, el } of buttons) {
      el.classList.toggle("is-active", Boolean(spec.isActive?.(state)));
      el.disabled = Boolean(spec.isDisabled?.(editor));
    }
  };

  editor.on("transaction", refresh);
  editor.on("selectionUpdate", refresh);
  refresh();
}
