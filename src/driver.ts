import type { Capability, RawBreakpoint, RawElement, RawGlobalProperties, WrapTag } from './types';
import type { Requirement } from './probe';

/**
 * Version-specific access to Bricks internals. The public modules
 * (selection, elements, ...) only talk to Bricks through a Driver, so
 * supporting a new Bricks release means adding a new adapter in
 * `src/versions/`, not touching the public API.
 */
export interface Driver {
  // selection
  getActiveId(): string | null;
  setActiveId(id: string | null): void;
  watchActiveId(cb: (next: string | null, prev: string | null) => void): () => void;

  // element tree (active area: content, header, footer or component)
  findElement(id: string): RawElement | undefined;
  allElements(): RawElement[];
  rootElements(): RawElement[];
  isNestable(el: RawElement): boolean;
  isKnownElementType(name: string): boolean;

  // element actions
  /**
   * Inserts like the Elements panel. Without `placement`, Bricks decides from
   * the selection; with it, the element goes to `placement.parentId`
   * (0 = root) at `placement.index`.
   */
  insertElement(name: string, placement?: { parentId: string | 0; index: number }): RawElement | undefined;
  canClone(el: RawElement): boolean;
  cloneElement(el: RawElement, index: number): void;
  canDelete(el: RawElement): boolean;
  deleteElement(el: RawElement): void;
  wrapActive(tag: WrapTag): void;
  defaultWrapTag(): WrapTag;
  setLabel(el: RawElement, label: string | null): void;

  // clipboard
  clipboardAvailable(): boolean;
  copySelection(): void;
  pasteFromClipboard(): void;

  // history
  historyStatus(): { length: number; index: number; inProgress: boolean };
  goto(direction: 'undo' | 'redo'): void;

  // document
  save(): Promise<void> | void;
  isSaving(): boolean;
  unsavedChangesCount(): number;

  // ui
  isEditable(el: Element): boolean;
  isInlineEditing(): boolean;
  builderDocument(): Document;
  canvasIframe(): HTMLIFrameElement | null;
  isCommandPaletteOpen(): boolean;
  setCommandPaletteOpen(open: boolean): void;
  showPanel(panel: string): void;
  breakpoints(): RawBreakpoint[];
  activeBreakpoint(): string | null;
  setActiveBreakpoint(key: string): void;
  classesVisible(): boolean;
  setClassesVisible(visible: boolean): void;
  /** Bricks' Structure panel rename mode (the active element's label becomes an input). */
  setRenameMode(on: boolean): void;
  /** The Structure panel's rename input for an element, once Bricks rendered it. */
  renameInput(id: string): HTMLInputElement | null;
}

/** A version adapter: which Bricks internals each capability needs, and how to drive them. */
export interface VersionAdapter {
  /** Bricks `major.minor` this adapter was written for, e.g. `"2.4"`. */
  version: string;
  /** Capability -> required globalProperties/state keys (probed at connect time). */
  requirements: Record<Capability, readonly Requirement[]>;
  createDriver(gp: RawGlobalProperties, win: Window): Driver;
}
