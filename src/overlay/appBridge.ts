// What the overlay page and the overlay app (overlay-app/) tell each other. The
// app loads /overlay/?list=<id>&app=1 in an iframe, sizes its window to the
// panel and takes the mouse only over it, so the page posts the panel's
// rectangle to its parent whenever it moves or changes size. The app picks the
// sections shown, in the URL and then live, without reloading the page. The
// app's window never takes the keyboard, so the page asks for it while an
// "I have" field is open. Without `app=1` the page posts nothing and listens
// to nothing.

import { useEffect, useState, type RefObject } from 'react';

export const LAYOUT_MESSAGE = 'dune-overlay:layout';
export const OPTIONS_MESSAGE = 'dune-overlay:options';
export const KEYBOARD_MESSAGE = 'dune-overlay:keyboard';

export interface KeyboardMessage {
  type: typeof KEYBOARD_MESSAGE;
  /** true when a field opens (the app activates its window), false when it closes (the app gives the game its focus back). */
  wanted: boolean;
}

export function keyboardMessage(wanted: boolean): KeyboardMessage {
  return { type: KEYBOARD_MESSAGE, wanted };
}

/** Asks the parent window for the keyboard, or gives it back; does nothing without a parent. */
export function requestKeyboard(wanted: boolean): void {
  if (window.parent !== window) window.parent.postMessage(keyboardMessage(wanted), '*');
}

/** Overlay sections, in page order: gathering stays above crafting. */
export type Section = 'gather' | 'craft';

export const SECTIONS: readonly Section[] = ['gather', 'craft'];

/**
 * Sections to show, in page order, from `sections=gather,craft` or a message's
 * list. Unknown names are ignored; nothing valid means both.
 */
export function parseSections(value: unknown): Section[] {
  const names = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
  const picked = SECTIONS.filter((s) => names.some((n) => typeof n === 'string' && n.trim() === s));
  return picked.length > 0 ? picked : [...SECTIONS];
}

/** The sections an options message asks for, or undefined when it is not one (or carries none). */
export function readOptions(data: unknown): Section[] | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const { type, sections } = data as { type?: unknown; sections?: unknown };
  return type === OPTIONS_MESSAGE && Array.isArray(sections) ? parseSections(sections) : undefined;
}

/** Sections from the URL, then from the parent window's options messages when `listen` is on. */
export function useSections(search: string, listen: boolean): Section[] {
  const [sections, setSections] = useState(() => parseSections(new URLSearchParams(search).get('sections') ?? ''));
  useEffect(() => {
    if (!listen || window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const next = readOptions(event.data);
      if (next) setSections((current) => (current.join() === next.join() ? current : next));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [listen]);
  return sections;
}

/** CSS px, from the panel's getBoundingClientRect(). */
export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutMessage {
  type: typeof LAYOUT_MESSAGE;
  panel: PanelRect;
}

export function isAppMode(search: string): boolean {
  return new URLSearchParams(search).get('app') === '1';
}

/** Returns a function that posts the panel's rectangle, skipping a repeat of the last one posted. */
export function layoutReporter(post: (message: LayoutMessage) => void): (rect: PanelRect) => void {
  let last = '';
  return ({ x, y, width, height }) => {
    const panel = { x, y, width, height };
    const key = JSON.stringify(panel);
    if (key === last) return;
    last = key;
    post({ type: LAYOUT_MESSAGE, panel });
  };
}

/** Posts the panel's rectangle to the parent window on load and on every change, when there is a parent. */
export function usePanelLayout(panel: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const element = panel.current;
    if (!enabled || !element || window.parent === window) return;
    const report = layoutReporter((message) => window.parent.postMessage(message, '*'));
    const send = () => report(element.getBoundingClientRect());
    // The panel sits at the top left of a page that never scrolls: it only moves
    // when the viewport changes, and it changes size when the list does.
    const observer = new ResizeObserver(send);
    observer.observe(element);
    window.addEventListener('resize', send);
    send();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', send);
    };
  }, [panel, enabled]);
}
