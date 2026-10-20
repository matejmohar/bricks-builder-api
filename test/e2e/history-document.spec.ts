import { expect, test } from './fixtures';
import { history, savedContent, settle, tree, unsavedCount } from './helpers';

test.describe('history', () => {
  test('canUndo/canRedo follow Bricks toolbar rules', async ({ page, builder }) => {
    void builder;
    await settle(page);
    const h0 = await history(page);
    const r0 = await page.evaluate(() => [window.bricks.history.canUndo(), window.bricks.history.canRedo()]);
    expect(r0).toEqual([h0.length >= 2 && h0.index > 0, h0.index + 1 < h0.length]);
    // Nothing to undo on a fresh builder.
    expect(r0[0]).toBe(false);
    expect(await page.evaluate(() => window.bricks.history.undo())).toBe(false);
    expect(await page.evaluate(() => window.bricks.history.redo())).toBe(false);

    await page.evaluate(() => window.bricks.elements.rename('One', 'headon'));
    await settle(page);
    await page.evaluate(() => window.bricks.elements.rename('Two', 'headon'));
    await settle(page);
    expect(await page.evaluate(() => [window.bricks.history.canUndo(), window.bricks.history.canRedo()])).toEqual([
      true,
      false,
    ]);
    expect(await page.evaluate(() => window.bricks.history.undo())).toBe(true);
    await settle(page);
    expect((await tree(page)).find((n) => n.id === 'headon')!.label).toBe('One');
    expect(await page.evaluate(() => [window.bricks.history.canUndo(), window.bricks.history.canRedo()])).toEqual([
      true,
      true,
    ]);
    expect(await page.evaluate(() => window.bricks.history.undo())).toBe(true);
    await settle(page);
    expect((await tree(page)).find((n) => n.id === 'headon')!.label).toBeNull();
    expect(await page.evaluate(() => window.bricks.history.canUndo())).toBe(false);
    expect(await page.evaluate(() => window.bricks.history.redo())).toBe(true);
    await settle(page);
    expect((await tree(page)).find((n) => n.id === 'headon')!.label).toBe('One');
  });

  test('undo() is refused while Bricks applies a step', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.elements.rename('One', 'headon'));
    await settle(page);
    await page.evaluate(() => window.bricks.elements.rename('Two', 'headon'));
    await settle(page);
    const r = await page.evaluate(() => [window.bricks.history.undo(), window.bricks.history.undo()]);
    expect(r).toEqual([true, false]);
  });
});

test.describe('document', () => {
  test('save() persists and clears unsaved changes', async ({ page, builder, postId }) => {
    void builder;
    expect(await page.evaluate(() => window.bricks.document.hasUnsavedChanges())).toBe(false);
    const inserted = await page.evaluate(() => {
      window.bricks.selection.set('contwo');
      return window.bricks.elements.insert('heading');
    });
    await page.evaluate(() => window.bricks.elements.rename('Saved label', 'headon'));
    expect(await page.evaluate(() => window.bricks.document.hasUnsavedChanges())).toBe(true);
    await page.evaluate(() => window.bricks.document.save());
    expect(await page.evaluate(() => window.bricks.unstable.state.isSaving)).toBe(false);
    expect(await unsavedCount(page)).toBe(0);
    expect(await page.evaluate(() => window.bricks.document.hasUnsavedChanges())).toBe(false);

    const saved = savedContent(postId);
    expect(saved.find((e) => e.id === inserted.id)?.parent).toBe('contwo');
    expect(saved.find((e) => e.id === 'headon')?.label).toBe('Saved label');
  });
});
