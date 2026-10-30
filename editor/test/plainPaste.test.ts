import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type JotEditor } from "../src/editor";
import { renderedDocument, renderedState } from "../src/liveMarkdown";

vi.mock("../src/bridge", () => ({
  bridge: { ready: vi.fn(), contentChanged: vi.fn(), openLink: vi.fn() }
}));

describe("clipboard paste", () => {
  let jot: JotEditor;
  let mount: HTMLDivElement;

  beforeEach(() => {
    mount = document.createElement("div");
    document.body.appendChild(mount);
    jot = createEditor(mount);
    jot.loadNote({ id: "note-1", document: { type: "doc", content: [{ type: "paragraph" }] } });
  });

  afterEach(() => {
    jot.editor.destroy();
    mount.remove();
  });

  function paste(data: Record<string, string>): void {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: (type: string) => data[type] ?? "" } });
    jot.editor.view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }

  it("drops clipboard formatting", () => {
    jot.editor.commands.setContent("<p>x</p>");
    jot.editor.commands.setTextSelection(2);
    paste({ "text/html": "<h1>Big <em>news</em></h1>", "text/plain": "Big news" });
    expect(jot.editor.getHTML()).toBe("<p>xBig news</p>");
  });

  it("matches the style at the caret", () => {
    jot.editor.commands.setContent("<p><strong>bold</strong></p>");
    jot.editor.commands.setTextSelection(3);
    paste({ "text/plain": "er" });
    expect(jot.editor.getHTML()).toBe("<p><strong>boerld</strong></p>");
  });

  it("keeps Markdown syntax and URLs literal", () => {
    jot.editor.commands.setContent("<p></p>");
    jot.editor.commands.setTextSelection(1);
    paste({ "text/plain": "**bold** https://example.com " });
    expect(jot.editor.getHTML()).toBe("<p>**bold** https://example.com </p>");
  });

  it("splits lines into paragraphs, keeping blank lines", () => {
    jot.editor.commands.setContent("<p>ab</p>");
    jot.editor.commands.setTextSelection(2);
    paste({ "text/plain": "one\r\n\ntwo" });
    const lines: string[] = [];
    jot.editor.state.doc.forEach(node => lines.push(node.textContent));
    expect(lines).toEqual(["aone", "", "twob"]);
  });

  it("still links selected text when pasting a URL over it", () => {
    jot.editor.commands.setContent("<p>site</p>");
    jot.editor.commands.setTextSelection({ from: 1, to: 5 });
    paste({ "text/plain": "https://example.com" });
    const text = jot.editor.state.doc.firstChild!.firstChild!;
    expect(text.text).toBe("site");
    expect(text.marks[0].attrs.href).toBe("https://example.com");
  });

  it("keeps raw text in code blocks", () => {
    jot.editor.commands.setContent("<pre><code>a</code></pre>");
    jot.editor.commands.setTextSelection(2);
    paste({ "text/plain": "x\ny" });
    expect(jot.editor.state.doc.firstChild!.type.name).toBe("codeBlock");
    expect(jot.editor.state.doc.firstChild!.textContent).toBe("ax\ny");
  });

  it("pastes literally while a block shows its Markdown source", () => {
    jot.editor.commands.setContent("<h3>Hello</h3><p>Next</p>");
    jot.editor.commands.setTextSelection(3);
    jot.editor.view.dom.dispatchEvent(new FocusEvent("focus"));
    expect(jot.editor.state.doc.firstChild!.type.name).toBe("markdownSource");

    paste({ "text/plain": "**x**" });

    const heading = renderedDocument(jot.editor).firstChild!;
    expect(heading.type.name).toBe("heading");
    expect(heading.textContent).toBe("He**x**llo");
    expect(heading.firstChild!.marks).toEqual([]);
    expect(jot.editor.state.doc.firstChild!.type.name).toBe("markdownSource");
    expect(renderedState(jot.editor).selection.from).toBe(8);
  });

  it("preserves supported rich formatting on an explicit formatted paste", () => {
    jot.pasteFormatted({
      html: '<h2>Title</h2><ul><li><p><strong>bold</strong> <em>italic</em> <a href="https://example.com">link</a></p></li></ul>',
      text: "Title\nbold italic link"
    });
    expect(jot.serialize("html")).toContain("<h2>Title</h2><ul><li><p><strong>bold</strong> <em>italic</em>");
    expect(jot.serialize("html")).toContain('href="https://example.com"');
    expect(jot.serialize("html")).not.toContain("markdownSource");
  });

  it("replaces the selection with rich text and can undo it in one step", () => {
    jot.editor.commands.setContent("<p>before</p>");
    jot.editor.commands.setTextSelection({ from: 1, to: 7 });
    jot.pasteFormatted({ html: "<p><strong>after</strong></p>", text: "after" });
    expect(jot.serialize("html")).toBe("<p><strong>after</strong></p>");
    jot.editor.commands.undo();
    expect(jot.serialize("html")).toBe("<p>before</p>");
    jot.editor.commands.redo();
    expect(jot.serialize("html")).toBe("<p><strong>after</strong></p>");
  });

  it("retains formatting when pasting into a focused Markdown source block", () => {
    jot.editor.commands.setContent("<h3>Hello</h3>");
    jot.editor.commands.setTextSelection(3);
    jot.editor.view.dom.dispatchEvent(new FocusEvent("focus"));
    jot.pasteFormatted({ html: "<p><em>new</em></p>", text: "new" });
    expect(jot.serialize("html")).toBe("<h3>He<em>new</em>llo</h3>");
    jot.editor.commands.undo();
    expect(jot.serialize("html")).toBe("<h3>Hello</h3>");
  });

  it("falls back to literal plain text without HTML", () => {
    jot.pasteFormatted({ html: null, text: "**bold**\nhttps://example.com " });
    expect(jot.serialize("html")).toBe("<p>**bold**</p><p>https://example.com </p>");
  });

  it("keeps code blocks plain even on a formatted paste", () => {
    jot.editor.commands.setContent("<pre><code>a</code></pre>");
    jot.editor.commands.setTextSelection(2);
    jot.editor.view.dom.dispatchEvent(new FocusEvent("focus"));
    jot.pasteFormatted({ html: "<p><strong>x</strong></p><p>y</p>", text: "x\ny" });
    expect(jot.serialize("html")).toBe("<pre><code>ax\ny</code></pre>");
  });

  it("keeps subsequent normal pastes plain after a formatted paste", () => {
    jot.pasteFormatted({ html: "<p><strong>bold</strong></p>", text: "bold" });
    jot.editor.commands.setContent("<p></p>");
    paste({ "text/html": "<p><em>plain</em></p>", "text/plain": "plain" });
    expect(jot.serialize("html")).toBe("<p>plain</p>");
  });

  it("imports the HTML produced from a native RTF clipboard", () => {
    jot.pasteFormatted({
      html: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title></title>
<meta name="Generator" content="Cocoa HTML Writer" />
</head>
<body>
<p style="margin: 0.0px 0.0px 12.0px 0.0px"><font face="Times" size="3" style="font: 12.0px Times"><b>Bold</b> <i>italic</i> <u>underlined</u> <s>struck</s></font></p>
</body>
</html>`,
      text: "Bold italic underlined struck"
    });
    expect(jot.serialize("html")).toBe("<p><strong>Bold</strong> <em>italic</em> <u>underlined</u> <s>struck</s></p>");
  });

  it("extracts text from HTML-only clipboards when pasting into code", () => {
    jot.editor.commands.setContent("<pre><code>a</code></pre>");
    jot.editor.commands.setTextSelection(2);
    jot.pasteFormatted({ html: "<p><strong>x</strong></p><p>y</p>", text: "" });
    expect(jot.serialize("html")).toBe("<pre><code>ax\ny</code></pre>");
  });

  it("does not delete the selection for clipboard HTML with no supported content", () => {
    jot.editor.commands.setContent("<p>keep</p>");
    jot.editor.commands.setTextSelection({ from: 1, to: 5 });
    jot.pasteFormatted({ html: "<!-- Empty clipboard fragment -->", text: "" });
    expect(jot.serialize("html")).toBe("<p>keep</p>");
  });
});
