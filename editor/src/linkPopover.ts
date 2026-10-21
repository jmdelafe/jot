import type { Editor } from "@tiptap/core";
import { withRenderedMarkdown } from "./liveMarkdown";

/**
 * Minimal, dependency-free popover for adding/editing/removing a link on the
 * current selection. Intentionally lightweight (no portal library) to keep
 * the bundle small and avoid any network or remote content.
 */
export class LinkPopover {
  private readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private editor: Editor | null = null;
  private readonly dismissOnPointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && !this.root.contains(event.target)) {
      this.close(false);
    }
  };
  private readonly dismissOnKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  };
  private readonly dismissOnBlur = () => this.close(false);

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "jot-link-popover";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "Edit link");
    this.root.hidden = true;

    this.input = document.createElement("input");
    this.input.type = "url";
    this.input.placeholder = "https://example.com";
    this.input.setAttribute("aria-label", "Link URL");

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () => this.commit());

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => this.remove());

    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.commit();
      }
    });

    this.root.append(this.input, saveButton, removeButton);
    this.root.addEventListener("focusout", event => {
      if (event.relatedTarget instanceof Node && !this.root.contains(event.relatedTarget)) {
        this.close(false);
      }
    });
    document.body.appendChild(this.root);
  }

  open(editor: Editor): boolean {
    this.editor = editor;
    withRenderedMarkdown(editor, () => {
      const existing = editor.getAttributes("link").href as string | undefined;
      this.input.value = existing ?? "";
    });
    this.root.hidden = false;
    this.root.style.transform = "";
    this.positionNearSelection();
    document.addEventListener("pointerdown", this.dismissOnPointerDown);
    document.addEventListener("keydown", this.dismissOnKeyDown, true);
    window.addEventListener("blur", this.dismissOnBlur);
    queueMicrotask(() => {
      if (!this.root.hidden) this.input.focus();
    });
    return true;
  }

  private positionNearSelection(): void {
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect?.();
    if (rect && rect.width + rect.height > 0) {
      this.root.style.left = `${Math.max(8, rect.left)}px`;
      this.root.style.top = `${rect.bottom + 8}px`;
    } else {
      this.root.style.left = "50%";
      this.root.style.top = "50%";
      this.root.style.transform = "translate(-50%, -50%)";
    }
  }

  private commit(): void {
    const url = this.input.value.trim();
    if (!this.editor) return;
    if (url.length === 0) {
      this.remove();
      return;
    }
    const editor = this.editor;
    withRenderedMarkdown(editor, () => {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    });
    this.close();
  }

  private remove(): void {
    const editor = this.editor;
    if (editor) {
      withRenderedMarkdown(editor, () => {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
      });
    }
    this.close();
  }

  close(restoreFocus = true): void {
    this.root.hidden = true;
    document.removeEventListener("pointerdown", this.dismissOnPointerDown);
    document.removeEventListener("keydown", this.dismissOnKeyDown, true);
    window.removeEventListener("blur", this.dismissOnBlur);
    if (restoreFocus) this.editor?.commands.focus();
    this.editor = null;
  }

  destroy(): void {
    this.close(false);
    this.root.remove();
  }
}
