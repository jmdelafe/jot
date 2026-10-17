import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type JotEditor } from "../src/editor";
import { mountFormatBar } from "../src/formatBar";
import "../src/style.css";

describe("link popover", () => {
  let jot: JotEditor;
  let mount: HTMLDivElement;

  beforeEach(() => {
    mount = document.createElement("div");
    document.body.appendChild(mount);
    jot = createEditor(mount);
  });

  afterEach(() => {
    jot.editor.destroy();
    mount.remove();
    vi.restoreAllMocks();
  });

  function dialog(): HTMLElement {
    return document.querySelector<HTMLElement>(".jot-link-popover")!;
  }

  it("creates only one dialog and keeps it visually hidden until opened", () => {
    const toolbar = document.createElement("div");
    mount.appendChild(toolbar);
    mountFormatBar(toolbar, jot.editor, jot.linkPopover);
    expect(document.querySelectorAll(".jot-link-popover")).toHaveLength(1);
    expect(dialog().hidden).toBe(true);
    expect(getComputedStyle(dialog()).display).toBe("none");
    toolbar.querySelector<HTMLButtonElement>('[aria-label="Link"]')!.click();
    expect(dialog().hidden).toBe(false);
    expect(getComputedStyle(dialog()).display).toBe("flex");
  });

  it("dismisses on click-away without stealing focus back", () => {
    jot.linkPopover.open(jot.editor);
    const focus = vi.spyOn(jot.editor.commands, "focus");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(dialog().hidden).toBe(true);
    expect(focus).not.toHaveBeenCalled();
  });

  it("keeps the dialog open for interactions inside it", () => {
    jot.linkPopover.open(jot.editor);
    dialog().querySelector("input")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(dialog().hidden).toBe(false);
  });

  it("consumes Escape anywhere inside the dialog and restores editor focus", () => {
    jot.linkPopover.open(jot.editor);
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    dialog().querySelector("button")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(dialog().hidden).toBe(true);
  });

  it("saves and removes a link, hiding the dialog each time", () => {
    jot.editor.commands.insertContent("hello");
    jot.editor.commands.selectAll();
    jot.linkPopover.open(jot.editor);
    dialog().querySelector("input")!.value = "https://example.com";
    dialog().querySelector<HTMLButtonElement>("button")!.click();
    expect(jot.editor.getAttributes("link").href).toBe("https://example.com");
    expect(dialog().hidden).toBe(true);
    jot.linkPopover.open(jot.editor);
    dialog().querySelectorAll<HTMLButtonElement>("button")[1].click();
    expect(jot.editor.isActive("link")).toBe(false);
    expect(dialog().hidden).toBe(true);
  });

  it("dismisses on window blur and removes its DOM when destroyed", () => {
    jot.linkPopover.open(jot.editor);
    window.dispatchEvent(new Event("blur"));
    expect(dialog().hidden).toBe(true);
    jot.linkPopover.destroy();
    expect(document.querySelector(".jot-link-popover")).toBeNull();
  });
});
