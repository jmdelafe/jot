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
    bridge.contentChanged(doc);
    expect(postMessage).toHaveBeenCalledWith({ type: "contentChanged", document: doc });
  });

  it("does not throw when no native bridge is present", () => {
    expect(() => bridge.ready()).not.toThrow();
    expect(() => bridge.openLink("https://example.com")).not.toThrow();
  });
});
