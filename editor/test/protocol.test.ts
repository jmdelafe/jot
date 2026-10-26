import { describe, expect, it } from "vitest";
import { isOutboundMessage } from "../src/protocol";

describe("isOutboundMessage", () => {
  it("accepts a ready message", () => {
    expect(isOutboundMessage({ type: "ready" })).toBe(true);
  });

  it("accepts a contentChanged message with a document payload", () => {
    expect(
      isOutboundMessage({ type: "contentChanged", noteId: "n", document: { type: "doc", content: [] } })
    ).toBe(true);
    expect(isOutboundMessage({ type: "contentChanged", document: {} })).toBe(false);
  });

  it("rejects a contentChanged message missing its document", () => {
    expect(isOutboundMessage({ type: "contentChanged" })).toBe(false);
  });

  it("accepts an openLink message with a string url", () => {
    expect(isOutboundMessage({ type: "openLink", url: "https://example.com" })).toBe(true);
  });

  it("rejects an openLink message with a non-string url", () => {
    expect(isOutboundMessage({ type: "openLink", url: 42 })).toBe(false);
  });

  it("validates note library and utility messages", () => {
    expect(isOutboundMessage({ type: "newNote" })).toBe(true);
    expect(isOutboundMessage({ type: "openNote", id: "n" })).toBe(true);
    expect(isOutboundMessage({ type: "openNote" })).toBe(false);
    expect(isOutboundMessage({ type: "setPinned", id: "n", pinned: true })).toBe(true);
    expect(isOutboundMessage({ type: "setPinned", id: "n" })).toBe(false);
    expect(isOutboundMessage({ type: "copyRichText", html: "<p>x</p>", text: "x" })).toBe(true);
    expect(isOutboundMessage({ type: "copyRichText", html: "<p>x</p>" })).toBe(false);
    expect(isOutboundMessage({ type: "pasteRichText", noteId: "n" })).toBe(true);
    expect(isOutboundMessage({ type: "pasteRichText" })).toBe(false);
    expect(isOutboundMessage({ type: "pasteRichText", noteId: 42 })).toBe(false);
    expect(isOutboundMessage({ type: "exportNote", format: "html", text: "" })).toBe(true);
    expect(isOutboundMessage({ type: "exportNote", format: "pdf", text: "" })).toBe(false);
    expect(isOutboundMessage({ type: "preferredHeight", height: 200 })).toBe(true);
    expect(isOutboundMessage({ type: "preferredHeight", height: -1 })).toBe(false);
  });

  it("rejects unknown message types", () => {
    expect(isOutboundMessage({ type: "somethingElse" })).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isOutboundMessage(null)).toBe(false);
    expect(isOutboundMessage("ready")).toBe(false);
    expect(isOutboundMessage(42)).toBe(false);
  });
});
