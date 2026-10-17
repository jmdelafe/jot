import type { NoteListItem, NotesPayload } from "./protocol";
import type { PaletteItem, PaletteMode } from "./palette";

const svg = (body: string) =>
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  pin: svg('<path d="M6 2.5h4M7 2.5v4L4.5 9h7L9 6.5v-4M8 9v4.5"/>'),
  unpin: svg('<path d="M6 2.5h4M7 2.5v4L4.5 9h7L9 6.5v-4M8 9v4.5M3 3l10 10"/>'),
  trash: svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
  restore: svg('<path d="M4 6.5h6a3 3 0 0 1 0 6H6.5M4 6.5 6.5 4M4 6.5 6.5 9"/>'),
  close: svg('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>')
};

export function relativeTime(then: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export interface NoteActions {
  open(id: string): void;
  restore(id: string): void;
  remove(id: string): void;
  purge(id: string): void;
  setPinned(id: string, pinned: boolean): void;
}

export function noteItems(payload: NotesPayload, actions: NoteActions, now = Date.now()): PaletteItem[] {
  return payload.notes.map((note: NoteListItem): PaletteItem => {
    if (note.deletedAt !== null) {
      return {
        id: note.id,
        title: note.title,
        section: "Recently Deleted",
        subtitle: `Deleted ${relativeTime(note.deletedAt, now)}`,
        keywords: note.searchText,
        accessories: [
          { label: "Restore Note", icon: ICONS.restore, run: () => actions.restore(note.id) },
          { label: "Delete Permanently", icon: ICONS.close, run: () => actions.purge(note.id) }
        ],
        run: () => actions.restore(note.id)
      };
    }
    const isCurrent = note.id === payload.currentId;
    return {
      id: note.id,
      title: note.title,
      section: "Notes",
      subtitle: isCurrent ? "Current" : `Opened ${relativeTime(note.openedAt, now)}`,
      subtitleAccent: isCurrent,
      leading: note.pinned ? ICONS.pin : undefined,
      keywords: note.searchText,
      accessories: [
        {
          label: note.pinned ? "Unpin Note" : "Pin Note",
          icon: note.pinned ? ICONS.unpin : ICONS.pin,
          run: () => actions.setPinned(note.id, !note.pinned)
        },
        { label: "Delete Note", icon: ICONS.trash, run: () => actions.remove(note.id) }
      ],
      run: () => actions.open(note.id)
    };
  });
}

export function notesMode(getPayload: () => NotesPayload, actions: NoteActions): PaletteMode {
  return {
    name: "notes",
    placeholder: "Search for notes…",
    emptyText: "No matching notes",
    items: () => noteItems(getPayload(), actions),
    onKey(event, item) {
      if (!item) return false;
      const note = getPayload().notes.find(candidate => candidate.id === item.id);
      if (!note) return false;
      // ⌃X deletes (or permanently deletes from Recently Deleted).
      if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "x") {
        if (note.deletedAt === null) actions.remove(note.id);
        else actions.purge(note.id);
        return true;
      }
      // ⇧⌘P toggles the pin.
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "p" && note.deletedAt === null) {
        actions.setPinned(note.id, !note.pinned);
        return true;
      }
      return false;
    }
  };
}
