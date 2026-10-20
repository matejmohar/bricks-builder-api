/**
 * Public and internal types for bricks-builder-api.
 *
 * The "raw" types describe the parts of Bricks' undocumented builder internals
 * this library touches. They are intentionally loose: Bricks can change them in
 * any release.
 */

/** A Bricks element id, e.g. `"jqebro"`. */
export type ElementId = string;

/** A capability this library can provide, depending on the Bricks version. */
export type Capability =
  | 'selection.get'
  | 'selection.set'
  | 'selection.onChange'
  | 'selection.navigate'
  | 'elements.get'
  | 'elements.insert'
  | 'elements.duplicate'
  | 'elements.delete'
  | 'elements.wrap'
  | 'elements.rename'
  | 'clipboard.copy'
  | 'clipboard.paste'
  | 'history.undo'
  | 'history.redo'
  | 'document.save'
  | 'document.unsavedChanges'
  | 'ui.isTyping'
  | 'ui.commandPalette'
  | 'ui.showPanel'
  | 'ui.breakpoints'
  | 'ui.toggleClasses';

/** Every capability, in a stable order (used for probing and the compat matrix). */
export const CAPABILITIES: readonly Capability[] = [
  'selection.get',
  'selection.set',
  'selection.onChange',
  'selection.navigate',
  'elements.get',
  'elements.insert',
  'elements.duplicate',
  'elements.delete',
  'elements.wrap',
  'elements.rename',
  'clipboard.copy',
  'clipboard.paste',
  'history.undo',
  'history.redo',
  'document.save',
  'document.unsavedChanges',
  'ui.isTyping',
  'ui.commandPalette',
  'ui.showPanel',
  'ui.breakpoints',
  'ui.toggleClasses',
] as const;

export type CapabilityMap = Record<Capability, boolean>;

/** A stable, plain snapshot of a Bricks element. Mutating it does not affect Bricks. */
export interface ElementInfo {
  id: ElementId;
  /** Element type, e.g. `"section"`, `"heading"`. */
  name: string;
  /** Parent element id, or `null` for root-level elements. */
  parentId: ElementId | null;
  /** Custom label set in the Structure panel, or `null` when none is set. */
  label: string | null;
  /** Whether the element can contain children. */
  isNestable: boolean;
  /** Ids of direct children, in order. */
  childIds: ElementId[];
}

/** Nestable wrapper element types Bricks can wrap a selection in. */
export type WrapTag = 'div' | 'block' | 'container' | 'section';

/** Builder panels that can be shown. */
export type PanelName = 'structure' | 'element' | 'elements';

/** Where `elements.insert()` places the new element relative to the selection. */
export type InsertPosition = 'auto' | 'outside';

export interface InsertOptions {
  /**
   * - `'auto'` (default): Bricks' default. Inside the selected element when it
   *   is nestable (as last child), otherwise directly after it. With no
   *   selection, at the end of the page.
   * - `'outside'`: one level up, like Bricks' "insert after" mode (holding the
   *   modifier key in the Elements panel): directly after the selected element
   *   when it is nestable, otherwise directly after the selected element's
   *   parent. A root-level leaf gets the new element directly after itself.
   *   With no selection, same as `'auto'`. Sections always go to the root
   *   level (Bricks rule).
   */
  position?: InsertPosition;
}

export interface Breakpoint {
  key: string;
  label: string;
  /** Breakpoint width in px, when Bricks provides one. */
  width: number | null;
  /** Whether this is the base breakpoint. */
  base: boolean;
  /** Whether this breakpoint is currently active in the builder. */
  active: boolean;
}

export interface PasteOptions {
  /** How long to wait for pasted elements to appear, in ms. Default 3000. */
  timeout?: number;
}

export interface SaveOptions {
  /** How long to wait for the save to finish, in ms. Default 15000. */
  timeout?: number;
}

export type SelectionListener = (next: ElementInfo | null, prev: ElementInfo | null) => void;
export type Unsubscribe = () => void;

export interface ConnectOptions {
  /** How long to wait for the builder app, in ms. Default 10000. */
  timeout?: number;
  /** The window that hosts the builder. Default: the global `window`. */
  window?: Window;
  /** Polling interval while waiting, in ms. Default 50. */
  interval?: number;
  /** Also wait until the canvas iframe reports it has loaded. Default true. */
  waitForCanvas?: boolean;
}

/* ------------------------------------------------------------------ */
/* Raw Bricks internals (loose, undocumented)                          */
/* ------------------------------------------------------------------ */

/** A Vue ref / computed ref. */
export interface RawRef<T> {
  value: T;
}

/** An element object as stored in `$_state.content` / `header` / `footer`. */
export interface RawElement {
  id: string;
  name: string;
  parent: string | number;
  children?: string[];
  settings?: Record<string, unknown>;
  label?: string;
  [key: string]: unknown;
}

export interface RawBreakpoint {
  key: string;
  label?: string;
  width?: number | string;
  base?: boolean;
  paused?: boolean;
  [key: string]: unknown;
}

/** The reactive builder store (`globalProperties.$_state`). */
export interface RawState {
  activeId?: string | number | false | null;
  content?: RawElement[];
  header?: RawElement[];
  footer?: RawElement[];
  selectedElements?: RawElement[];
  insertAfter?: boolean;
  history?: unknown[];
  historyIndex?: number;
  historyInProgress?: unknown;
  unsavedChanges?: unknown[];
  isSaving?: boolean;
  isInlineEditing?: boolean;
  iframeLoaded?: boolean;
  showCommandPalette?: boolean;
  showElementClasses?: boolean;
  breakpoints?: RawBreakpoint[];
  breakpointActive?: string;
  activePanel?: string;
  [key: string]: unknown;
}

/** `document.querySelector('.brx-body').__vue_app__.config.globalProperties` */
export interface RawGlobalProperties {
  $_state: RawState;
  [key: string]: unknown;
}

/** Subset of `window.bricksData` this library reads. */
export interface RawBricksData {
  version?: string;
  builderWrapElement?: string;
  [key: string]: unknown;
}
