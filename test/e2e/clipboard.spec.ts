import { expect, test } from './fixtures';
import { byId, expectUndoableAction, settle } from './helpers';

test.describe('clipboard', () => {
  test('copy() writes Bricks JSON of the selection to the system clipboard', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.selection.set('blkone'));
    await page.evaluate(() => window.bricks.clipboard.copy());
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const data = JSON.parse(text);
    expect(data.source).toBe('bricksCopiedElements');
    const ids = (data.content as Array<{ id: string }>).map((e) => e.id);
    expect(ids).toContain('blkone');
    expect(ids).toContain('txtone'); // children come along
  });

  test('paste() inserts the clipboard after the selection', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.selection.set('butone'));
    await page.evaluate(() => window.bricks.clipboard.copy());
    await settle(page);
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.clipboard.paste()),
      ({ result, after }) => {
        expect(result).toHaveLength(1);
        const pasted = result[0]!;
        expect(pasted.name).toBe('button');
        expect(pasted.id).not.toBe('butone');
        expect(byId(after, 'conone')!.children).toEqual(['headon', 'butone', pasted.id, 'blkone']);
      },
    );
  });

  test('paste() a nestable with children', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.selection.set('blkone'));
    await page.evaluate(() => window.bricks.clipboard.copy());
    await settle(page);
    await expectUndoableAction(
      page,
      () => page.evaluate(() => window.bricks.clipboard.paste()),
      ({ result, after }) => {
        expect(result).toHaveLength(1);
        expect(result[0]!.name).toBe('block');
        const copy = byId(after, result[0]!.id)!;
        expect(copy.children).toHaveLength(1);
        expect(byId(after, copy.children[0]!)!.name).toBe('text-basic');
      },
    );
  });

  test('paste() resolves [] for non-Bricks clipboard content', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => navigator.clipboard.writeText('just some text'));
    await page.evaluate(() => window.bricks.selection.set('butone'));
    const r = await page.evaluate(() => window.bricks.clipboard.paste({ timeout: 1000 }));
    expect(r).toEqual([]);
  });

  test('copy() without selection throws NoSelectionError', async ({ page, builder }) => {
    void builder;
    const name = await page.evaluate(() => {
      window.bricks.selection.set(null);
      return window.bricks.clipboard.copy().then(
        () => 'ok',
        (e: Error) => e.name,
      );
    });
    expect(name).toBe('NoSelectionError');
  });
});
