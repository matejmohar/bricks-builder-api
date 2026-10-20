import { describe, expect, it } from 'vitest';
import { createBricksBuilder } from '../../src/connect';
import { ClipboardUnavailableError, NoSelectionError } from '../../src/errors';
import { createFakeBricks, samplePage } from './fake-bricks';

function setup(opts = {}) {
  const fake = createFakeBricks(opts);
  const page = samplePage(fake);
  const bricks = createBricksBuilder(fake.gp, fake.win);
  return { fake, bricks, ...page };
}

describe('clipboard', () => {
  it('copy() calls $_copyElements for the selection', async () => {
    const { bricks, fake, button } = setup();
    bricks.selection.set(button.id);
    await bricks.clipboard.copy();
    expect(fake.calls).toContainEqual(['$_copyElements']);
    expect(fake.clipboardText.value).toContain(button.id);
  });

  it('copy() requires a selection', async () => {
    const { bricks } = setup();
    await expect(bricks.clipboard.copy()).rejects.toBeInstanceOf(NoSelectionError);
  });

  it('paste() resolves with the pasted top-level elements', async () => {
    const { bricks, container } = setup();
    bricks.selection.set(container.id);
    await bricks.clipboard.copy();
    const pasted = await bricks.clipboard.paste();
    expect(pasted).toHaveLength(1);
    expect(pasted[0]!.name).toBe('container');
    expect(pasted[0]!.childIds).toHaveLength(1); // nested child is not reported separately
  });

  it('paste() resolves with [] when nothing gets pasted', async () => {
    const { bricks, fake } = setup();
    fake.clipboardText.value = 'plain text';
    expect(await bricks.clipboard.paste({ timeout: 50 })).toEqual([]);
  });

  it('throws ClipboardUnavailableError without a secure context or clipboard', async () => {
    const insecure = setup({ secureContext: false });
    insecure.bricks.selection.set(insecure.heading.id);
    await expect(insecure.bricks.clipboard.copy()).rejects.toBeInstanceOf(ClipboardUnavailableError);
    await expect(insecure.bricks.clipboard.paste()).rejects.toBeInstanceOf(ClipboardUnavailableError);
    const noClipboard = setup({ clipboard: false });
    noClipboard.bricks.selection.set(noClipboard.heading.id);
    await expect(noClipboard.bricks.clipboard.copy()).rejects.toBeInstanceOf(ClipboardUnavailableError);
  });
});
