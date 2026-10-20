import type { Context } from './context';
import { InvalidArgumentError, NoSelectionError } from './errors';
import type { Breakpoint, PanelName } from './types';

const PANELS: readonly PanelName[] = ['structure', 'element', 'elements'];

export interface UiApi {
  /**
   * Whether keyboard input currently goes into a text field: an input,
   * textarea or contenteditable in the builder panels or in the canvas iframe,
   * or Bricks' inline text editing. Use it to avoid hijacking keystrokes.
   *
   * Note: Bricks focuses the Elements panel search input when the builder
   * loads, so this is true until focus moves elsewhere.
   */
  isTyping(): boolean;
  isCommandPaletteOpen(): boolean;
  openCommandPalette(): void;
  closeCommandPalette(): void;
  /** Shows a builder panel. */
  showPanel(panel: PanelName): void;
  /** Active (non-paused) breakpoints in Bricks' order. */
  breakpoints(): Breakpoint[];
  /** Switches the canvas to a breakpoint by key (e.g. `'tablet_portrait'`). */
  setBreakpoint(key: string): void;
  /**
   * Toggles the class input of the selected element (like pressing Enter in the
   * builder). Pass `force` to set a specific state. Returns the new state.
   * Showing it requires a selection.
   */
  toggleClasses(force?: boolean): boolean;
}

export function createUi(ctx: Context): UiApi {
  const { driver } = ctx;

  const editable = (el: Element | null | undefined): boolean => {
    if (!el) return false;
    try {
      return driver.isEditable(el);
    } catch {
      return false;
    }
  };

  return {
    isTyping() {
      ctx.require('ui.isTyping');
      if (driver.isInlineEditing()) return true;
      const active = driver.builderDocument().activeElement;
      const iframe = driver.canvasIframe();
      if (iframe && active === iframe) {
        let canvasActive: Element | null = null;
        try {
          canvasActive = iframe.contentDocument?.activeElement ?? null;
        } catch {
          canvasActive = null; // cross-origin canvas: cannot look inside
        }
        return editable(canvasActive);
      }
      return editable(active);
    },
    isCommandPaletteOpen() {
      ctx.require('ui.commandPalette');
      return driver.isCommandPaletteOpen();
    },
    openCommandPalette() {
      ctx.require('ui.commandPalette');
      driver.setCommandPaletteOpen(true);
    },
    closeCommandPalette() {
      ctx.require('ui.commandPalette');
      driver.setCommandPaletteOpen(false);
    },
    showPanel(panel) {
      ctx.require('ui.showPanel');
      if (!PANELS.includes(panel)) throw new InvalidArgumentError(`Unknown panel "${String(panel)}"`);
      driver.showPanel(panel);
    },
    breakpoints() {
      ctx.require('ui.breakpoints');
      const active = driver.activeBreakpoint();
      return driver.breakpoints().map((bp) => {
        const width = typeof bp.width === 'number' ? bp.width : bp.width ? Number.parseInt(bp.width, 10) : NaN;
        return {
          key: bp.key,
          label: typeof bp.label === 'string' ? bp.label : bp.key,
          width: Number.isFinite(width) ? width : null,
          base: !!bp.base,
          active: bp.key === active,
        };
      });
    },
    setBreakpoint(key) {
      ctx.require('ui.breakpoints');
      if (!driver.breakpoints().some((bp) => bp.key === key)) {
        throw new InvalidArgumentError(`Unknown breakpoint "${String(key)}"`);
      }
      driver.setActiveBreakpoint(key);
    },
    toggleClasses(force) {
      ctx.require('ui.toggleClasses');
      const next = force ?? !driver.classesVisible();
      if (next && !ctx.selected()) throw new NoSelectionError('ui.toggleClasses');
      driver.setClassesVisible(next);
      return next;
    },
  };
}
