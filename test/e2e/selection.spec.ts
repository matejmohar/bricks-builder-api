import { expect, test } from './fixtures';

test.describe('selection', () => {
  test('get() / set() are synchronous and validate ids', async ({ page, builder }) => {
    void builder;
    const r = await page.evaluate(() => {
      const b = window.bricks;
      const initial = b.selection.get();
      const set = b.selection.set('headon');
      const immediately = b.selection.get();
      const state = b.unstable.state.activeId;
      let notFound: string | null = null;
      try {
        b.selection.set('nope00');
      } catch (e) {
        notFound = (e as Error).name;
      }
      const cleared = b.selection.set(null);
      return { initial, set, immediately, state, notFound, cleared, after: b.selection.get() };
    });
    expect(r.initial).toBeNull();
    expect(r.set).toEqual({
      id: 'headon',
      name: 'heading',
      parentId: 'conone',
      label: null,
      isNestable: false,
      childIds: [],
    });
    expect(r.immediately?.id).toBe('headon');
    expect(r.state).toBe('headon');
    expect(r.notFound).toBe('ElementNotFoundError');
    expect(r.cleared).toBeNull();
    expect(r.after).toBeNull();
  });

  test('set() marks the element active in the canvas', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.selection.set('butone'));
    const frame = page.frameLocator('#bricks-builder-iframe');
    await expect(frame.locator('[data-id="butone"]')).toHaveClass(/is-active-element/);
    await page.evaluate(() => window.bricks.selection.set(null));
    await expect(frame.locator('[data-id="butone"]')).not.toHaveClass(/is-active-element/);
  });

  test('onChange() fires for API changes and canvas clicks, with next/prev', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => {
      window.__seen = [];
      (window as any).__off = window.bricks.selection.onChange((next, prev) =>
        window.__seen.push([next?.id ?? null, prev?.id ?? null]),
      );
    });
    await page.evaluate(() => window.bricks.selection.set('headon'));
    await page.waitForTimeout(100);
    // Select from the canvas like a user would.
    await page.frameLocator('#bricks-builder-iframe').locator('[data-id="butone"]').click();
    await expect.poll(() => page.evaluate(() => window.bricks.selection.get()?.id)).toBe('butone');
    await page.waitForTimeout(100);
    await page.evaluate(() => window.bricks.selection.set(null));
    await page.waitForTimeout(100);
    const seen = await page.evaluate(() => window.__seen);
    expect(seen).toEqual([
      ['headon', null],
      ['butone', 'headon'],
      [null, 'butone'],
    ]);
    await page.evaluate(() => {
      (window as any).__off();
      window.bricks.selection.set('headon');
    });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__seen.length)).toBe(3);
  });

  test('parent() / firstChild() / next() / previous()', async ({ page, builder }) => {
    void builder;
    const path = await page.evaluate(() => {
      const s = window.bricks.selection;
      const id = (x: { id: string } | null) => (x ? x.id : null);
      s.set('txtone');
      return [
        id(s.parent()), // blkone
        id(s.previous()), // butone
        id(s.previous()), // headon
        id(s.previous()), // null (first)
        id(s.get()), // headon
        id(s.next()), // butone
        id(s.next()), // blkone
        id(s.next()), // null (last)
        id(s.firstChild()), // txtone
        id(s.firstChild()), // null (leaf)
        id(s.parent()), // blkone
        id(s.parent()), // conone
        id(s.parent()), // secone
        id(s.parent()), // null (root)
        id(s.next()), // sectwo (root-level sibling)
        id(s.next()), // null
        id(s.previous()), // secone
      ];
    });
    expect(path).toEqual([
      'blkone',
      'butone',
      'headon',
      null,
      'headon',
      'butone',
      'blkone',
      null,
      'txtone',
      null,
      'blkone',
      'conone',
      'secone',
      null,
      'sectwo',
      null,
      'secone',
    ]);
  });

  test('navigation without a selection throws NoSelectionError', async ({ page, builder }) => {
    void builder;
    const names = await page.evaluate(() => {
      window.bricks.selection.set(null);
      return (['parent', 'firstChild', 'next', 'previous'] as const).map((m) => {
        try {
          window.bricks.selection[m]();
          return 'no error';
        } catch (e) {
          return (e as Error).name;
        }
      });
    });
    expect(names).toEqual(['NoSelectionError', 'NoSelectionError', 'NoSelectionError', 'NoSelectionError']);
  });
});
