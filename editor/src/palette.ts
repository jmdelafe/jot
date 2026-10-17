/**
 * A small keyboard-first command palette in the spirit of Raycast: a search
 * field over a sectioned list, navigated with the arrow keys and Enter.
 * It is used for both the note browser (⌘P) and the action panel (⌘K).
 * Plain DOM, no framework, and rows are only rendered for visible results.
 */

export interface PaletteAccessory {
  label: string;
  icon: string;
  run(): void;
}

export interface PaletteItem {
  id: string;
  title: string;
  section: string;
  subtitle?: string;
  /** Renders the subtitle with an accent dot, used for "Current". */
  subtitleAccent?: boolean;
  /** Small leading marker, e.g. a pin for pinned notes. */
  leading?: string;
  shortcut?: string[];
  /** Additional text that search should match but not display. */
  keywords?: string;
  accessories?: PaletteAccessory[];
  danger?: boolean;
  run(): void;
}

export interface PaletteMode {
  name: string;
  placeholder: string;
  items(): PaletteItem[];
  /** Extra per-item key handling (e.g. ⌃X to delete). Return true if handled. */
  onKey?(event: KeyboardEvent, item: PaletteItem | undefined): boolean;
  emptyText?: string;
}

const MAX_ROWS = 200;

export function matchesQuery(query: string, ...fields: (string | undefined)[]): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = fields.filter(Boolean).join("\n").toLowerCase();
  return tokens.every(token => haystack.includes(token));
}

export class Palette {
  readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLDivElement;
  private mode: PaletteMode | null = null;
  private visible: PaletteItem[] = [];
  private selected = 0;
  private restoreFocus: (() => void) | null = null;
  private readonly onDocumentPointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && !this.panel.contains(event.target)) {
      this.close();
    }
  };
  private readonly panel: HTMLDivElement;

  constructor(private readonly onVisibilityChange: (open: boolean) => void = () => {}) {
    this.root = document.createElement("div");
    this.root.className = "jot-palette";
    this.root.hidden = true;

    this.panel = document.createElement("div");
    this.panel.className = "jot-palette-panel";
    this.panel.setAttribute("role", "dialog");

    this.input = document.createElement("input");
    this.input.className = "jot-palette-input";
    this.input.type = "text";
    this.input.spellcheck = false;
    this.input.autocomplete = "off";
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-expanded", "true");
    this.input.setAttribute("aria-controls", "jot-palette-list");
    this.input.addEventListener("input", () => {
      this.selected = 0;
      this.render();
    });
    this.input.addEventListener("keydown", event => this.handleKey(event));

    this.list = document.createElement("div");
    this.list.className = "jot-palette-list";
    this.list.id = "jot-palette-list";
    this.list.setAttribute("role", "listbox");

    this.panel.append(this.input, this.list);
    this.root.appendChild(this.panel);
    document.body.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.mode !== null;
  }

  get modeName(): string | null {
    return this.mode?.name ?? null;
  }

  open(mode: PaletteMode, restoreFocus: () => void): void {
    const wasOpen = this.isOpen;
    this.mode = mode;
    this.restoreFocus = restoreFocus;
    this.input.value = "";
    this.input.placeholder = mode.placeholder;
    this.input.setAttribute("aria-label", mode.placeholder);
    this.selected = 0;
    this.root.hidden = false;
    this.root.dataset.mode = mode.name;
    this.render();
    this.input.focus();
    if (!wasOpen) {
      document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
      this.onVisibilityChange(true);
    }
  }

  close(restore = true): void {
    if (!this.mode) return;
    this.mode = null;
    this.root.hidden = true;
    this.list.replaceChildren();
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    this.onVisibilityChange(false);
    const focus = this.restoreFocus;
    this.restoreFocus = null;
    if (restore) focus?.();
  }

  /** Re-renders with fresh items (e.g. after the note list changed). */
  refresh(): void {
    if (!this.mode) return;
    this.render();
  }

  private render(): void {
    if (!this.mode) return;
    const query = this.input.value;
    const results = this.mode.items().filter(item =>
      matchesQuery(query, item.title, item.subtitle, item.keywords, item.section));
    this.visible = results.slice(0, MAX_ROWS);
    this.selected = Math.max(0, Math.min(this.selected, this.visible.length - 1));

    const rows: HTMLElement[] = [];
    let section: string | null = null;
    this.visible.forEach((item, index) => {
      if (item.section !== section) {
        section = item.section;
        const header = document.createElement("div");
        header.className = "jot-palette-section";
        header.textContent = section;
        rows.push(header);
      }
      rows.push(this.renderRow(item, index));
    });
    if (this.visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "jot-palette-empty";
      empty.textContent = this.mode.emptyText ?? "No results";
      rows.push(empty);
    }
    this.list.replaceChildren(...rows);
    this.updateSelection(false);
  }

  private renderRow(item: PaletteItem, index: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "jot-palette-row";
    row.id = `jot-palette-row-${index}`;
    row.setAttribute("role", "option");
    row.classList.toggle("is-danger", Boolean(item.danger));
    row.addEventListener("mousemove", () => {
      if (this.selected !== index) {
        this.selected = index;
        this.updateSelection(false);
      }
    });
    row.addEventListener("mousedown", event => event.preventDefault());
    row.addEventListener("click", () => this.activate(index));

    const text = document.createElement("div");
    text.className = "jot-palette-text";
    const title = document.createElement("div");
    title.className = "jot-palette-title";
    if (item.leading) {
      const leading = document.createElement("span");
      leading.className = "jot-palette-leading";
      leading.innerHTML = item.leading;
      title.appendChild(leading);
    }
    title.append(item.title);
    text.appendChild(title);
    if (item.subtitle) {
      const subtitle = document.createElement("div");
      subtitle.className = "jot-palette-subtitle";
      subtitle.classList.toggle("is-accent", Boolean(item.subtitleAccent));
      subtitle.textContent = item.subtitle;
      text.appendChild(subtitle);
    }
    row.appendChild(text);

    if (item.accessories?.length) {
      const accessories = document.createElement("div");
      accessories.className = "jot-palette-accessories";
      for (const accessory of item.accessories) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "jot-palette-accessory";
        button.title = accessory.label;
        button.setAttribute("aria-label", accessory.label);
        button.innerHTML = accessory.icon;
        button.addEventListener("mousedown", event => event.preventDefault());
        button.addEventListener("click", event => {
          event.stopPropagation();
          accessory.run();
        });
        accessories.appendChild(button);
      }
      row.appendChild(accessories);
    }

    if (item.shortcut?.length) {
      const keys = document.createElement("div");
      keys.className = "jot-palette-shortcut";
      for (const key of item.shortcut) {
        const cap = document.createElement("kbd");
        cap.textContent = key;
        keys.appendChild(cap);
      }
      row.appendChild(keys);
    }
    return row;
  }

  private updateSelection(scroll = true): void {
    const rows = this.list.querySelectorAll<HTMLElement>(".jot-palette-row");
    rows.forEach((row, index) => {
      const isSelected = index === this.selected;
      row.classList.toggle("is-selected", isSelected);
      row.setAttribute("aria-selected", String(isSelected));
      if (isSelected && scroll) row.scrollIntoView?.({ block: "nearest" });
    });
    if (rows.length > 0) {
      this.input.setAttribute("aria-activedescendant", `jot-palette-row-${this.selected}`);
    } else {
      this.input.removeAttribute("aria-activedescendant");
    }
  }

  private activate(index: number): void {
    const item = this.visible[index];
    if (!item) return;
    this.close();
    item.run();
  }

  private handleKey(event: KeyboardEvent): void {
    const item = this.visible[this.selected];
    if (this.mode?.onKey?.(event, item)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const count = this.visible.length;
    switch (event.key) {
      case "ArrowDown":
        if (count) this.selected = (this.selected + 1) % count;
        break;
      case "ArrowUp":
        if (count) this.selected = (this.selected - 1 + count) % count;
        break;
      case "Enter":
        this.activate(this.selected);
        break;
      case "Escape":
        this.close();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.updateSelection();
  }
}
