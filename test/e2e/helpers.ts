import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BricksBuilder } from '../../src/index';

declare global {
  interface Window {
    bricks: BricksBuilder;
    BricksBuilderAPI: typeof import('../../src/index');
    __seen: unknown[];
  }
}

export const IIFE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bricks-builder-api.iife.js');

const WP_PATH = process.env.WP_PATH ?? '/home/user/wp-lab/site';
const WP_CLI = process.env.WP_CLI ?? '/home/user/wp-lab/wp-cli.phar';

export function wp(...args: string[]): string {
  return execFileSync('php', [WP_CLI, '--allow-root', `--path=${WP_PATH}`, `--user=${process.env.BRICKS_USER ?? 'admin'}`, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

export interface SeedElement {
  id: string;
  name: string;
  parent: string | 0;
  children: string[];
  settings: Record<string, unknown>;
  label?: string;
}

/**
 * Fixed starting tree used by most specs:
 *
 *   section#secone
 *     container#conone
 *       heading#headon
 *       button#butone
 *       block#blkone
 *         text-basic#txtone
 *   section#sectwo
 *     container#contwo
 */
export const SEED: SeedElement[] = [
  { id: 'secone', name: 'section', parent: 0, children: ['conone'], settings: {} },
  { id: 'conone', name: 'container', parent: 'secone', children: ['headon', 'butone', 'blkone'], settings: {} },
  { id: 'headon', name: 'heading', parent: 'conone', children: [], settings: { text: 'Seed heading' } },
  { id: 'butone', name: 'button', parent: 'conone', children: [], settings: { text: 'Seed button' } },
  { id: 'blkone', name: 'block', parent: 'conone', children: ['txtone'], settings: {} },
  { id: 'txtone', name: 'text-basic', parent: 'blkone', children: [], settings: { text: 'Seed text' } },
  { id: 'sectwo', name: 'section', parent: 0, children: ['contwo'], settings: {} },
  { id: 'contwo', name: 'container', parent: 'sectwo', children: [], settings: {} },
];

/** Creates a fresh published page with WP-CLI, optionally seeded with Bricks content. */
export function createPage(title: string, content: SeedElement[] = SEED): number {
  const id = Number(wp('post', 'create', '--post_type=page', '--post_status=publish', `--post_title=${title}`, '--porcelain'));
  if (!Number.isInteger(id) || id <= 0) throw new Error(`WP-CLI did not create a page (got "${id}")`);
  wp('post', 'meta', 'update', String(id), '_bricks_editor_mode', 'bricks');
  wp('post', 'meta', 'update', String(id), '_bricks_template_type', 'content');
  if (content.length) {
    wp('post', 'meta', 'update', String(id), '_bricks_page_content_2', JSON.stringify(content), '--format=json');
  }
  return id;
}

export function deletePage(id: number): void {
  try {
    wp('post', 'delete', String(id), '--force');
  } catch {
    /* ignore */
  }
}

/** Saved Bricks content of a post, read with WP-CLI. */
export function savedContent(id: number): SeedElement[] {
  const out = wp('post', 'meta', 'get', String(id), '_bricks_page_content_2', '--format=json');
  return out ? (JSON.parse(out) as SeedElement[]) : [];
}

/** Opens the builder for a post, injects the IIFE build and connects (window.bricks). */
export async function openBuilder(page: Page, postId: number): Promise<void> {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`/?p=${postId}&bricks=run`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(document.querySelector('.brx-body') as any)?.__vue_app__, null, {
    timeout: 60_000,
  });
  await page.addScriptTag({ path: IIFE_PATH });
  await page.evaluate(async () => {
    window.bricks = await window.BricksBuilderAPI.connect({ timeout: 30_000 });
  });
  // Let the builder finish its own start-up (initial history snapshot etc.).
  await page.waitForTimeout(1500);
}

export interface TreeNode {
  id: string;
  name: string;
  parent: string | null;
  children: string[];
  label: string | null;
}

/** The active area's element tree in Bricks' array order. */
export function tree(page: Page): Promise<TreeNode[]> {
  return page.evaluate(() => {
    const els = window.bricks.unstable.globalProperties.$_dynamicElements as { value: any[] };
    return els.value.map((e) => ({
      id: e.id,
      name: e.name,
      parent: e.parent && e.parent !== '0' ? String(e.parent) : null,
      children: [...(e.children ?? [])],
      label: e.label || null,
    }));
  });
}

export function history(page: Page): Promise<{ index: number; length: number; inProgress: boolean }> {
  return page.evaluate(() => {
    const s = window.bricks.unstable.state;
    return { index: s.historyIndex as number, length: (s.history as unknown[]).length, inProgress: !!s.historyInProgress };
  });
}

export function unsavedCount(page: Page): Promise<number> {
  return page.evaluate(() => (window.bricks.unstable.state.unsavedChanges as unknown[]).length);
}

/** Bricks records history ~600 ms after a change (debounced watcher). */
export const HISTORY_SETTLE_MS = 1100;

export async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(HISTORY_SETTLE_MS);
  await page.waitForFunction(() => !window.bricks.unstable.state.historyInProgress);
}

/** Saves so that unsavedChanges starts empty, and lets history settle. */
export async function cleanSlate(page: Page): Promise<void> {
  await settle(page);
  await page.evaluate(() => window.bricks.document.save());
  expect(await unsavedCount(page)).toBe(0);
}

export interface UndoableResult<T> {
  before: TreeNode[];
  after: TreeNode[];
  result: T;
}

/**
 * Runs an action and asserts the standard contract for undoable actions:
 * exactly one new history entry (after the debounce), unsavedChanges non-empty,
 * undo restores the tree exactly, redo re-applies it exactly.
 */
export async function expectUndoableAction<T>(
  page: Page,
  action: () => Promise<T>,
  verify: (r: UndoableResult<T>) => void | Promise<void>,
): Promise<UndoableResult<T>> {
  await cleanSlate(page);
  const before = await tree(page);
  const h0 = await history(page);

  const result = await action();
  await settle(page);
  const after = await tree(page);
  const h1 = await history(page);
  expect(after, 'action changed the tree').not.toEqual(before);
  await verify({ before, after, result });

  expect(h1.index, 'exactly one history entry').toBe(h0.index + 1);
  expect(h1.length, 'history head is the new entry').toBe(h1.index + 1);
  expect(await unsavedCount(page), 'unsavedChanges non-empty').toBeGreaterThan(0);

  expect(await page.evaluate(() => window.bricks.history.canUndo())).toBe(true);
  expect(await page.evaluate(() => window.bricks.history.undo())).toBe(true);
  await settle(page);
  expect(await tree(page), 'undo restores the tree exactly').toEqual(before);
  expect(await page.evaluate(() => window.bricks.history.canRedo())).toBe(true);

  expect(await page.evaluate(() => window.bricks.history.redo())).toBe(true);
  await settle(page);
  expect(await tree(page), 'redo re-applies the action exactly').toEqual(after);
  return { before, after, result };
}

export const byId = (nodes: TreeNode[], id: string): TreeNode | undefined => nodes.find((n) => n.id === id);
