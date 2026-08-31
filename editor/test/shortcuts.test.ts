import { describe, expect, it, vi } from "vitest";
import { createShortcutsExtension } from "../src/shortcuts";

describe("createShortcutsExtension", () => {
  it("maps Mod-Shift-9 to toggling the task list", () => {
    const toggleTaskList = vi.fn(() => true);
    const fakeEditor = { commands: { toggleTaskList } };
    const extension = createShortcutsExtension(() => true);
    const shortcuts = extension.config.addKeyboardShortcuts?.call({
      editor: fakeEditor
    } as never);

    expect(shortcuts).toBeDefined();
    shortcuts?.["Mod-Shift-9"]?.({} as never);
    expect(toggleTaskList).toHaveBeenCalledTimes(1);
  });

  it("maps Mod-l to the supplied link editor opener", () => {
    const openLinkEditor = vi.fn(() => true);
    const extension = createShortcutsExtension(openLinkEditor);
    const shortcuts = extension.config.addKeyboardShortcuts?.call({
      editor: { commands: {} }
    } as never);

    shortcuts?.["Mod-l"]?.({} as never);
    expect(openLinkEditor).toHaveBeenCalledTimes(1);
  });
});
