import { describe, expect, it } from 'vitest';
import { connect, createBricksBuilder, findBuilder } from '../../src/connect';
import { BricksUnavailableError, UnsupportedError } from '../../src/errors';
import { CAPABILITIES } from '../../src/types';
import { createFakeBricks, samplePage } from './fake-bricks';

describe('connect', () => {
  it('finds the app on .brx-body and exposes version info', async () => {
    const fake = createFakeBricks();
    const bricks = await connect({ window: fake.win, timeout: 200 });
    expect(bricks.version).toBe('2.4.3');
    expect(bricks.adapterVersion).toBe('2.4');
    expect(bricks.isKnownVersion).toBe(true);
    expect(bricks.unstable.globalProperties).toBe(fake.gp);
    expect(bricks.unstable.state).toBe(fake.gp.$_state);
  });

  it('falls back to [data-v-app]', async () => {
    const fake = createFakeBricks({ dataVApp: true });
    const bricks = await connect({ window: fake.win, timeout: 200 });
    expect(bricks.unstable.globalProperties).toBe(fake.gp);
  });

  it('waits until the app appears', async () => {
    const fake = createFakeBricks();
    const realQs = fake.win.document.querySelector.bind(fake.win.document);
    let ready = false;
    (fake.win.document as any).querySelector = (sel: string) => (ready ? realQs(sel) : null);
    setTimeout(() => (ready = true), 60);
    const bricks = await connect({ window: fake.win, timeout: 1000, interval: 10 });
    expect(bricks.version).toBe('2.4.3');
  });

  it('waits for the canvas iframe unless disabled', async () => {
    const fake = createFakeBricks({ iframeLoaded: false });
    await expect(connect({ window: fake.win, timeout: 80, interval: 10 })).rejects.toThrow(/canvas/);
    const bricks = await connect({ window: fake.win, timeout: 80, waitForCanvas: false });
    expect(bricks.version).toBe('2.4.3');
    setTimeout(() => (fake.state.iframeLoaded = true), 30);
    await expect(connect({ window: fake.win, timeout: 500, interval: 10 })).resolves.toBeTruthy();
  });

  it('throws BricksUnavailableError on timeout', async () => {
    const win = { document: { querySelector: () => null, querySelectorAll: () => [] } } as any;
    win.top = win;
    const err = await connect({ window: win, timeout: 50, interval: 10 }).catch((e) => e);
    expect(err).toBeInstanceOf(BricksUnavailableError);
    expect(err.message).toMatch(/not found/);
  });

  it('throws BricksUnavailableError without a window', async () => {
    await expect(connect({ timeout: 10 })).rejects.toBeInstanceOf(BricksUnavailableError);
  });

  it('finds the builder from the canvas iframe via window.top', () => {
    const fake = createFakeBricks();
    const iframeWin = { document: { querySelector: () => null, querySelectorAll: () => [] }, top: fake.win } as any;
    const found = findBuilder(iframeWin);
    expect(found?.gp).toBe(fake.gp);
    expect(found?.win).toBe(fake.win);
  });

  it('ignores apps without $_state', () => {
    const win = {
      document: {
        querySelector: () => ({ __vue_app__: { config: { globalProperties: {} } } }),
        querySelectorAll: () => [],
      },
    } as any;
    win.top = win;
    expect(findBuilder(win)).toBeNull();
  });

  it('reports capabilities and supports()', () => {
    const fake = createFakeBricks({ omit: ['$_wrapInNestable'] });
    const bricks = createBricksBuilder(fake.gp, fake.win);
    const caps = bricks.capabilities();
    expect(Object.keys(caps)).toHaveLength(CAPABILITIES.length);
    expect(caps['elements.wrap']).toBe(false);
    expect(bricks.supports('elements.wrap')).toBe(false);
    expect(bricks.supports('elements.duplicate')).toBe(true);
    expect(bricks.supports('nope' as any)).toBe(false);
    caps['elements.duplicate'] = false; // a copy
    expect(bricks.supports('elements.duplicate')).toBe(true);
  });

  it('throws UnsupportedError naming the capability', async () => {
    const fake = createFakeBricks({ omit: ['$_wrapInNestable', '$_cloneElement'] });
    const { heading } = samplePage(fake);
    const bricks = createBricksBuilder(fake.gp, fake.win);
    bricks.selection.set(heading.id);
    const err = await bricks.elements.wrap().catch((e) => e);
    expect(err).toBeInstanceOf(UnsupportedError);
    expect(err.capability).toBe('elements.wrap');
    expect(() => bricks.elements.duplicate()).toThrow(UnsupportedError);
  });

  it('uses the latest adapter + probes for unknown versions', () => {
    const fake = createFakeBricks({ version: '2.9.0' });
    const bricks = createBricksBuilder(fake.gp, fake.win);
    expect(bricks.version).toBe('2.9.0');
    expect(bricks.isKnownVersion).toBe(false);
    expect(bricks.supports('elements.insert')).toBe(true);
    const noVersion = createBricksBuilder(createFakeBricks({ version: undefined }).gp, createFakeBricks({ version: undefined }).win);
    expect(noVersion.version).toBeNull();
  });
});
