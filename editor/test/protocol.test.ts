import { describe, expect, it } from "vitest";
import { isOutboundMessage } from "../src/protocol";

describe("isOutboundMessage", () => {
  it("accepts a ready message", () => {
    expect(isOutboundMessage({ type: "ready" })).toBe(true);
  });

  it("accepts a contentChanged message with a document payload", () => {
    expect(
      isOutboundMessage({ type: "contentChanged", document: { type: "doc", content: [] } })
    ).toBe(true);
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

  it("rejects unknown message types", () => {
    expect(isOutboundMessage({ type: "somethingElse" })).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isOutboundMessage(null)).toBe(false);
    expect(isOutboundMessage("ready")).toBe(false);
    expect(isOutboundMessage(42)).toBe(false);
  });
});
