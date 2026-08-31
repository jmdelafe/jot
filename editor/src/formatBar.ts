import type { Editor } from "@tiptap/core";
import type { LinkPopover } from "./linkPopover";

interface ButtonSpec {
  label: string;
  glyph: string;
  isActive?: (editor: Editor) => boolean;
  isDisabled?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const GROUPS: ButtonSpec[][] = [
  [
    { label: "Heading 1", glyph: "H1", isActive: (e) => e.isActive("heading", { level: 1 }), run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: "Heading 2", glyph: "H2", isActive: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Heading 3", glyph: "H3", isActive: (e) => e.isActive("heading", { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() }
  ],
  [
    { label: "Bold", glyph: "B", isActive: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
    { label: "Italic", glyph: "I", isActive: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
    { label: "Underline", glyph: "U", isActive: (e) => e.isActive("underline"), run: (e) => e.chain().focus().toggleUnderline().run() },
    { label: "Strikethrough", glyph: "S", isActive: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
    { label: "Inline code", glyph: "<>", isActive: (e) => e.isActive("code"), run: (e) => e.chain().focus().toggleCode().run() }
  ],
  [
    { label: "Bulleted list", glyph: "•", isActive: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", glyph: "1.", isActive: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
    { label: "Task list", glyph: "☑", isActive: (e) => e.isActive("taskList"), run: (e) => e.chain().focus().toggleTaskList().run() },
    { label: "Quote", glyph: "❝", isActive: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
    { label: "Code block", glyph: "{ }", isActive: (e) => e.isActive("codeBlock"), run: (e) => e.chain().focus().toggleCodeBlock().run() }
  ],
  [
    { label: "Link", glyph: "🔗", isActive: (e) => e.isActive("link"), run: () => void 0 },
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
      button.addEventListener("click", () => {
        if (spec.label === "Link") {
          linkPopover.open(editor);
        } else {
          spec.run(editor);
        }
      });
      groupEl.appendChild(button);
      buttons.push({ spec, el: button });
    }
    container.appendChild(groupEl);
  });

  const refresh = () => {
    for (const { spec, el } of buttons) {
      el.classList.toggle("is-active", Boolean(spec.isActive?.(editor)));
      el.disabled = Boolean(spec.isDisabled?.(editor));
    }
  };

  editor.on("transaction", refresh);
  editor.on("selectionUpdate", refresh);
  refresh();
}
