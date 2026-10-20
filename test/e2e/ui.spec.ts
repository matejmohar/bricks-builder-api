import { expect, test } from './fixtures';

test.describe('ui', () => {
  test('isTyping() for builder inputs, canvas contenteditable and inline editing', async ({ page, builder }) => {
    void builder;
    // Bricks focuses the Elements panel search input on load.
    const atLoad = await page.evaluate(() => ({
      typing: window.bricks.ui.isTyping(),
      active: document.activeElement?.className,
    }));
    console.log('isTyping at load:', JSON.stringify(atLoad));

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await page.evaluate(() => window.bricks.ui.isTyping())).toBe(false);

    // A text input in the builder panels.
    await page.evaluate(() => {
      const i = document.createElement('input');
      i.id = 'e2e-input';
      document.body.appendChild(i);
      i.focus();
    });
    expect(await page.evaluate(() => window.bricks.ui.isTyping())).toBe(true);
    await page.evaluate(() => document.getElementById('e2e-input')!.remove());
    expect(await page.evaluate(() => window.bricks.ui.isTyping())).toBe(false);

    // A contenteditable inside the canvas iframe.
    const frame = page.frameLocator('#bricks-builder-iframe');
    await frame.locator('body').evaluate(() => {
      const d = document.createElement('div');
      d.id = 'e2e-editable';
      d.contentEditable = 'true';
      d.textContent = 'type here';
      document.body.appendChild(d);
    });
    await frame.locator('#e2e-editable').focus();
    expect(await page.evaluate(() => window.bricks.ui.isTyping())).toBe(true);
    await frame.locator('#e2e-editable').evaluate((d) => d.remove());
    await page.evaluate(() => (document.querySelector('#bricks-toolbar') as HTMLElement | null)?.focus());
    await page.locator('body').click({ position: { x: 5, y: 500 } }).catch(() => {});
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // Bricks' own inline editing flag.
    await page.evaluate(() => (window.bricks.unstable.state.isInlineEditing = true));
    expect(await page.evaluate(() => window.bricks.ui.isTyping())).toBe(true);
    await page.evaluate(() => (window.bricks.unstable.state.isInlineEditing = false));
    expect(await page.evaluate(() => window.bricks.ui.isTyping())).toBe(false);
  });

  test('command palette opens and closes', async ({ page, builder }) => {
    void builder;
    expect(await page.evaluate(() => window.bricks.ui.isCommandPaletteOpen())).toBe(false);
    await page.evaluate(() => window.bricks.ui.openCommandPalette());
    expect(await page.evaluate(() => window.bricks.ui.isCommandPaletteOpen())).toBe(true);
    await expect(page.locator('[class*="command-palette"]').first()).toBeVisible();
    await page.evaluate(() => window.bricks.ui.closeCommandPalette());
    expect(await page.evaluate(() => window.bricks.ui.isCommandPaletteOpen())).toBe(false);
  });

  test('showPanel() switches panels', async ({ page, builder }) => {
    void builder;
    for (const panel of ['structure', 'elements'] as const) {
      await page.evaluate((p) => window.bricks.ui.showPanel(p), panel);
      await expect.poll(() => page.evaluate(() => window.bricks.unstable.state.activePanel)).toBe(panel);
    }
    await page.evaluate(() => {
      window.bricks.selection.set('headon');
      window.bricks.ui.showPanel('element');
    });
    await expect.poll(() => page.evaluate(() => window.bricks.unstable.state.activePanel)).toBe('element');
    const err = await page.evaluate(() => {
      try {
        window.bricks.ui.showPanel('nope' as any);
        return null;
      } catch (e) {
        return (e as Error).name;
      }
    });
    expect(err).toBe('InvalidArgumentError');
  });

  test('breakpoints() and setBreakpoint() resize the canvas', async ({ page, builder }) => {
    void builder;
    const bps = await page.evaluate(() => window.bricks.ui.breakpoints());
    expect(bps.length).toBeGreaterThanOrEqual(2);
    expect(bps.filter((b) => b.active)).toHaveLength(1);
    expect(bps.find((b) => b.base)?.active).toBe(true);
    const base = bps.find((b) => b.base)!;
    const target = bps.find((b) => !b.base)!;
    const widthBefore = await page.evaluate(() => window.bricks.unstable.state.previewWidth as number);
    await page.evaluate((k) => window.bricks.ui.setBreakpoint(k), target.key);
    await expect.poll(() => page.evaluate(() => window.bricks.unstable.state.previewWidth as number)).not.toBe(widthBefore);
    expect((await page.evaluate(() => window.bricks.ui.breakpoints())).find((b) => b.active)?.key).toBe(target.key);
    await page.evaluate((k) => window.bricks.ui.setBreakpoint(k), base.key);
    await expect.poll(() => page.evaluate(() => window.bricks.unstable.state.previewWidth as number)).toBe(widthBefore);
    const err = await page.evaluate(() => {
      try {
        window.bricks.ui.setBreakpoint('nope');
        return null;
      } catch (e) {
        return (e as Error).name;
      }
    });
    expect(err).toBe('InvalidArgumentError');
  });

  test('toggleClasses() shows the class input of the selection', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => {
      window.bricks.selection.set('headon');
      window.bricks.ui.showPanel('element');
    });
    expect(await page.evaluate(() => window.bricks.ui.toggleClasses())).toBe(true);
    expect(await page.evaluate(() => window.bricks.unstable.state.showElementClasses)).toBe(true);
    expect(await page.evaluate(() => window.bricks.ui.toggleClasses())).toBe(false);
    expect(await page.evaluate(() => window.bricks.unstable.state.showElementClasses)).toBe(false);
  });

  test('startRename() opens Bricks\' own rename field in the Structure panel', async ({ page, builder }) => {
    void builder;
    await page.evaluate(() => window.bricks.ui.showPanel('structure'));
    expect(await page.evaluate(() => window.bricks.ui.startRename('headon'))).toBe(true);
    expect(await page.evaluate(() => window.bricks.selection.get()?.id)).toBe('headon');
    const input = page.locator('#bricks-structure li[data-id="headon"] > .structure-item .title input');
    await expect(input).toBeFocused();
    await page.keyboard.type('Renamed by startRename');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.bricks.elements.get('headon')?.label)).toBe('Renamed by startRename');
    expect(await page.evaluate(() => window.bricks.unstable.state.renameMode)).toBe(false);
    await expect(page.locator('#bricks-structure li[data-id="headon"] > .structure-item .title')).toContainText('Renamed by startRename');
  });
});
