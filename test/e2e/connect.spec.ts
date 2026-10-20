import { expect, test } from './fixtures';
import { IIFE_PATH } from './helpers';

test.describe('connect', () => {
  test('connects to the builder and reports version and capabilities', async ({ page, builder }) => {
    void builder;
    const r = await page.evaluate(() => ({
      version: window.bricks.version,
      bricksData: (window as any).bricksData.version,
      adapter: window.bricks.adapterVersion,
      known: window.bricks.isKnownVersion,
      caps: window.bricks.capabilities(),
      supportsDuplicate: window.bricks.supports('elements.duplicate'),
      hasState: typeof window.bricks.unstable.state === 'object',
      stateIsGp: window.bricks.unstable.state === window.bricks.unstable.globalProperties.$_state,
      apiVersion: window.BricksBuilderAPI.VERSION,
    }));
    expect(r.version).toBe(r.bricksData);
    expect(r.adapter).toBe('2.4');
    expect(r.known).toBe(true);
    expect(r.supportsDuplicate).toBe(true);
    expect(r.hasState).toBe(true);
    expect(r.stateIsGp).toBe(true);
    expect(r.apiVersion).toBe('0.1.0');
    for (const [cap, ok] of Object.entries(r.caps)) expect(ok, cap).toBe(true);
  });

  test('throws BricksUnavailableError outside the builder', async ({ page, postId }) => {
    await page.goto(`/?p=${postId}`);
    await page.addScriptTag({ path: IIFE_PATH });
    const name = await page.evaluate(() =>
      window.BricksBuilderAPI.connect({ timeout: 300 }).then(
        () => 'connected',
        (e: Error) => e.name,
      ),
    );
    expect(name).toBe('BricksUnavailableError');
  });

  test('connects from inside the canvas iframe via window.top', async ({ page, builder }) => {
    void builder;
    const frame = page.frames().find((f) => f.name() === 'bricks-builder-iframe') ?? page.frames()[1]!;
    await frame.addScriptTag({ path: IIFE_PATH });
    const version = await frame.evaluate(async () => {
      const b = await (window as any).BricksBuilderAPI.connect({ timeout: 5000 });
      return b.version;
    });
    expect(version).toBe(await page.evaluate(() => window.bricks.version));
  });
});
