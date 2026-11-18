import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type JotEditor } from "../src/editor";
import { mountFormatBar, placePill } from "../src/formatBar";

describe("placePill", () => {
  const pill = { width: 200, height: 34 };

  it("centres the pill above the selection", () => {
    const anchor = { left: 300, right: 400, top: 100, bottom: 120 };
    expect(placePill(anchor, pill, 800)).toEqual({ left: 250, top: 58 });
  });

  it("drops below the selection when there is no room above", () => {
    const anchor = { left: 300, right: 400, top: 20, bottom: 40 };
    expect(placePill(anchor, pill, 800)).toEqual({ left: 250, top: 48 });
  });

  it("stays inside the viewport horizontally", () => {
    const anchor = { left: 0, right: 20, top: 100, bottom: 120 };
    expect(placePill(anchor, pill, 800).left).toBe(8);
    expect(placePill({ ...anchor, left: 780, right: 800 }, pill, 800).left).toBe(592);
    expect(placePill(anchor, pill, 150).left).toBe(8);
  });
});

describe("selection pill", () => {
  let jot: JotEditor;
  let mount: HTMLDivElement;
  let pillEl: HTMLDivElement;

  beforeEach(() => {
    mount = document.createElement("div");
    pillEl = document.createElement("div");
    document.body.append(mount, pillEl);
    jot = createEditor(mount);
    jot.editor.commands.setContent("<p>hello world</p>");
    vi.spyOn(jot.editor.view, "coordsAtPos").mockImplementation(pos => ({
      left: pos * 10, right: pos * 10, top: 100, bottom: 120
    }));
    mountFormatBar(pillEl, jot.editor, jot.linkPopover);
  });

  afterEach(() => {
    jot.editor.destroy();
    mount.remove();
    pillEl.remove();
    vi.restoreAllMocks();
  });

  it("is hidden until text is selected", () => {
    expect(pillEl.hidden).toBe(true);
    jot.editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(pillEl.hidden).toBe(false);
    jot.editor.commands.setTextSelection(3);
    expect(pillEl.hidden).toBe(true);
  });

  it("follows the selection", () => {
    jot.editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(pillEl.style.left).toBe("35px");
    jot.editor.commands.setTextSelection({ from: 3, to: 8 });
    expect(pillEl.style.left).toBe("55px");
  });

  it("formats the selection without losing it", () => {
    jot.editor.commands.setTextSelection({ from: 1, to: 6 });
    pillEl.querySelector<HTMLButtonElement>('[aria-label="Bold"]')!.click();
    expect(jot.editor.getHTML()).toContain("<strong>hello</strong>");
    expect(pillEl.hidden).toBe(false);
  });
});
