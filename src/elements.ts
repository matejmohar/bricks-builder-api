import type { Context } from './context';
import { parentIdOf, waitFor } from './context';
import { BricksApiError, InvalidArgumentError, NoSelectionError, NotAllowedError } from './errors';
import type { ElementId, ElementInfo, InsertOptions, WrapTag } from './types';

const WRAP_TAGS: readonly WrapTag[] = ['div', 'block', 'container', 'section'];

export interface ElementsApi {
  /** Element by id in the active area, or null when it does not exist. */
  get(id: ElementId): ElementInfo | null;
  /**
   * Inserts a new element of type `name` (e.g. `'heading'`) relative to the
   * selection, the way the Elements panel does. The selection does not change.
   * Returns the inserted element.
   */
  insert(name: string, options?: InsertOptions): ElementInfo;
  /** Duplicates the element (default: the selection). Returns the copy, placed right after it. */
  duplicate(id?: ElementId): ElementInfo;
  /** Deletes the element (default: the selection) and its children. */
  delete(id?: ElementId): void;
  /**
   * Wraps the selection in a new nestable element (default: Bricks' configured
   * wrap element, usually `'block'`). Resolves with the wrapper once Bricks has
   * selected it.
   */
  wrap(tag?: WrapTag): Promise<ElementInfo>;
  /** Sets the element's Structure-panel label (default: the selection). `''` or `null` resets it. */
  rename(label: string | null, id?: ElementId): ElementInfo;
}

export function createElements(ctx: Context): ElementsApi {
  const { driver } = ctx;

  const ids = (): Set<string> => new Set(driver.allElements().map((e) => e.id));

  return {
    get(id) {
      ctx.require('elements.get');
      const el = driver.findElement(id);
      return el ? ctx.info(el) : null;
    },

    insert(name, options = {}) {
      ctx.require('elements.insert');
      const position = options.position ?? 'auto';
      if (position !== 'auto' && position !== 'outside') {
        throw new InvalidArgumentError(`Unknown insert position "${String(position)}"`);
      }
      if (typeof name !== 'string' || !driver.isKnownElementType(name)) {
        throw new InvalidArgumentError(`Unknown element type "${String(name)}"`);
      }
      const inserted = driver.insertElement(name, position === 'outside');
      const el = inserted && typeof inserted.id === 'string' ? driver.findElement(inserted.id) : undefined;
      if (!el) throw new NotAllowedError(`Bricks did not insert "${name}" (missing permission?)`);
      return ctx.info(el);
    },

    duplicate(id) {
      ctx.require('elements.duplicate');
      const el = ctx.target('elements.duplicate', id);
      if (!driver.canClone(el)) throw new NotAllowedError(`Element "${el.id}" cannot be duplicated`);
      const parentId = parentIdOf(el);
      const siblings = parentId
        ? (driver.findElement(parentId)?.children ?? [])
        : driver.rootElements().map((e) => e.id);
      const index = siblings.indexOf(el.id);
      const before = ids();
      driver.cloneElement(el, index === -1 ? siblings.length : index);
      const copy = driver
        .allElements()
        .find((e) => !before.has(e.id) && parentIdOf(e) === parentId && e.name === el.name);
      if (!copy) throw new NotAllowedError(`Bricks did not duplicate "${el.id}" (missing permission?)`);
      return ctx.info(copy);
    },

    delete(id) {
      ctx.require('elements.delete');
      const el = ctx.target('elements.delete', id);
      if (!driver.canDelete(el)) throw new NotAllowedError(`Element "${el.id}" cannot be deleted`);
      driver.deleteElement(el);
      if (driver.findElement(el.id)) {
        throw new NotAllowedError(`Bricks did not delete "${el.id}" (missing permission?)`);
      }
    },

    async wrap(tag) {
      ctx.require('elements.wrap');
      const wrapTag = tag ?? driver.defaultWrapTag();
      if (!WRAP_TAGS.includes(wrapTag)) throw new InvalidArgumentError(`Cannot wrap in "${String(wrapTag)}"`);
      const el = ctx.selected();
      if (!el) throw new NoSelectionError('elements.wrap');
      const parentBefore = parentIdOf(el);
      driver.wrapActive(wrapTag);
      const after = driver.findElement(el.id);
      const wrapperId = after ? parentIdOf(after) : null;
      const wrapper = wrapperId && wrapperId !== parentBefore ? driver.findElement(wrapperId) : undefined;
      if (!wrapper) throw new NotAllowedError(`Bricks did not wrap "${el.id}"`);
      // Bricks selects the wrapper on nextTick + setTimeout(0).
      await waitFor(() => (driver.getActiveId() === wrapper.id ? true : undefined), 1000);
      return ctx.info(driver.findElement(wrapper.id) ?? wrapper);
    },

    rename(label, id) {
      ctx.require('elements.rename');
      if (label !== null && typeof label !== 'string') throw new InvalidArgumentError('Label must be a string or null');
      const el = ctx.target('elements.rename', id);
      driver.setLabel(el, label);
      const updated = driver.findElement(el.id);
      if (!updated) throw new BricksApiError(`Element "${el.id}" disappeared while renaming`);
      return ctx.info(updated);
    },
  };
}
