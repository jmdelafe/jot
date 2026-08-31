import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createEditor } from "../src/editor";

vi.mock("../src/bridge", () => ({
  bridge: {
    ready: vi.fn(),
    contentChanged: vi.fn(),
    openLink: vi.fn()
  }
}));

import { bridge } from "../src/bridge";

describe("createEditor", () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement("div");
    document.body.appendChild(mount);
    vi.clearAllMocks();
  });

  afterEach(() => {
    mount.remove();
  });

  it("starts with a single empty paragraph and reports readiness", async () => {
    const jotEditor = createEditor(mount);
    expect(jotEditor.editor.getJSON()).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }]
    });
    await vi.waitFor(() => expect(bridge.ready).toHaveBeenCalledTimes(1));
    jotEditor.editor.destroy();
  });

  it("toggles block and inline formatting commands", () => {
    const jotEditor = createEditor(mount);
    const { editor } = jotEditor;
    editor.commands.insertContent("hello");
    editor.commands.selectAll();

    editor.commands.toggleBold();
    expect(editor.isActive("bold")).toBe(true);

    editor.commands.toggleItalic();
    expect(editor.isActive("italic")).toBe(true);

    editor.commands.toggleUnderline();
    expect(editor.isActive("underline")).toBe(true);

    editor.commands.toggleTaskList();
    expect(editor.isActive("taskList")).toBe(true);

    editor.commands.toggleBlockquote();
    expect(editor.isActive("blockquote")).toBe(true);

    editor.destroy();
  });

  it("loadDocument replaces content without emitting a bridge update", () => {
    const jotEditor = createEditor(mount);
    vi.clearAllMocks();

    const replacement = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "restored" }] }]
    });
    jotEditor.loadDocument(replacement);

    expect(jotEditor.editor.getText()).toBe("restored");
    expect(bridge.contentChanged).not.toHaveBeenCalled();
    jotEditor.editor.destroy();
  });

  it("clearDocument resets to an empty document and notifies the bridge", () => {
    const jotEditor = createEditor(mount);
    jotEditor.editor.commands.insertContent("not empty");
    vi.clearAllMocks();

    jotEditor.clearDocument();

    expect(jotEditor.editor.getJSON()).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }]
    });
    expect(bridge.contentChanged).toHaveBeenCalledTimes(1);
    jotEditor.editor.destroy();
  });
});
