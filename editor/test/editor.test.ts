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

  it("loadNote replaces content without emitting a bridge update", () => {
    const jotEditor = createEditor(mount);
    vi.clearAllMocks();

    jotEditor.loadNote({
      id: "note-1",
      document: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "restored" }] }] }
    });

    expect(jotEditor.noteId).toBe("note-1");
    expect(jotEditor.editor.getText()).toBe("restored");
    expect(jotEditor.editor.state.selection.from).toBe("restored".length + 1);
    expect(bridge.contentChanged).not.toHaveBeenCalled();
    jotEditor.editor.destroy();
  });

  it("tags content changes with the loaded note id and stays silent before one is loaded", () => {
    const jotEditor = createEditor(mount);
    jotEditor.editor.commands.insertContent("orphan");
    expect(bridge.contentChanged).not.toHaveBeenCalled();

    jotEditor.loadNote({ id: "note-2", document: { type: "doc", content: [{ type: "paragraph" }] } });
    jotEditor.editor.commands.insertContent("typed");
    expect(bridge.contentChanged).toHaveBeenLastCalledWith("note-2", expect.objectContaining({ type: "doc" }));
    jotEditor.editor.destroy();
  });

  it("serializes notes as Markdown, HTML and plain text", () => {
    const jotEditor = createEditor(mount);
    jotEditor.loadNote({
      id: "note-3",
      document: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
          { type: "paragraph", content: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }] }
        ]
      }
    });

    expect(jotEditor.serialize("markdown")).toBe("# Title\n\n**bold**");
    expect(jotEditor.serialize("html")).toBe("<h1>Title</h1><p><strong>bold</strong></p>");
    expect(jotEditor.serialize("plainText")).toBe("Title\nbold");
    jotEditor.editor.destroy();
  });
});
