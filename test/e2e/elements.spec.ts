import { expect, test } from './fixtures';
import { byId, expectUndoableAction, settle, tree } from './helpers';

test.describe('elements', () => {
  test('get() reads the seeded tree', async ({ page, builder }) => {
    void builder;
    const info = await page.evaluate(() => window.bricks.elements.get('conone'));
    expect(info).toEqual({
      id: 'conone',
      name: 'container',
      parentId: 'secone',
      label: null,
      isNestable: true,
      childIds: ['headon', 'butone', 'blkone'],
    });
    expect(await page.evaluate(() => window.bricks.elements.get('nope'))).toBeNull();
  });

  test('insert() into a selected nestable (auto)', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.selection.set('conone'));
    const { result, after } = await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.insert('heading')),
      ({ result, after }) => {
        expect(result.name).toBe('heading');
        expect(result.parentId).toBe('conone');
        expect(byId(after, 'conone')!.children).toEqual(['headon', 'butone', 'blkone', result.id]);
      },
    );
    expect(byId(after, result.id)).toBeTruthy();
    expect(await page.evaluate(() => window.bricks.selection.get()?.id)).toBe('conone');
  });

  test('insert() after a selected leaf (auto)', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.selection.set('headon'));
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.insert('button')),
      ({ result, after }) => {
        expect(result.parentId).toBe('conone');
        expect(byId(after, 'conone')!.children).toEqual(['headon', result.id, 'butone', 'blkone']);
      },
    );
    expect(await page.evaluate(() => window.bricks.selection.get()?.id)).toBe('headon');
  });

  test("insert() with position 'outside' goes to the grandparent", async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.selection.set('txtone'));
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.insert('heading', { position: 'outside' })),
      ({ result, after }) => {
        // txtone's parent is blkone; its grandparent is conone.
        expect(result.parentId).toBe('conone');
        expect(byId(after, 'conone')!.children).toContain(result.id);
        expect(byId(after, 'blkone')!.children).toEqual(['txtone']);
      },
    );
    expect(await page.evaluate(() => window.bricks.unstable.state.insertAfter)).toBe(false);
  });

  test('insert() with no selection appends at root; section creates a container', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.selection.set(null));
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.insert('section')),
      ({ result, after }) => {
        expect(result.parentId).toBeNull();
        expect(result.childIds).toHaveLength(1);
        expect(byId(after, result.childIds[0]!)!.name).toBe('container');
        const roots = after.filter((n) => n.parent === null).map((n) => n.id);
        expect(roots).toEqual(['secone', 'sectwo', result.id]);
      },
    );
  });

  test('insert() rejects unknown element types', async ({ page, builder }) => {
    void builder;
    const err = await page.evaluate(() =>
      Promise.resolve()
        .then(() => window.bricks.elements.insert('definitely-not-an-element'))
        .catch((e: Error) => e.name),
    );
    expect(err).toBe('InvalidArgumentError');
  });

  test('duplicate() the selection', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.selection.set('butone'));
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.duplicate()),
      ({ result, after }) => {
        expect(result.name).toBe('button');
        expect(result.id).not.toBe('butone');
        expect(byId(after, 'conone')!.children).toEqual(['headon', 'butone', result.id, 'blkone']);
      },
    );
    expect(await page.evaluate(() => window.bricks.selection.get()?.id)).toBe('butone');
  });

  test('duplicate() a nestable by id copies its children', async ({ page, builder }) => {
    void builder;
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.duplicate('blkone')),
      ({ result, after }) => {
        expect(result.name).toBe('block');
        expect(byId(after, 'conone')!.children).toEqual(['headon', 'butone', 'blkone', result.id]);
        const copy = byId(after, result.id)!;
        expect(copy.children).toHaveLength(1);
        expect(byId(after, copy.children[0]!)!.name).toBe('text-basic');
      },
    );
  });

  test('duplicate() a root section', async ({ page, builder }) => {
    void builder;
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.duplicate('secone')),
      ({ result, after }) => {
        expect(result.parentId).toBeNull();
        const roots = after.filter((n) => n.parent === null).map((n) => n.id);
        expect(roots).toEqual(['secone', result.id, 'sectwo']);
      },
    );
  });

  test('delete() the selection; selection moves', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.selection.set('butone'));
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.delete()),
      ({ after }) => {
        expect(byId(after, 'butone')).toBeUndefined();
        expect(byId(after, 'conone')!.children).toEqual(['headon', 'blkone']);
      },
    );
  });

  test('delete() by id removes children too', async ({ page, builder }) => {
    void builder;
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.delete('blkone')),
      ({ after }) => {
        expect(byId(after, 'blkone')).toBeUndefined();
        expect(byId(after, 'txtone')).toBeUndefined();
      },
    );
  });

  test('delete() without selection throws NoSelectionError', async ({ page, builder }) => {
    void builder;
    const err = await page.evaluate(() => {
      window.bricks.selection.set(null);
      try {
        window.bricks.elements.delete();
        return null;
      } catch (e) {
        return (e as Error).name;
      }
    });
    expect(err).toBe('NoSelectionError');
  });

  test('wrap() in the default wrap element; wrapper becomes selected', async ({ page, builder }) => {
    void builder;
    const wrapDefault = await page.evaluate(() => (window as any).bricksData.builderWrapElement);
    await page.evaluate(() => window.bricks.selection.set('headon'));
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.wrap()),
      async ({ result, after }) => {
        expect(result.name).toBe(wrapDefault || 'block');
        expect(result.parentId).toBe('conone');
        expect(byId(after, result.id)!.children).toEqual(['headon']);
        expect(byId(after, 'headon')!.parent).toBe(result.id);
        expect(byId(after, 'conone')!.children).toEqual([result.id, 'butone', 'blkone']);
        expect(await page.evaluate(() => window.bricks.selection.get()?.id)).toBe(result.id);
      },
    );
  });

  test.describe('wrap() tags', () => {
    for (const tag of ['div', 'container'] as const) {
      test(`wrap('${tag}')`, async ({ page, builder }) => {
        void builder;
        await page.evaluate(() => window.bricks.selection.set('butone'));
        await expectUndoableAction(
          page,
          () => page.evaluate((t) => window.bricks.elements.wrap(t), tag),
          ({ result, after }) => {
            expect(result.name).toBe(tag);
            expect(byId(after, result.id)!.children).toEqual(['butone']);
          },
        );
      });
    }
  });

  test('rename() sets the label and updates the Structure panel', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.ui.showPanel('structure'));
    await page.evaluate(() => window.bricks.selection.set('butone'));
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.rename('Hero title', 'headon')),
      async ({ result, after }) => {
        expect(result.label).toBe('Hero title');
        expect(byId(after, 'headon')!.label).toBe('Hero title');
        await expect(page.locator('#bricks-structure .structure-item', { hasText: 'Hero title' })).toHaveCount(1);
      },
    );
  });

  test('rename() of the selected element: Structure panel shows it once deselected', async ({ page, builder }) => {
    void builder;
    // Bricks 2.4 caches the *active* structure item's title (localLabel) when it
    // becomes active, so the new title appears after the selection moves.
    await page.evaluate(() => window.bricks.ui.showPanel('structure'));
    await page.evaluate(() => window.bricks.selection.set('headon'));
    const info = await page.evaluate(() => window.bricks.elements.rename('Selected rename'));
    expect(info.label).toBe('Selected rename');
    expect(byId(await tree(page), 'headon')!.label).toBe('Selected rename');
    await page.evaluate(() => window.bricks.selection.set('butone'));
    await expect(page.locator('#bricks-structure .structure-item', { hasText: 'Selected rename' })).toHaveCount(1);
  });

  test('rename() with an empty label resets it', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.elements.rename('Temp', 'butone'));
    await settle(page);
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.elements.rename('', 'butone')),
      ({ result, after }) => {
        expect(result.label).toBeNull();
        expect(byId(after, 'butone')!.label).toBeNull();
      },
    );
    expect((await tree(page)).find((n) => n.id === 'butone')!.label).toBeNull();
  });
});
