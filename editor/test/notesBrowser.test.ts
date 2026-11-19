import { describe, expect, it, vi, afterEach } from "vitest";
import { noteItems, notesMode, relativeTime } from "../src/notesBrowser";
import { Palette, matchesQuery } from "../src/palette";
import type { NotesPayload } from "../src/protocol";

const NOW = 1_700_000_000_000;
const payload: NotesPayload = {
  currentId: "a",
  notes: [
    { id: "p", title: "Daily Todos", searchText: "Daily Todos\nmilk", pinned: true, openedAt: NOW - 40 * 60_000, deletedAt: null },
    { id: "a", title: "Stay in flow", searchText: "Stay in flow", pinned: false, openedAt: NOW, deletedAt: null },
    { id: "d", title: "Old idea", searchText: "Old idea", pinned: false, openedAt: NOW, deletedAt: NOW - 3 * 86_400_000 }
  ]
};

function actions() {
  return { open: vi.fn(), restore: vi.fn(), remove: vi.fn(), purge: vi.fn(), setPinned: vi.fn() };
}

describe("relativeTime", () => {
  it.each([
    [10_000, "just now"], [5 * 60_000, "5m ago"], [3 * 3_600_000, "3h ago"],
    [2 * 86_400_000, "2d ago"], [21 * 86_400_000, "3w ago"], [70 * 86_400_000, "2mo ago"], [800 * 86_400_000, "2y ago"]
  ])("formats %d ms ago as %s", (delta, expected) => {
    expect(relativeTime(NOW - delta, NOW)).toBe(expected);
  });
});

describe("noteItems", () => {
  it("labels the current note, pinned notes and recently deleted notes", () => {
    const items = noteItems(payload, actions(), NOW);
    expect(items.map(item => [item.title, item.section, item.subtitle])).toEqual([
      ["Daily Todos", "Notes", "Opened 40m ago"],
      ["Stay in flow", "Notes", "Current"],
      ["Old idea", "Recently Deleted", "Deleted 3d ago"]
    ]);
    expect(items[0].leading).toBeTruthy();
    expect(items[1].subtitleAccent).toBe(true);
  });

  it("opens active notes and restores deleted ones", () => {
    const spy = actions();
    const items = noteItems(payload, spy, NOW);
    items[1].run();
    items[2].run();
    expect(spy.open).toHaveBeenCalledWith("a");
    expect(spy.restore).toHaveBeenCalledWith("d");
  });

  it("searches note bodies as well as titles", () => {
    const items = noteItems(payload, actions(), NOW);
    const matches = items.filter(item => matchesQuery("milk", item.title, item.keywords));
    expect(matches.map(item => item.id)).toEqual(["p"]);
    expect(matchesQuery("stay FLOW", "Stay in flow")).toBe(true);
    expect(matchesQuery("stay gone", "Stay in flow")).toBe(false);
  });
});

describe("Palette with the notes mode", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}) {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  }

  it("filters, navigates with arrows and opens the selection with Enter", () => {
    const spy = actions();
    const restoreFocus = vi.fn();
    const palette = new Palette();
    palette.open(notesMode(() => payload, spy), restoreFocus);
    const input = palette.root.querySelector("input")!;
    expect(document.activeElement).toBe(input);
    expect(palette.root.querySelectorAll(".jot-palette-row")).toHaveLength(3);

    input.value = "flow";
    input.dispatchEvent(new Event("input"));
    expect(palette.root.querySelectorAll(".jot-palette-row")).toHaveLength(1);

    input.value = "";
    input.dispatchEvent(new Event("input"));
    press(input, "ArrowDown");
    press(input, "Enter");
    expect(spy.open).toHaveBeenCalledWith("a");
    expect(palette.isOpen).toBe(false);
    expect(restoreFocus).toHaveBeenCalled();
  });

  it("deletes with ⌃X and pins with ⇧⌘P without closing", () => {
    const spy = actions();
    const palette = new Palette();
    palette.open(notesMode(() => payload, spy), () => {});
    const input = palette.root.querySelector("input")!;
    press(input, "x", { ctrlKey: true });
    expect(spy.remove).toHaveBeenCalledWith("p");
    press(input, "P", { metaKey: true, shiftKey: true });
    expect(spy.setPinned).toHaveBeenCalledWith("p", false);
    expect(palette.isOpen).toBe(true);
  });

  it("closes on Escape without letting the key reach the window", () => {
    const palette = new Palette();
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    palette.open(notesMode(() => payload, actions()), () => {});
    press(palette.root.querySelector("input")!, "Escape");
    window.removeEventListener("keydown", onWindowKey);
    expect(palette.isOpen).toBe(false);
    expect(onWindowKey).not.toHaveBeenCalled();
  });
});
