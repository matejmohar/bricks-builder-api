/**
 * Adapter for Bricks 2.4.x (verified against 2.4.3).
 *
 * Every Bricks internal used by the library is referenced from this file only.
 * None of these are public Bricks APIs.
 */
import type { Driver, VersionAdapter } from '../driver';
import type { Requirement } from '../probe';
import type {
  Capability,
  RawBreakpoint,
  RawBricksData,
  RawElement,
  RawGlobalProperties,
  RawRef,
  RawState,
  WrapTag,
} from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

const WRAP_TAGS: readonly WrapTag[] = ['div', 'block', 'container', 'section'];

/** Element lookup in the active area (content / header / footer / component). */
const LOOKUP: readonly Requirement[] = [
  ['$_getDynamicElementById', '$_dynamicElements.value', 'state.content'],
  '$_isNestable',
];
const ROOTS: Requirement = ['$_rootElements.value', '$_dynamicElements.value', 'state.content'];
const HISTORY: readonly Requirement[] = ['$_goto', 'state.history', 'state.historyIndex', 'state.historyInProgress'];

export const requirements: Record<Capability, readonly Requirement[]> = {
  'selection.get': [['$_activeElement.value', 'state.activeId'], ...LOOKUP],
  'selection.set': ['state.activeId', ...LOOKUP],
  'selection.onChange': ['$_watch', 'state.activeId', ...LOOKUP],
  'selection.navigate': ['state.activeId', ...LOOKUP, ROOTS],
  'elements.get': [...LOOKUP],
  'elements.insert': ['$_createElement', '$_addNewElement', '$_getElementConfig', ...LOOKUP, ROOTS],
  'elements.duplicate': ['$_cloneElement', '$_isCloneable', ...LOOKUP, ROOTS],
  'elements.delete': ['$_deleteElement', '$_isDeletable', ...LOOKUP],
  'elements.wrap': ['$_wrapInNestable', 'state.activeId', ...LOOKUP],
  'elements.rename': [...LOOKUP],
  'clipboard.copy': ['$_copyElements', 'state.activeId'],
  'clipboard.paste': ['$_pasteElements', ...LOOKUP],
  'history.undo': HISTORY,
  'history.redo': HISTORY,
  'document.save': [['$_savePostAsync', '$_savePost'], 'state.isSaving', 'state.unsavedChanges'],
  'document.unsavedChanges': ['state.unsavedChanges'],
  'ui.isTyping': ['state.isInlineEditing'],
  'ui.commandPalette': ['state.showCommandPalette'],
  'ui.showPanel': ['$_showPanel'],
  'ui.breakpoints': ['state.breakpoints', 'state.breakpointActive'],
  'ui.toggleClasses': ['state.showElementClasses'],
};

/** Normalises Bricks' "no selection" values (undefined, null, 0, false, '') to null. */
export function normalizeId(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 && value !== '0' ? value : null;
  if (typeof value === 'number') return value !== 0 && Number.isFinite(value) ? String(value) : null;
  return null;
}

/** Fallback with the same rules as Bricks 2.4's `$_isEditable`. */
export function isEditableFallback(el: Element | null | undefined): boolean {
  if (!el) return false;
  if (typeof el.closest === 'function' && el.closest('.structure-item')) return false;
  if (el.id === 'bricks-panel-search') return false;
  if ((el as HTMLElement).isContentEditable) return true;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'textarea' || tag === 'input';
}

export function createDriver(gp: RawGlobalProperties, win: Window): Driver {
  const state = (): RawState => gp.$_state;
  const fn = (name: string): AnyFn | undefined => {
    const f = gp[name];
    return typeof f === 'function' ? (f as AnyFn) : undefined;
  };
  const call = (name: string, ...args: unknown[]): unknown => {
    const f = fn(name);
    if (!f) throw new Error(`Bricks function ${name} is missing`);
    return f(...args);
  };
  const ref = <T>(name: string): T | undefined => {
    const r = gp[name] as RawRef<T> | undefined;
    return r && typeof r === 'object' && 'value' in r ? r.value : undefined;
  };
  const bricksData = (): RawBricksData =>
    ((win as unknown as { bricksData?: RawBricksData }).bricksData ?? {}) as RawBricksData;

  const allElements = (): RawElement[] => {
    const dyn = ref<RawElement[]>('$_dynamicElements');
    if (Array.isArray(dyn)) return dyn;
    return Array.isArray(state().content) ? (state().content as RawElement[]) : [];
  };

  const driver: Driver = {
    getActiveId() {
      if (gp.$_activeElement && typeof gp.$_activeElement === 'object' && 'value' in gp.$_activeElement) {
        // Synchronous computed; `{}` when nothing (or a missing id) is selected.
        const el = ref<Partial<RawElement> | null>('$_activeElement');
        return normalizeId(el?.id);
      }
      return normalizeId(state().activeId);
    },
    setActiveId(id) {
      const s = state();
      // A plain selection replaces any multi-selection, like a normal click does.
      if (Array.isArray(s.selectedElements) && s.selectedElements.length) s.selectedElements = [];
      s.activeId = id;
    },
    watchActiveId(cb) {
      // Watch the *effective* selection: after a delete Bricks keeps the stale
      // activeId for a tick, which $_activeElement already resolves to nothing.
      const stop = call(
        '$_watch',
        () => driver.getActiveId(),
        (next: string | null, prev: string | null) => cb(next, prev),
      );
      return typeof stop === 'function' ? (stop as () => void) : () => {};
    },

    findElement(id) {
      const byId = fn('$_getDynamicElementById');
      if (byId) {
        const el = byId(id) as RawElement | undefined;
        if (el) return el;
      }
      return allElements().find((e) => e && e.id === id);
    },
    allElements,
    rootElements() {
      const roots = ref<RawElement[]>('$_rootElements');
      if (Array.isArray(roots)) return roots;
      return allElements().filter((e) => normalizeId(e.parent) === null);
    },
    isNestable(el) {
      const f = fn('$_isNestable');
      return f ? !!f(el) : Array.isArray(el.children) && el.children.length > 0;
    },
    isKnownElementType(name) {
      const cfg = fn('$_getElementConfig')?.(name) as { name?: string } | undefined;
      // Bricks returns `{ label }` for unknown names; registered elements carry `name`.
      return !!cfg && cfg.name === name;
    },

    insertElement(name, placement) {
      const element = call('$_createElement', { name });
      // $_addNewElement re-creates the element (new id) and returns the inserted one.
      if (!placement) return call('$_addNewElement', { element }) as RawElement | undefined;
      // Explicit position, the way Bricks' own drop handling calls it. `isDropTarget`
      // makes Bricks use parent/index as given (and ignore the modifier-key
      // "insertAfter" flag, whose index handling is imprecise in 2.4).
      return call('$_addNewElement', {
        element,
        parent: placement.parentId,
        index: placement.index,
        isDropTarget: true,
      }) as RawElement | undefined;
    },
    canClone: (el) => !!call('$_isCloneable', el),
    cloneElement(el, index) {
      call('$_cloneElement', { element: el, index });
    },
    canDelete: (el) => !!call('$_isDeletable', el),
    deleteElement(el) {
      // Must be the element object; an id is silently ignored by Bricks.
      call('$_deleteElement', el);
    },
    wrapActive(tag) {
      call('$_wrapInNestable', null, tag);
    },
    defaultWrapTag() {
      const tag = bricksData().builderWrapElement;
      return WRAP_TAGS.includes(tag as WrapTag) ? (tag as WrapTag) : 'block';
    },
    setLabel(el, label) {
      if (label === null || label === '') delete el.label;
      else el.label = label;
    },

    clipboardAvailable() {
      const nav = win.navigator as Navigator | undefined;
      return !!nav && !!nav.clipboard && win.isSecureContext !== false;
    },
    copySelection() {
      call('$_copyElements');
    },
    pasteFromClipboard() {
      call('$_pasteElements');
    },

    historyStatus() {
      const s = state();
      return {
        length: Array.isArray(s.history) ? s.history.length : 0,
        index: typeof s.historyIndex === 'number' ? s.historyIndex : 0,
        inProgress: !!s.historyInProgress,
      };
    },
    goto(direction) {
      call('$_goto', direction);
    },

    save() {
      const asyncSave = fn('$_savePostAsync');
      if (asyncSave) return asyncSave() as Promise<void>;
      call('$_savePost');
    },
    isSaving: () => !!state().isSaving,
    unsavedChangesCount() {
      const u = state().unsavedChanges;
      return Array.isArray(u) ? u.length : 0;
    },

    isEditable(el) {
      const f = fn('$_isEditable');
      return f ? !!f(el) : isEditableFallback(el);
    },
    isInlineEditing: () => !!state().isInlineEditing,
    builderDocument: () => win.document,
    canvasIframe: () => win.document.querySelector<HTMLIFrameElement>('#bricks-builder-iframe'),
    isCommandPaletteOpen: () => !!state().showCommandPalette,
    setCommandPaletteOpen(open) {
      state().showCommandPalette = open;
    },
    showPanel(panel) {
      call('$_showPanel', { panel });
    },
    breakpoints() {
      const b = state().breakpoints;
      return Array.isArray(b) ? (b as RawBreakpoint[]).filter((bp) => bp && !bp.paused) : [];
    },
    activeBreakpoint: () => (typeof state().breakpointActive === 'string' ? (state().breakpointActive as string) : null),
    setActiveBreakpoint(key) {
      state().breakpointActive = key;
    },
    classesVisible: () => !!state().showElementClasses,
    setClassesVisible(visible) {
      state().showElementClasses = visible;
    },
  };
  return driver;
}

export const adapter: VersionAdapter = {
  version: '2.4',
  requirements,
  createDriver,
};

export default adapter;
