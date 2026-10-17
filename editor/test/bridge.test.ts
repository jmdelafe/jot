import { describe, expect, it, beforeEach, vi } from "vitest";
import { bridge } from "../src/bridge";

describe("bridge", () => {
  beforeEach(() => {
    delete (window as unknown as { webkit?: unknown }).webkit;
  });

  it("posts messages through the WKWebView message handler when present", () => {
    const postMessage = vi.fn();
    (window as unknown as { webkit: unknown }).webkit = {
      messageHandlers: { jot: { postMessage } }
    };

    bridge.ready();
    expect(postMessage).toHaveBeenCalledWith({ type: "ready" });

    bridge.openLink("https://example.com");
    expect(postMessage).toHaveBeenCalledWith({ type: "openLink", url: "https://example.com" });

    const doc = { type: "doc", content: [] };
    bridge.contentChanged("note-1", doc);
    expect(postMessage).toHaveBeenCalledWith({ type: "contentChanged", noteId: "note-1", document: doc });

    bridge.setPinned("note-1", true);
    expect(postMessage).toHaveBeenCalledWith({ type: "setPinned", id: "note-1", pinned: true });

    bridge.exportNote("markdown", "# Hi");
    expect(postMessage).toHaveBeenCalledWith({ type: "exportNote", format: "markdown", text: "# Hi" });

    bridge.preferredHeight(240);
    expect(postMessage).toHaveBeenCalledWith({ type: "preferredHeight", height: 240 });
  });

  it("does not throw when no native bridge is present", () => {
    expect(() => bridge.ready()).not.toThrow();
    expect(() => bridge.openLink("https://example.com")).not.toThrow();
  });
});
