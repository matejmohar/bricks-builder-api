import type { Driver } from './driver';
import { ElementNotFoundError, NoSelectionError, UnsupportedError } from './errors';
import type { Capability, CapabilityMap, ElementInfo, RawElement, RawGlobalProperties } from './types';
import { normalizeId } from './versions/2.4';

/** Shared internals handed to each public module. */
export interface Context {
  gp: RawGlobalProperties;
  win: Window;
  driver: Driver;
  capabilities: CapabilityMap;
  /** Throws UnsupportedError when the capability is not available. */
  require(cap: Capability): void;
  /** Converts a raw Bricks element into a plain ElementInfo snapshot. */
  info(el: RawElement): ElementInfo;
  /** Raw element by id, or undefined. */
  find(id: string): RawElement | undefined;
  /** Raw selected element, or undefined. */
  selected(): RawElement | undefined;
  /**
   * The element to act on: by id when given (ElementNotFoundError when missing),
   * otherwise the selection (NoSelectionError when nothing is selected).
   */
  target(action: string, id?: string | null): RawElement;
}

export function parentIdOf(el: RawElement): string | null {
  return normalizeId(el.parent);
}

export function createContext(gp: RawGlobalProperties, win: Window, driver: Driver, capabilities: CapabilityMap): Context {
  const ctx: Context = {
    gp,
    win,
    driver,
    capabilities,
    require(cap) {
      if (!capabilities[cap]) throw new UnsupportedError(cap);
    },
    info(el) {
      return {
        id: el.id,
        name: el.name,
        parentId: parentIdOf(el),
        label: typeof el.label === 'string' && el.label !== '' ? el.label : null,
        isNestable: driver.isNestable(el),
        childIds: Array.isArray(el.children) ? el.children.slice() : [],
      };
    },
    find(id) {
      return driver.findElement(id);
    },
    selected() {
      const id = driver.getActiveId();
      return id ? driver.findElement(id) : undefined;
    },
    target(action, id) {
      if (id !== undefined && id !== null) {
        const el = driver.findElement(id);
        if (!el) throw new ElementNotFoundError(id);
        return el;
      }
      const el = ctx.selected();
      if (!el) throw new NoSelectionError(action);
      return el;
    },
  };
  return ctx;
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `check` until it returns a non-undefined value or the timeout passes (then returns undefined). */
export async function waitFor<T>(check: () => T | undefined, timeout: number, interval = 25): Promise<T | undefined> {
  const end = Date.now() + timeout;
  for (;;) {
    const v = check();
    if (v !== undefined) return v;
    if (Date.now() >= end) return undefined;
    await sleep(interval);
  }
}
