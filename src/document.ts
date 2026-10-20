import type { Context } from './context';
import { sleep, waitFor } from './context';
import { TimeoutError } from './errors';
import type { SaveOptions } from './types';

export interface DocumentApi {
  /** Saves the post/template (like Ctrl/Cmd+S). Resolves when Bricks has finished saving. */
  save(options?: SaveOptions): Promise<void>;
  /** Whether the builder has changes that are not saved yet. */
  hasUnsavedChanges(): boolean;
}

export function createDocument(ctx: Context): DocumentApi {
  const { driver } = ctx;

  return {
    async save(options = {}) {
      ctx.require('document.save');
      const timeout = options.timeout ?? 15000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(`Saving did not finish within ${timeout} ms`)), timeout);
      });
      timedOut.catch(() => {});
      try {
        const started = Date.now();
        await Promise.race([Promise.resolve(driver.save()), timedOut]);
        await sleep(0);
        const done = await waitFor(() => (driver.isSaving() ? undefined : true), timeout - (Date.now() - started));
        if (!done) throw new TimeoutError(`Saving did not finish within ${timeout} ms`);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    hasUnsavedChanges() {
      ctx.require('document.unsavedChanges');
      return driver.unsavedChangesCount() > 0;
    },
  };
}
