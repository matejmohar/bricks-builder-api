import type { Context } from './context';
import { parentIdOf, sleep, waitFor } from './context';
import { ClipboardUnavailableError, NoSelectionError } from './errors';
import type { ElementInfo, PasteOptions } from './types';

export interface ClipboardApi {
  /**
   * Copies the selection (with its children) to the system clipboard as Bricks
   * JSON, exactly like Ctrl/Cmd+C in the builder.
   */
  copy(): Promise<void>;
  /**
   * Pastes Bricks JSON from the system clipboard after the selection (like
   * Ctrl/Cmd+V). Resolves with the pasted top-level elements, or `[]` when
   * nothing was pasted within `timeout` (e.g. the clipboard holds no Bricks data).
   */
  paste(options?: PasteOptions): Promise<ElementInfo[]>;
}

export function createClipboard(ctx: Context): ClipboardApi {
  const { driver } = ctx;

  const ensureClipboard = (): void => {
    if (!driver.clipboardAvailable()) {
      throw new ClipboardUnavailableError(
        'The system clipboard is not available (requires a secure context and clipboard permission)',
      );
    }
  };

  return {
    async copy() {
      ctx.require('clipboard.copy');
      ensureClipboard();
      if (!ctx.selected()) throw new NoSelectionError('clipboard.copy');
      driver.copySelection();
      // Bricks starts navigator.clipboard.writeText synchronously; give it a turn.
      await sleep(0);
    },

    async paste(options = {}) {
      ctx.require('clipboard.paste');
      ensureClipboard();
      const timeout = options.timeout ?? 3000;
      const before = new Set(driver.allElements().map((e) => e.id));
      driver.pasteFromClipboard();
      const added = await waitFor(() => {
        const fresh = driver.allElements().filter((e) => !before.has(e.id));
        return fresh.length ? fresh : undefined;
      }, timeout);
      if (!added) return [];
      // Let Bricks finish inserting nested children before reporting.
      await sleep(50);
      const fresh = driver.allElements().filter((e) => !before.has(e.id));
      const freshIds = new Set(fresh.map((e) => e.id));
      return fresh.filter((e) => !freshIds.has(parentIdOf(e) ?? '')).map((e) => ctx.info(e));
    },
  };
}
