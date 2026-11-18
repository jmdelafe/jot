import { bridge } from "./bridge";

/** Height the window keeps while the palette is open so results fit. */
export const PALETTE_HEIGHT = 380;

/**
 * Measures how tall the note's content actually is (ignoring the editor's
 * `min-height: 100%` filler) and asks native code to fit the window to it,
 * the way Raycast Notes grows with your thoughts. Measurements are batched
 * to one per animation frame and only sent when the height changes.
 */
export function measureContentHeight(editorEl: HTMLElement): number {
  const content = editorEl.querySelector<HTMLElement>(".ProseMirror");
  const last = content?.lastElementChild as HTMLElement | null | undefined;
  const style = getComputedStyle(editorEl);
  let height = parseFloat(style.paddingTop) || 0;
  if (last) {
    const margin = parseFloat(getComputedStyle(last).marginBottom) || 0;
    height = last.offsetTop + last.offsetHeight + margin;
  }
  height += parseFloat(style.paddingBottom) || 0;
  return Math.ceil(height);
}

export function installAutosize(
  editorEl: HTMLElement,
  isPaletteOpen: () => boolean
): { schedule(): void } {
  let frame = 0;
  let lastSent = -1;
  const send = () => {
    frame = 0;
    let height = measureContentHeight(editorEl);
    if (isPaletteOpen()) height = Math.max(height, PALETTE_HEIGHT);
    if (height !== lastSent) {
      lastSent = height;
      bridge.preferredHeight(height);
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(send);
  };
  // Width changes reflow text, which changes the height.
  new ResizeObserver(schedule).observe(editorEl);
  return { schedule };
}
