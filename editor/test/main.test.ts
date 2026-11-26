import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type JotEditor } from "../src/editor";

vi.mock("../src/editor", async importOriginal => {
  const original = await importOriginal<typeof import("../src/editor")>();
  return { ...original, createEditor: vi.fn(original.createEditor) };
});
vi.mock("../src/autosize", () => ({
  installAutosize: () => ({ schedule: vi.fn() })
}));
vi.mock("../src/formatBar", () => ({ mountFormatBar: vi.fn() }));

describe("clipboard shortcuts", () => {
  const postMessage = vi.fn();
  let jot: JotEditor;
  let toast: HTMLElement;

  beforeAll(async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="editor"></div><div id="format-bar"></div>';
    window.webkit = { messageHandlers: { jot: { postMessage } } };
    await import("../src/main");
    jot = vi.mocked(createEditor).mock.results[0].value;
    toast = document.querySelector<HTMLElement>(".jot-toast")!;
  });

  beforeEach(() => {
    window.jot.loadNote(JSON.stringify({
      id: "note-1",
      document: { type: "doc", content: [{ type: "paragraph" }] }
    }));
    toast.hidden = true;
    postMessage.mockClear();
  });

  afterAll(() => {
    jot.editor.destroy();
    delete window.webkit;
    vi.useRealTimers();
  });

  function key(key: string, shiftKey = false, target: HTMLElement = jot.editor.view.dom): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      key, metaKey: true, shiftKey, bubbles: true, cancelable: true
    });
    target.dispatchEvent(event);
    return event;
  }

  it("shows the copy confirmation for Command-C after the clipboard write succeeds", () => {
    jot.editor.commands.setContent("<p><strong>bold</strong></p>");
    jot.editor.commands.setTextSelection({ from: 1, to: 5 });
    expect(key("c").defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "copyText", text: "bold" });
    expect(toast.hidden).toBe(true);

    window.jot.clipboardCopied();
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe("Copied to Clipboard");
    vi.advanceTimersByTime(1400);
    expect(toast.hidden).toBe(true);
  });

  it("does not claim to copy an empty selection", () => {
    expect(key("c").defaultPrevented).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
    expect(toast.hidden).toBe(true);
  });

  it("still uses rich copy and the same confirmation for Shift-Command-C", () => {
    jot.editor.commands.setContent("<p><strong>bold</strong></p>");
    expect(key("C", true).defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({
      type: "copyRichText", html: "<p><strong>bold</strong></p>", text: "bold"
    });
    window.jot.clipboardCopied();
    expect(toast.hidden).toBe(false);
  });

  it("requests and inserts formatted clipboard content for Shift-Command-V", () => {
    expect(key("V", true).defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "pasteRichText", noteId: "note-1" });
    window.jot.pasteRichText(JSON.stringify({
      noteId: "note-1", html: "<p><strong>bold</strong></p>", text: "bold"
    }));
    expect(jot.serialize("html")).toBe("<p><strong>bold</strong></p>");
  });

  it("leaves Command-V to the native paste action and plain-paste handler", () => {
    expect(key("v").defaultPrevented).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("does not hijack clipboard shortcuts in text inputs", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(key("V", true, input).defaultPrevented).toBe(false);
    expect(key("c", false, input).defaultPrevented).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
    input.remove();
  });

  it("ignores a clipboard response for a note the user has left", () => {
    window.jot.pasteRichText(JSON.stringify({
      noteId: "old-note", html: "<p><strong>bold</strong></p>", text: "bold"
    }));
    expect(jot.serialize("plainText")).toBe("");
  });

  it("opens find with Command-F and steps matches with Command-G", () => {
    jot.editor.commands.setContent("<p>one One</p>");
    jot.editor.commands.setTextSelection(1);
    expect(key("f").defaultPrevented).toBe(true);
    const bar = document.querySelector<HTMLElement>(".jot-find-bar")!;
    const input = bar.querySelector("input")!;
    expect(bar.hidden).toBe(false);
    expect(document.activeElement).toBe(input);
    input.value = "one";
    input.dispatchEvent(new Event("input"));
    expect(bar.querySelector(".jot-find-count")!.textContent).toBe("1 of 2");
    expect(key("g", false, input).defaultPrevented).toBe(true);
    expect(bar.querySelector(".jot-find-count")!.textContent).toBe("2 of 2");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(bar.hidden).toBe(true);
  });
});
