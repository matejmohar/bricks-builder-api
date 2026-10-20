import type { VersionAdapter } from '../driver';
import adapter24 from './2.4';

/** Known adapters, oldest first. */
export const ADAPTERS: readonly VersionAdapter[] = [adapter24];

/** Oldest Bricks release this library supports. */
export const MIN_BRICKS_VERSION = '2.4';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/** Parses `"2.4.3"`, `"2.4"`, `"2.5-beta"` etc. Returns null when unparseable. */
export function parseVersion(version: unknown): ParsedVersion | null {
  if (typeof version !== 'string') return null;
  const m = /^\s*v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(version);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: m[3] ? Number(m[3]) : 0 };
}

function compare(a: ParsedVersion, b: ParsedVersion): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export interface AdapterSelection {
  adapter: VersionAdapter;
  /** True when an adapter exists for exactly this Bricks major.minor. */
  exact: boolean;
  /** True when the detected version is at least MIN_BRICKS_VERSION. */
  atLeastMinimum: boolean;
}

/**
 * Picks the adapter for a Bricks version by major.minor. Unknown or unparseable
 * versions fall back to the latest adapter; capabilities are then decided by
 * the probes alone.
 */
export function selectAdapter(version: unknown, adapters: readonly VersionAdapter[] = ADAPTERS): AdapterSelection {
  const latest = adapters[adapters.length - 1];
  if (!latest) throw new Error('No Bricks version adapters registered');
  const parsed = parseVersion(version);
  const min = parseVersion(MIN_BRICKS_VERSION) as ParsedVersion;
  if (!parsed) return { adapter: latest, exact: false, atLeastMinimum: false };
  const exactMatch = adapters.find((a) => {
    const av = parseVersion(a.version);
    return !!av && av.major === parsed.major && av.minor === parsed.minor;
  });
  return {
    adapter: exactMatch ?? latest,
    exact: !!exactMatch,
    atLeastMinimum: compare(parsed, min) >= 0,
  };
}
