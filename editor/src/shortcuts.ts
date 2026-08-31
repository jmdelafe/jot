import { Extension } from "@tiptap/core";

/**
 * Small collection of keyboard shortcuts Jot adds on top of StarterKit's
 * defaults so the Raycast-style shortcut set in the plan is fully covered:
 * task list toggling (Shift+Cmd+9) and the link shortcut (Cmd+L), which is
 * wired up by the caller via `openLinkEditor` since it needs UI, not just a
 * document transaction.
 */
export function createShortcutsExtension(openLinkEditor: () => boolean) {
  return Extension.create({
    name: "jotShortcuts",
    addKeyboardShortcuts() {
      return {
        "Mod-Shift-9": () => this.editor.commands.toggleTaskList(),
        "Mod-l": () => openLinkEditor()
      };
    }
  });
}
