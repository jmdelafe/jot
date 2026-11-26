import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEditor, type JotEditor } from "../src/editor";
import { FindBar, findMatches, findState } from "../src/findInNote";

describe("find in note", () => {
  let jot: JotEditor;
  let mount: HTMLDivElement;
  let findBar: FindBar;

  beforeEach(() => {
    mount = document.createElement("div");
    document.body.appendChild(mount);
    jot = createEditor(mount);
    jot.loadNote({ id: "note-1", document: { type: "doc", content: [{ type: "paragraph" }] } });
    findBar = new FindBar(jot.editor);
  });

  afterEach(() => {
    findBar.destroy();
    jot.editor.destroy();
    mount.remove();
  });

  const input = () => document.querySelector<HTMLInputElement>(".jot-find-bar input")!;
  const count = () => document.querySelector<HTMLElement>(".jot-find-count")!.textContent;
  const type = (value: string) => {
    input().value = value;
    input().dispatchEvent(new Event("input"));
  };
  const press = (key: string, shiftKey = false) =>
    input().dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
  const selected = () => {
    const { from, to } = jot.editor.state.selection;
    return jot.editor.state.doc.textBetween(from, to);
  };

  it("matches exact text case-insensitively, across marks but not across blocks", () => {
    jot.editor.commands.setContent("<p>Hello <strong>wor</strong>ld</p><p>HELLO</p><p>hel</p><p>lo</p>");
    const matches = findMatches(jot.editor.state.doc, "hello");
    expect(matches.map(({ from, to }) => jot.editor.state.doc.textBetween(from, to))).toEqual(["Hello", "HELLO"]);
    expect(findMatches(jot.editor.state.doc, "o wORl")).toHaveLength(1);
    expect(findMatches(jot.editor.state.doc, "h.llo")).toHaveLength(0);
    expect(findMatches(jot.editor.state.doc, "")).toHaveLength(0);
  });

  it("highlights matches and steps through them with Enter and Shift-Enter", () => {
    jot.editor.commands.setContent("<p>cat Cat</p><p>CAT</p>");
    jot.editor.commands.setTextSelection(1);
    findBar.open();
    type("cat");
    expect(count()).toBe("1 of 3");
    expect(mount.querySelectorAll(".jot-find-match")).toHaveLength(3);
    expect(mount.querySelectorAll(".jot-find-match-current")).toHaveLength(1);
    expect(selected()).toBe("cat");

    press("Enter");
    expect(count()).toBe("2 of 3");
    expect(selected()).toBe("Cat");
    press("Enter");
    press("Enter");
    expect(count()).toBe("1 of 3");
    press("Enter", true);
    expect(count()).toBe("3 of 3");
    expect(selected()).toBe("CAT");

    type("dog");
    expect(count()).toBe("No matches");
    expect(mount.querySelectorAll(".jot-find-match")).toHaveLength(0);
  });

  it("updates matches as the note changes and clears them on Escape", () => {
    jot.editor.commands.setContent("<p>one</p>");
    findBar.open();
    type("one");
    expect(count()).toBe("1 of 1");
    jot.editor.commands.insertContentAt(jot.editor.state.doc.content.size, "<p>one</p>");
    expect(count()).toBe("1 of 2");

    press("Escape");
    expect(findBar.isOpen).toBe(false);
    expect(findState(jot.editor.state)?.matches).toHaveLength(0);
    expect(mount.querySelectorAll(".jot-find-match")).toHaveLength(0);
  });
});
