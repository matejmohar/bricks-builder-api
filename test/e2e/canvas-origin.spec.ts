import { expect, test } from './fixtures';
import { byId, history, settle, tree, unsavedCount } from './helpers';

/**
 * After the user clicks in the canvas, Bricks marks the canvas app as the origin of changes
 * ($_state.messageOrigin = 'iframe'). Changes made through the builder window's app are then
 * neither synced to the canvas nor recorded in history unless the library claims the builder
 * window first, which every mutating call does.
 */
test.describe('actions after a click in the canvas', () => {
  test('duplicate, delete and undo render in the canvas and land in history', async ({ page, builder }) => {
    void builder;
    const frame = page.frameLocator('#bricks-builder-iframe');
    await frame.locator('#brxe-headon').click();
    await expect.poll(() => page.evaluate(() => window.bricks.selection.get()?.id)).toBe('headon');
    expect(await page.evaluate(() => window.bricks.unstable.state.messageOrigin)).toBe('iframe');
    await settle(page);
    const before = await tree(page);
    const h0 = await history(page);

    const copy = await page.evaluate(() => window.bricks.elements.duplicate().id);
    await expect(frame.locator(`#brxe-${copy}`), 'the canvas renders the copy').toHaveCount(1);
    await settle(page);
    const h1 = await history(page);
    expect(h1.index, 'one history entry').toBe(h0.index + 1);
    expect(await unsavedCount(page), 'unsaved changes tracked').toBeGreaterThan(0);

    await frame.locator('#brxe-butone').click();
    await expect.poll(() => page.evaluate(() => window.bricks.selection.get()?.id)).toBe('butone');
    await page.evaluate(() => window.bricks.elements.delete());
    await expect(frame.locator('#brxe-butone'), 'the canvas drops the deleted button').toHaveCount(0);
    await settle(page);
    expect((await history(page)).index).toBe(h1.index + 1);

    await frame.locator(`#brxe-${copy}`).click();
    expect(await page.evaluate(() => window.bricks.history.undo())).toBe(true);
    await settle(page);
    expect(await page.evaluate(() => window.bricks.history.undo())).toBe(true);
    await settle(page);
    expect(await tree(page), 'two undos restore the tree').toEqual(before);
    await expect(frame.locator(`#brxe-${copy}`)).toHaveCount(0);
    await expect(frame.locator('#brxe-butone')).toHaveCount(1);
  });

  test('selection.set() moves the canvas highlight', async ({ page, builder }) => {
    void builder;
    const frame = page.frameLocator('#bricks-builder-iframe');
    await frame.locator('#brxe-headon').click();
    await expect.poll(() => page.evaluate(() => window.bricks.selection.get()?.id)).toBe('headon');
    await page.evaluate(() => window.bricks.selection.set('txtone'));
    await expect(frame.locator('#brxe-txtone')).toHaveClass(/is-active-element/);
    await expect(frame.locator('#brxe-headon')).not.toHaveClass(/is-active-element/);
  });

  test('insert() and wrap() render in the canvas', async ({ page, builder }) => {
    void builder;
    const frame = page.frameLocator('#bricks-builder-iframe');
    await frame.locator('#brxe-txtone').click();
    await expect.poll(() => page.evaluate(() => window.bricks.selection.get()?.id)).toBe('txtone');
    const wrapper = await page.evaluate(async () => (await window.bricks.elements.wrap()).id);
    await expect(frame.locator(`#brxe-${wrapper} #brxe-txtone`), 'text is inside the wrapper in the canvas').toHaveCount(1);
    await frame.locator('#brxe-headon').click();
    const inserted = await page.evaluate(() => window.bricks.elements.insert('button').id);
    await expect(frame.locator(`#brxe-${inserted}`)).toHaveCount(1);
    expect(byId(await tree(page), inserted)?.parent).toBe('conone');
  });
});
