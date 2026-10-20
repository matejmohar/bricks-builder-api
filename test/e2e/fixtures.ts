import { test as base } from '@playwright/test';
import { createPage, deletePage, openBuilder, SEED, type SeedElement } from './helpers';

/**
 * `builder` fixture: a fresh WP page (seeded with SEED) opened in the Bricks
 * builder with the IIFE build connected as `window.bricks`.
 */
export const test = base.extend<{ seed: SeedElement[]; postId: number; builder: void }>({
  seed: [SEED, { option: true }],
  postId: async ({ seed }, use, testInfo) => {
    const id = createPage(`e2e ${testInfo.titlePath.slice(1).join(' > ')}`.slice(0, 180), seed);
    await use(id);
    deletePage(id);
  },
  builder: async ({ page, postId }, use) => {
    await openBuilder(page, postId);
    await use();
  },
});

export { expect } from '@playwright/test';
