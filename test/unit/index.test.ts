import { describe, expect, it } from 'vitest';
import * as api from '../../src/index';

describe('package entry', () => {
  it('exports the public API', () => {
    expect(typeof api.connect).toBe('function');
    expect(typeof api.createBricksBuilder).toBe('function');
    expect(typeof api.findBuilder).toBe('function');
    expect(api.VERSION).toBe('0.1.0');
    expect(api.MIN_BRICKS_VERSION).toBe('2.4');
    expect(api.CAPABILITIES.length).toBeGreaterThan(10);
    for (const e of ['BricksUnavailableError', 'NoSelectionError', 'UnsupportedError', 'ElementNotFoundError'] as const) {
      expect(typeof api[e]).toBe('function');
    }
  });
});
