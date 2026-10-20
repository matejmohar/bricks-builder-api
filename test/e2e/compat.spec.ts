/**
 * Generates compat/matrix.json: for the connected Bricks version, one smoke
 * check per capability (undoable actions also check history/undo/redo).
 * Render it with `npm run compat` (scripts/render-compat.mjs).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import type { Capability } from '../../src/index';
import { CAPABILITIES } from '../../src/types';
import { expect, test } from './fixtures';
import { byId, expectUndoableAction, savedContent, settle, tree } from './helpers';

const MATRIX_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../compat/matrix.json');

type Check = (page: Page, postId: number) => Promise<void>;

const checks: Record<Capability, Check> = {
  'selection.get': async (page) => {
    await page.evaluate(() => (window.bricks.unstable.state.activeId = 'headon'));
    expect(await page.evaluate(() => window.bricks.selection.get()?.id)).toBe('headon');
  },
  'selection.set': async (page) => {
    expect(await page.evaluate(() => window.bricks.selection.set('butone')?.id)).toBe('butone');
    expect(await page.evaluate(() => window.bricks.unstable.state.activeId)).toBe('butone');
  },
  'selection.onChange': async (page) => {
    await page.evaluate(() => {
      window.__seen = [];
      window.bricks.selection.set(null);
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const off = window.bricks.selection.onChange((n, p) => window.__seen.push([n?.id ?? null, p?.id ?? null]));
      window.bricks.selection.set('headon');
      setTimeout(off, 100);
    });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__seen)).toEqual([['headon', null]]);
  },
  'selection.navigate': async (page) => {
    const r = await page.evaluate(() => {
      const s = window.bricks.selection;
      s.set('headon');
      return [s.next()?.id, s.previous()?.id, s.parent()?.id, s.firstChild()?.id];
    });
    expect(r).toEqual(['butone', 'headon', 'conone', 'headon']);
  },
  'elements.get': async (page) => {
    expect(await page.evaluate(() => window.bricks.elements.get('conone')?.childIds)).toContain('headon');
  },
  'elements.insert': async (page) => {
    await page.evaluate(() => window.bricks.selection.set('contwo'));
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.insert('heading')),
      ({ result, after }) => expect(byId(after, 'contwo')!.children).toContain(result.id),
    );
  },
  'elements.duplicate': async (page) => {
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.duplicate('headon')),
      ({ result, after }) => expect(byId(after, 'conone')!.children[1]).toBe(result.id),
    );
  },
  'elements.rename': async (page) => {
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.rename('Compat', 'headon')),
      ({ after }) => expect(byId(after, 'headon')!.label).toBe('Compat'),
    );
  },
  'elements.wrap': async (page) => {
    await page.evaluate(() => window.bricks.selection.set('butone'));
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.wrap('div')),
      ({ result, after }) => expect(byId(after, 'butone')!.parent).toBe(result.id),
    );
  },
  'elements.delete': async (page) => {
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.delete('txtone')),
      ({ after }) => expect(byId(after, 'txtone')).toBeUndefined(),
    );
  },
  'clipboard.copy': async (page) => {
    await page.evaluate(() => window.bricks.selection.set('headon'));
    await page.evaluate(() => window.bricks.clipboard.copy());
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('"headon"');
  },
  'clipboard.paste': async (page) => {
    await page.evaluate(() => window.bricks.selection.set('headon'));
    await page.evaluate(() => window.bricks.clipboard.copy());
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.clipboard.paste()),
      ({ result }) => expect(result.map((e) => e.name)).toEqual(['heading']),
    );
  },
  'history.undo': async (page) => {
    await settle(page);
    await page.evaluate(() => window.bricks.elements.rename('Before undo', 'blkone'));
    await settle(page);
    expect(await page.evaluate(() => window.bricks.history.undo())).toBe(true);
    await settle(page);
    expect(byId(await tree(page), 'blkone')!.label).toBeNull();
  },
  'history.redo': async (page) => {
    expect(await page.evaluate(() => window.bricks.history.canRedo())).toBe(true);
    expect(await page.evaluate(() => window.bricks.history.redo())).toBe(true);
    await settle(page);
    expect(byId(await tree(page), 'blkone')!.label).toBe('Before undo');
  },
  'document.unsavedChanges': async (page) => {
    await page.evaluate(() => window.bricks.elements.rename('Unsaved', 'blkone'));
    expect(await page.evaluate(() => window.bricks.document.hasUnsavedChanges())).toBe(true);
  },
  'document.save': async (page, postId) => {
    await page.evaluate(() => window.bricks.document.save());
    expect(await page.evaluate(() => window.bricks.document.hasUnsavedChanges())).toBe(false);
    expect(savedContent(postId).find((e) => e.id === 'blkone')?.label).toBe('Unsaved');
  },
  'ui.isTyping': async (page) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await page.evaluate(() => window.bricks.ui.isTyping())).toBe(false);
    await page.evaluate(() => {
      const i = document.createElement('input');
      document.body.appendChild(i);
      i.focus();
    });
    expect(await page.evaluate(() => window.bricks.ui.isTyping())).toBe(true);
    await page.evaluate(() => (document.activeElement as HTMLElement).remove());
  },
  'ui.commandPalette': async (page) => {
    await page.evaluate(() => window.bricks.ui.openCommandPalette());
    await expect(page.locator('[class*="command-palette"]').first()).toBeVisible();
    await page.evaluate(() => window.bricks.ui.closeCommandPalette());
    expect(await page.evaluate(() => window.bricks.ui.isCommandPaletteOpen())).toBe(false);
  },
  'ui.showPanel': async (page) => {
    await page.evaluate(() => window.bricks.ui.showPanel('structure'));
    await expect.poll(() => page.evaluate(() => window.bricks.unstable.state.activePanel)).toBe('structure');
  },
  'ui.breakpoints': async (page) => {
    const bps = await page.evaluate(() => window.bricks.ui.breakpoints());
    const target = bps.find((b) => !b.active)!;
    await page.evaluate((k) => window.bricks.ui.setBreakpoint(k), target.key);
    expect((await page.evaluate(() => window.bricks.ui.breakpoints())).find((b) => b.active)?.key).toBe(target.key);
    await page.evaluate((k) => window.bricks.ui.setBreakpoint(k), bps.find((b) => b.active)!.key);
  },
  'ui.toggleClasses': async (page) => {
    await page.evaluate(() => window.bricks.selection.set('headon'));
    expect(await page.evaluate(() => window.bricks.ui.toggleClasses(true))).toBe(true);
    expect(await page.evaluate(() => window.bricks.unstable.state.showElementClasses)).toBe(true);
    expect(await page.evaluate(() => window.bricks.ui.toggleClasses(false))).toBe(false);
  },
  'ui.rename': async (page) => {
    await page.evaluate(() => window.bricks.ui.showPanel('structure'));
    expect(await page.evaluate(() => window.bricks.ui.startRename('headon'))).toBe(true);
    await expect(page.locator('#bricks-structure li[data-id="headon"] > .structure-item .title input')).toBeFocused();
    await page.keyboard.press('Escape');
  },
};

test('compatibility matrix', async ({ page, builder, postId }) => {
  void builder;
  test.setTimeout(600_000);
  const version = (await page.evaluate(() => window.bricks.version)) ?? 'unknown';
  const supported = await page.evaluate(() => window.bricks.capabilities());
  const results: Record<string, 'pass' | 'fail'> = {};
  const failures: string[] = [];

  // The order matters: checks run in one builder session.
  const order: Capability[] = [
    'selection.get',
    'selection.set',
    'selection.onChange',
    'selection.navigate',
    'elements.get',
    'elements.insert',
    'elements.duplicate',
    'elements.rename',
    'elements.wrap',
    'elements.delete',
    'clipboard.copy',
    'clipboard.paste',
    'history.undo',
    'history.redo',
    'document.unsavedChanges',
    'document.save',
    'ui.isTyping',
    'ui.commandPalette',
    'ui.showPanel',
    'ui.breakpoints',
    'ui.toggleClasses',
    'ui.rename',
  ];
  expect([...order].sort()).toEqual([...CAPABILITIES].sort());

  for (const cap of order) {
    try {
      if (!supported[cap]) throw new Error('probe: unsupported');
      await checks[cap](page, postId);
      results[cap] = 'pass';
    } catch (e) {
      results[cap] = 'fail';
      failures.push(`${cap}: ${(e as Error).message.split('\n')[0]}`);
    }
  }

  const matrix: Record<string, Record<string, string>> = existsSync(MATRIX_PATH)
    ? JSON.parse(readFileSync(MATRIX_PATH, 'utf8'))
    : {};
  for (const cap of CAPABILITIES) {
    matrix[cap] = { ...(matrix[cap] ?? {}), [version]: results[cap] ?? 'fail' };
  }
  const sorted = Object.fromEntries(CAPABILITIES.map((c) => [c, matrix[c]!]));
  if (!existsSync(dirname(MATRIX_PATH))) mkdirSync(dirname(MATRIX_PATH), { recursive: true });
  writeFileSync(MATRIX_PATH, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`compat matrix for Bricks ${version}:`, JSON.stringify(results));

  expect(failures, failures.join('\n')).toEqual([]);
});
