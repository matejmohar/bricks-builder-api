import { describe, expect, it } from 'vitest';
import type { VersionAdapter } from '../../src/driver';
import { ADAPTERS, MIN_BRICKS_VERSION, parseVersion, selectAdapter } from '../../src/versions';
import adapter24, { normalizeId, isEditableFallback } from '../../src/versions/2.4';

describe('version selection', () => {
  it('parses versions', () => {
    expect(parseVersion('2.4.3')).toEqual({ major: 2, minor: 4, patch: 3 });
    expect(parseVersion('2.4')).toEqual({ major: 2, minor: 4, patch: 0 });
    expect(parseVersion('v2.5-beta2')).toEqual({ major: 2, minor: 5, patch: 0 });
    expect(parseVersion('2.10.1')).toEqual({ major: 2, minor: 10, patch: 1 });
    expect(parseVersion('nonsense')).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
    expect(parseVersion(24)).toBeNull();
  });

  it('registers the 2.4 adapter and minimum 2.4', () => {
    expect(ADAPTERS.map((a) => a.version)).toContain('2.4');
    expect(MIN_BRICKS_VERSION).toBe('2.4');
  });

  it('picks the exact major.minor adapter', () => {
    for (const v of ['2.4', '2.4.0', '2.4.3', '2.4.9-rc1']) {
      const s = selectAdapter(v);
      expect(s.adapter).toBe(adapter24);
      expect(s.exact).toBe(true);
      expect(s.atLeastMinimum).toBe(true);
    }
  });

  it('falls back to the latest adapter for unknown versions', () => {
    const newer = selectAdapter('2.6.0');
    expect(newer.adapter).toBe(ADAPTERS[ADAPTERS.length - 1]);
    expect(newer.exact).toBe(false);
    expect(newer.atLeastMinimum).toBe(true);

    const older = selectAdapter('2.3.7');
    expect(older.exact).toBe(false);
    expect(older.atLeastMinimum).toBe(false);

    const unknown = selectAdapter(undefined);
    expect(unknown.adapter).toBe(ADAPTERS[ADAPTERS.length - 1]);
    expect(unknown.exact).toBe(false);
    expect(unknown.atLeastMinimum).toBe(false);
  });

  it('chooses among several adapters by major.minor', () => {
    const fake = (version: string): VersionAdapter => ({ ...adapter24, version });
    const list = [fake('2.4'), fake('2.5'), fake('2.6')];
    expect(selectAdapter('2.5.1', list).adapter.version).toBe('2.5');
    expect(selectAdapter('2.4.3', list).adapter.version).toBe('2.4');
    expect(selectAdapter('2.7.0', list).adapter.version).toBe('2.6');
    expect(selectAdapter('3.0', list).exact).toBe(false);
  });

  it('throws when no adapters exist', () => {
    expect(() => selectAdapter('2.4', [])).toThrow();
  });
});

describe('2.4 adapter helpers', () => {
  it('normalizes Bricks "no selection" values', () => {
    expect(normalizeId(undefined)).toBeNull();
    expect(normalizeId(null)).toBeNull();
    expect(normalizeId(0)).toBeNull();
    expect(normalizeId(false)).toBeNull();
    expect(normalizeId('')).toBeNull();
    expect(normalizeId('0')).toBeNull();
    expect(normalizeId('abc')).toBe('abc');
    expect(normalizeId(12)).toBe('12');
  });

  it('has an isEditable fallback matching Bricks rules', () => {
    expect(isEditableFallback(null)).toBe(false);
    expect(isEditableFallback({ tagName: 'INPUT' } as any)).toBe(true);
    expect(isEditableFallback({ tagName: 'TEXTAREA' } as any)).toBe(true);
    expect(isEditableFallback({ tagName: 'DIV', isContentEditable: true } as any)).toBe(true);
    expect(isEditableFallback({ tagName: 'DIV' } as any)).toBe(false);
    expect(isEditableFallback({ tagName: 'INPUT', id: 'bricks-panel-search' } as any)).toBe(false);
    expect(isEditableFallback({ tagName: 'INPUT', closest: () => ({}) } as any)).toBe(false);
  });
});
