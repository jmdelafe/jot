import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type JotEditor } from "../src/editor";
import { renderedDocument, withRenderedMarkdown } from "../src/liveMarkdown";
import { mountFormatBar } from "../src/formatBar";

vi.mock("../src/bridge", () => ({
  bridge: { ready: vi.fn(), contentChanged: vi.fn(), openLink: vi.fn() }
}));
import { bridge } from "../src/bridge";

describe("active Markdown editing", () => {
  let jot: JotEditor;
  let mount: HTMLDivElement;

  beforeEach(() => {
    mount = document.createElement("div");
    document.body.appendChild(mount);
    jot = createEditor(mount);
    jot.loadNote({ id: "note-1", document: { type: "doc", content: [{ type: "paragraph" }] } });
    vi.clearAllMocks();
  });

  afterEach(() => {
    jot.editor.destroy();
    mount.remove();
  });

  function focus(position: number): void {
    jot.editor.commands.setTextSelection(position);
    jot.editor.view.dom.dispatchEvent(new FocusEvent("focus"));
  }

  function blur(): void {
    jot.editor.view.dom.dispatchEvent(new FocusEvent("blur"));
  }

  it("reveals a heading's editable markers and preserves the caret", () => {
    jot.editor.commands.setContent("<h3>Hello</h3><p>Next</p>");
    focus(3);
    expect(jot.editor.state.doc.firstChild!.type.name).toBe("markdownSource");
    expect(jot.editor.state.doc.firstChild!.textContent).toBe("### Hello");
    expect(jot.editor.state.selection.from).toBe(7);
    expect(renderedDocument(jot.editor).firstChild!.type.name).toBe("heading");
    blur();
    expect(jot.editor.state.doc.firstChild!.type.name).toBe("heading");
    expect(jot.editor.state.selection.from).toBe(3);
  });

  it("parses edited Markdown, saves rich JSON, and renders when leaving the line", () => {
    jot.editor.commands.setContent("<h3>Hello</h3><p>Next</p>");
    focus(3);
    jot.editor.view.dispatch(jot.editor.state.tr.insertText("## Edited **text**", 1, 10));
    const rendered = renderedDocument(jot.editor);
    expect(rendered.firstChild!.attrs.level).toBe(2);
    expect(rendered.firstChild!.textContent).toBe("Edited text");
    expect(rendered.firstChild!.lastChild!.marks[0].type.name).toBe("bold");
    expect(bridge.contentChanged).toHaveBeenLastCalledWith("note-1", rendered.toJSON());
    jot.editor.commands.setTextSelection(jot.editor.state.doc.firstChild!.nodeSize + 1);
    expect(jot.editor.state.doc.firstChild!.type.name).toBe("heading");
    expect(jot.editor.state.doc.firstChild!.attrs.level).toBe(2);
  });

  it("keeps empty task items as tasks after editing their Markdown", () => {
    jot.editor.commands.setContent(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul><p>Next</p>'
    );
    focus(3);
    expect(jot.editor.state.doc.firstChild!.textContent).toBe("- [ ] ");
    jot.editor.view.dispatch(jot.editor.state.tr.insertText("- [ ]\n- [x]\n- [ ] Task", 1, 7));
    const list = renderedDocument(jot.editor).firstChild!;
    expect(list.type.name).toBe("taskList");
    expect(list.childCount).toBe(3);
    expect(list.child(0).textContent).toBe("");
    expect(list.child(1).attrs.checked).toBe(true);
    expect(list.child(2).textContent).toBe("Task");
  });

  it("reveals inline formatting even if the paragraph starts with plain text", () => {
    jot.editor.commands.setContent("<p>Hello <strong>world</strong></p><p>Next</p>");
    focus(9);
    expect(jot.editor.state.doc.firstChild!.textContent).toBe("Hello **world**");
    blur();
    expect(jot.editor.getHTML()).toContain("<strong>world</strong>");
  });

  it.each([
    ["<blockquote><p>Quote</p></blockquote>", "> Quote"],
    ["<ul><li><p>Item</p></li></ul>", "- Item"],
    ['<pre><code class="language-swift">let a = 1</code></pre>', "```swift\nlet a = 1\n```"],
    ['<p><a href="https://example.com">Link</a></p>', "[Link](https://example.com)"]
  ])("round-trips supported block and inline formatting: %s", (html, source) => {
    jot.editor.commands.setContent(html);
    const original = jot.editor.getJSON();
    focus(1);
    expect(jot.editor.state.doc.firstChild!.textContent).toBe(source);
    blur();
    expect(jot.editor.getJSON()).toEqual(original);
  });

  it("renders the old active block and reveals the new one", () => {
    jot.editor.commands.setContent("<h3>One</h3><h2>Two</h2>");
    focus(2);
    jot.editor.commands.setTextSelection(jot.editor.state.doc.firstChild!.nodeSize + 2);
    expect(jot.editor.state.doc.child(0).type.name).toBe("heading");
    expect(jot.editor.state.doc.child(1).textContent).toBe("## Two");
  });

  it("allows toolbar formatting commands while source is active", () => {
    jot.editor.commands.setContent("<h3>Hello</h3>");
    focus(2);
    withRenderedMarkdown(jot.editor, () => jot.editor.commands.toggleHeading({ level: 2 }));
    expect(jot.editor.state.doc.firstChild!.textContent).toBe("## Hello");
    expect(renderedDocument(jot.editor).firstChild!.attrs.level).toBe(2);
  });

  it("keeps a plain paragraph editable without syntax and supports Enter after a heading", () => {
    jot.editor.commands.setContent("<h3>Hello</h3>");
    focus(6);
    jot.editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(jot.editor.state.doc.firstChild!.type.name).toBe("heading");
    expect(jot.editor.state.doc.lastChild!.type.name).toBe("paragraph");
    expect(jot.editor.state.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("retains edits through undo and redo", () => {
    jot.editor.chain().setContent("<h3>Hello</h3>", { emitUpdate: false }).setMeta("addToHistory", false).run();
    focus(6);
    jot.editor.commands.insertContent("!");
    expect(renderedDocument(jot.editor).firstChild!.textContent).toBe("Hello!");
    jot.editor.commands.undo();
    expect(renderedDocument(jot.editor).firstChild!.textContent).toBe("Hello");
    jot.editor.commands.redo();
    expect(renderedDocument(jot.editor).firstChild!.textContent).toBe("Hello!");
    blur();
    jot.editor.commands.undo();
    expect(renderedDocument(jot.editor).firstChild!.textContent).toBe("Hello");
  });

  it("can remove heading and inline markers without losing text", () => {
    jot.editor.commands.setContent("<h3>Hello</h3>");
    focus(6);
    jot.editor.view.dispatch(jot.editor.state.tr.insertText("Hello", 1, 10));
    blur();
    expect(jot.editor.state.doc.firstChild!.type.name).toBe("paragraph");
    expect(jot.editor.state.doc.firstChild!.textContent).toBe("Hello");
  });

  it("keeps toolbar state and selected-text formatting in sync with source", () => {
    const toolbar = document.createElement("div");
    mount.appendChild(toolbar);
    mountFormatBar(toolbar, jot.editor, jot.linkPopover);
    jot.editor.commands.setContent("<h3>Hello</h3>");
    focus(2);
    expect(toolbar.querySelector('[aria-label="Heading 3"]')!.classList.contains("is-active")).toBe(true);
    jot.editor.commands.setTextSelection({ from: 5, to: 10 });
    toolbar.querySelector<HTMLButtonElement>('[aria-label="Bold"]')!.click();
    expect(jot.editor.state.doc.firstChild!.textContent).toBe("### **Hello**");
    expect(toolbar.querySelector('[aria-label="Bold"]')!.classList.contains("is-active")).toBe(true);
    blur();
    expect(jot.editor.getHTML()).toContain("<strong>Hello</strong>");
  });

  it("edits a link through the shared dialog while Markdown is active", async () => {
    jot.editor.commands.setContent('<p><a href="https://example.com">Link</a></p>');
    focus(2);
    jot.linkPopover.open(jot.editor);
    await Promise.resolve();
    blur();
    const input = document.querySelector<HTMLInputElement>('[aria-label="Link URL"]')!;
    expect(input.value).toBe("https://example.com");
    input.value = "https://example.org";
    document.querySelector<HTMLButtonElement>(".jot-link-popover button")!.click();
    expect(renderedDocument(jot.editor).firstChild!.firstChild!.marks[0].attrs.href).toBe("https://example.org");
  });

  it("splits a list item on Enter instead of adding a paragraph inside it", () => {
    jot.editor.commands.setContent("<ul><li><p>Item</p></li></ul>");
    focus(7);
    jot.editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(renderedDocument(jot.editor).firstChild!.childCount).toBe(2);
  });

  it("loads persisted JSON without presentation nodes or stale undo history", () => {
    jot.editor.commands.setContent("<h3>Hello</h3>");
    focus(6);
    jot.editor.view.dispatch(jot.editor.state.tr.insertText("!"));
    const saved = renderedDocument(jot.editor).toJSON();
    jot.loadNote({ id: "note-1", document: saved as never });
    expect(renderedDocument(jot.editor).toJSON()).toEqual(saved);
    expect(jot.editor.commands.undo()).toBe(false);
  });

  it("handles Markdown input rules and Backspace while keeping markers editable", () => {
    focus(1);
    jot.editor.view.dispatch(jot.editor.state.tr.insertText("###"));
    let handled = false;
    jot.editor.view.someProp("handleTextInput", handler => {
      handled = handler(jot.editor.view, 4, 4, " ", () => jot.editor.state.tr.insertText(" ")) === true;
      return handled;
    });
    expect(handled).toBe(true);
    expect(jot.editor.state.doc.firstChild!.textContent).toBe("### ");
    expect(jot.editor.state.selection.from).toBe(5);
    expect(() => {
      jot.editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    }).not.toThrow();
  });

  it("preserves a toggled typing style at a collapsed caret inside a heading", () => {
    jot.editor.commands.setContent("<h3>Hello</h3>");
    focus(6);
    withRenderedMarkdown(jot.editor, () => jot.editor.commands.toggleBold());
    expect(jot.editor.state.doc.firstChild!.textContent).toBe("### Hello****");
    jot.editor.view.dispatch(jot.editor.state.tr.insertText("bold"));
    expect(renderedDocument(jot.editor).firstChild!.lastChild!.marks[0].type.name).toBe("bold");
    expect(renderedDocument(jot.editor).firstChild!.lastChild!.textContent).toBe("bold");
  });

  it("can turn a typing style off inside marked text", () => {
    jot.editor.commands.setContent("<h3><strong>Hello</strong></h3>");
    focus(3);
    withRenderedMarkdown(jot.editor, () => jot.editor.commands.toggleBold());
    jot.editor.view.dispatch(jot.editor.state.tr.insertText("!"));
    const rendered = renderedDocument(jot.editor);
    expect(rendered.firstChild!.textContent).toBe("He!llo");
    expect(rendered.firstChild!.child(1).textContent).toBe("!");
    expect(rendered.firstChild!.child(1).marks).toHaveLength(0);
  });

  it("can toggle a pending typing style off before entering text", () => {
    jot.editor.commands.setContent("<h3>Hello</h3>");
    focus(6);
    withRenderedMarkdown(jot.editor, () => jot.editor.commands.toggleBold());
    expect(jot.editor.state.doc.firstChild!.textContent).toBe("### Hello****");
    withRenderedMarkdown(jot.editor, () => jot.editor.commands.toggleBold());
    expect(jot.editor.state.doc.firstChild!.textContent).toBe("### Hello");
  });
});
