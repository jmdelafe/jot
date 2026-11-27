import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOMParser } from "@tiptap/pm/model";
import { createEditor, type JotEditor } from "../src/editor";
import { renderedDocument, renderedState } from "../src/liveMarkdown";
import { bridge } from "../src/bridge";

vi.mock("../src/bridge", () => ({
  bridge: { ready: vi.fn(), contentChanged: vi.fn(), openLink: vi.fn() }
}));

const playbill = `## The Moonbeam Puppet Show



**Cast:** 🌙 Luna · 🦊 Fig · 🐇 Pip



The curtain rises when Pip rings the brass bell.



### The moon garden



**Props**

- A paper telescope

- A silver watering can

- A basket of stars

  - 🌟 Hide the brightest star under the lid.



**Stage direction:** Fig tips the basket toward the audience.



### The teacup sea



- 🌊 **Waves:** Unroll the blue ribbon.

- ⛵ **Boat:** Fold the paper map.

- 🔔 **Sound cue**

  - 🎵 Ring the bell when the boat docks.



**Final cue:** Call \`encore\` from behind the curtain.



> [!NOTE]

> The moon takes the last bow.


`;

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

  it("renders inline Markdown without autolinking bare URLs", () => {
    jot.editor.commands.setContent("<p></p>");
    jot.editor.commands.setTextSelection(1);
    paste({ "text/plain": "**bold** https://example.com " });
    expect(jot.serialize("html")).toBe("<p><strong>bold</strong> https://example.com </p>");
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

  it("renders pasted Markdown while a block shows its source", () => {
    jot.editor.commands.setContent("<h3>Hello</h3><p>Next</p>");
    jot.editor.commands.setTextSelection(3);
    jot.editor.view.dom.dispatchEvent(new FocusEvent("focus"));
    expect(jot.editor.state.doc.firstChild!.type.name).toBe("markdownSource");

    paste({ "text/plain": "**x**" });

    const heading = renderedDocument(jot.editor).firstChild!;
    expect(heading.type.name).toBe("heading");
    expect(heading.textContent).toBe("Hexllo");
    expect(heading.child(1).marks[0].type.name).toBe("bold");
    expect(jot.editor.state.doc.firstChild!.type.name).toBe("markdownSource");
    expect(renderedState(jot.editor).selection.from).toBe(4);
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

  it("strips resource-loading HTML before parsing a formatted paste", () => {
    const parser = DOMParser.fromSchema(jot.editor.schema);
    const parseSlice = vi.spyOn(parser, "parseSlice");
    const fromSchema = vi.spyOn(DOMParser, "fromSchema").mockReturnValue(parser);
    try {
      jot.pasteFormatted({
        html: '<p><img src="https://example.com/image"><iframe src="https://example.com"></iframe><a href="https://example.com" ping="https://example.com">link</a><span style="background:url(https://example.com)">styled</span></p>',
        text: "link styled"
      });

      const container = parseSlice.mock.calls[0][0] as HTMLElement;
      expect(container.querySelector("img, iframe")).toBeNull();
      expect(container.querySelector("[src], [ping], [style]")).toBeNull();
      expect(container.querySelector('a[href="https://example.com"]')).not.toBeNull();
    } finally {
      fromSchema.mockRestore();
      parseSlice.mockRestore();
    }
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

  it("falls back to Markdown without HTML", () => {
    jot.pasteFormatted({ html: null, text: "**bold**\nhttps://example.com " });
    expect(jot.serialize("html")).toBe("<p><strong>bold</strong> https://example.com </p>");
  });

  it("preserves spaces around inline Markdown when replacing text inside a paragraph", () => {
    jot.editor.commands.setContent("<p>beforeXafter</p>");
    jot.editor.commands.setTextSelection({ from: 7, to: 8 });
    paste({ "text/plain": " **bold** " });
    expect(jot.serialize("html")).toBe("<p>before <strong>bold</strong> after</p>");
    jot.editor.commands.undo();
    expect(jot.serialize("html")).toBe("<p>beforeXafter</p>");
  });

  it.each(["normal", "formatted"] as const)("renders the playbill on a %s paste and persists it", mode => {
    vi.mocked(bridge.contentChanged).mockClear();
    jot.editor.view.dom.dispatchEvent(new FocusEvent("focus"));
    if (mode === "normal") paste({ "text/plain": playbill });
    else jot.pasteFormatted({ html: null, text: playbill });

    const html = jot.serialize("html");
    const content = document.createElement("div");
    content.innerHTML = html;
    expect(content.querySelector("h2")?.textContent).toBe("The Moonbeam Puppet Show");
    expect(Array.from(content.querySelectorAll("h3"), node => node.textContent)).toEqual(["The moon garden", "The teacup sea"]);
    expect(content.querySelector("strong")?.textContent).toBe("Cast:");
    expect(content.querySelectorAll("ul ul")).toHaveLength(2);
    expect(content.querySelector("code")?.textContent).toBe("encore");
    expect(content.querySelectorAll("blockquote")).toHaveLength(2);
    expect(html).toContain("The moon takes the last bow.");
    expect(html).not.toContain("markdown-source");
    expect(bridge.contentChanged).toHaveBeenLastCalledWith("note-1", renderedDocument(jot.editor).toJSON());

    jot.editor.commands.undo();
    expect(jot.serialize("html")).toBe("<p></p>");
    jot.editor.commands.redo();
    expect(jot.serialize("html")).toBe(html);
    jot.loadNote({ id: "note-1", document: renderedDocument(jot.editor).toJSON() });
    expect(jot.serialize("html")).toBe(html);
  });

  it("renders lists, tasks, links and fences without interpreting HTML or loading resources", () => {
    const parse = vi.spyOn(jot.editor.storage.markdown.parser, "parse");
    paste({ "text/plain": "- [x] done\n- [ ] pending\n\n[site](https://example.com)\n\n```txt\n**literal**\n```\n\n**safe** <img src=\"https://example.com/image\"> ![image](https://example.com/image)" });
    expect(parse.mock.results[0].value).not.toContain("<img");
    parse.mockRestore();
    const html = jot.serialize("html");
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<code class=\"language-txt\">**literal**</code>");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    // Clipboard-only parser options must not affect stored HTML or later editing.
    jot.editor.commands.setContent("<h2>Still formatted</h2>");
    expect(jot.serialize("html")).toBe("<h2>Still formatted</h2>");
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
