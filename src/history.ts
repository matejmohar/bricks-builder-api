import type { Context } from './context';

export interface HistoryApi {
  /**
   * Undoes the last history entry. Returns false (and does nothing) when there
   * is nothing to undo or Bricks is still applying a previous step.
   *
   * Note: Bricks records history with a debounced watcher, so an action only
   * becomes undoable roughly 600 ms after it happened.
   */
  undo(): boolean;
  /** Redoes the next history entry. Returns false when there is nothing to redo. */
  redo(): boolean;
  /** Same rule as Bricks' toolbar undo button. */
  canUndo(): boolean;
  /** Same rule as Bricks' toolbar redo button. */
  canRedo(): boolean;
}

export function createHistory(ctx: Context): HistoryApi {
  const { driver } = ctx;

  const canUndo = (): boolean => {
    ctx.require('history.undo');
    const h = driver.historyStatus();
    return !h.inProgress && h.length >= 2 && h.index > 0;
  };
  const canRedo = (): boolean => {
    ctx.require('history.redo');
    const h = driver.historyStatus();
    return !h.inProgress && h.index !== h.length && h.index + 1 < h.length;
  };

  return {
    canUndo,
    canRedo,
    undo() {
      if (!canUndo()) return false;
      driver.goto('undo');
      return true;
    },
    redo() {
      if (!canRedo()) return false;
      driver.goto('redo');
      return true;
    },
  };
}
