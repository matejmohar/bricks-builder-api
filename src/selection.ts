import type { Context } from './context';
import { parentIdOf } from './context';
import { ElementNotFoundError, NoSelectionError } from './errors';
import type { ElementId, ElementInfo, RawElement, SelectionListener, Unsubscribe } from './types';

export interface SelectionApi {
  /** The selected element, or null. Synchronous: reflects `set()` immediately. */
  get(): ElementInfo | null;
  /** Selects an element by id (null clears). Throws ElementNotFoundError for unknown ids. */
  set(id: ElementId | null): ElementInfo | null;
  /**
   * Calls `listener(next, prev)` whenever the selection changes (from the API,
   * the canvas, the Structure panel, ...). Runs asynchronously (next macrotask)
   * with the then-current selection, so rapid or transient changes collapse
   * into one call. Returns an unsubscribe function.
   */
  onChange(listener: SelectionListener): Unsubscribe;
  /** Selects the parent of the selection. Returns it, or null (selection unchanged) at root level. */
  parent(): ElementInfo | null;
  /** Selects the first child of the selection. Returns it, or null (unchanged) when there is none. */
  firstChild(): ElementInfo | null;
  /** Selects the next sibling. Returns it, or null (unchanged) when the selection is the last. */
  next(): ElementInfo | null;
  /** Selects the previous sibling. Returns it, or null (unchanged) when the selection is the first. */
  previous(): ElementInfo | null;
}

export function createSelection(ctx: Context): SelectionApi {
  const { driver } = ctx;

  const get = (): ElementInfo | null => {
    ctx.require('selection.get');
    const el = ctx.selected();
    return el ? ctx.info(el) : null;
  };

  const select = (el: RawElement): ElementInfo => {
    driver.setActiveId(el.id);
    return ctx.info(el);
  };

  const current = (action: string): RawElement => {
    ctx.require('selection.navigate');
    const el = ctx.selected();
    if (!el) throw new NoSelectionError(action);
    return el;
  };

  const siblingsOf = (el: RawElement): string[] => {
    const parentId = parentIdOf(el);
    if (parentId) {
      const parent = driver.findElement(parentId);
      return parent && Array.isArray(parent.children) ? parent.children : [];
    }
    return driver.rootElements().map((e) => e.id);
  };

  const sibling = (action: string, offset: 1 | -1): ElementInfo | null => {
    const el = current(action);
    const siblings = siblingsOf(el);
    const index = siblings.indexOf(el.id);
    if (index === -1) return null;
    for (let i = index + offset; i >= 0 && i < siblings.length; i += offset) {
      const target = driver.findElement(siblings[i] as string);
      if (target) return select(target);
    }
    return null;
  };

  return {
    get,
    set(id) {
      ctx.require('selection.set');
      if (id === null || id === undefined) {
        driver.setActiveId(null);
        return null;
      }
      const el = driver.findElement(id);
      if (!el) throw new ElementNotFoundError(id);
      return select(el);
    },
    onChange(listener) {
      ctx.require('selection.onChange');
      let last: ElementInfo | null = get();
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Deliver on the next macrotask with the then-current selection, so that
      // transient states (e.g. the stale id Bricks keeps for a tick after a
      // delete before selecting the next element) collapse into one event.
      const deliver = (): void => {
        timer = undefined;
        const nextEl = ctx.selected();
        const next = nextEl ? ctx.info(nextEl) : null;
        const prev = last;
        if (next?.id === prev?.id) return;
        last = next;
        try {
          listener(next, prev);
        } catch (err) {
          // Never let a listener break Bricks' own watchers.
          console.error('[bricks-builder-api] selection.onChange listener threw', err);
        }
      };
      const stop = driver.watchActiveId(() => {
        if (timer === undefined) timer = setTimeout(deliver, 0);
      });
      return () => {
        stop();
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      };
    },
    parent() {
      const el = current('selection.parent');
      const parentId = parentIdOf(el);
      const parent = parentId ? driver.findElement(parentId) : undefined;
      return parent ? select(parent) : null;
    },
    firstChild() {
      const el = current('selection.firstChild');
      for (const childId of Array.isArray(el.children) ? el.children : []) {
        const child = driver.findElement(childId);
        if (child) return select(child);
      }
      return null;
    },
    next: () => sibling('selection.next', 1),
    previous: () => sibling('selection.previous', -1),
  };
}
