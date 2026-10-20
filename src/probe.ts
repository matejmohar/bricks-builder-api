import { CAPABILITIES, type Capability, type CapabilityMap, type RawGlobalProperties } from './types';

/**
 * A requirement is a key that must exist on Bricks' globalProperties:
 *
 * - `'$_name'`        a function `globalProperties.$_name`
 * - `'$_name.value'`  a Vue ref/computed `globalProperties.$_name` (has `.value`)
 * - `'state.key'`     a key present on the reactive `$_state` store
 *
 * An array of requirements means "any of these".
 */
export type Requirement = string | readonly string[];

/** Checks a single requirement against globalProperties. */
export function checkRequirement(gp: RawGlobalProperties | null | undefined, req: Requirement): boolean {
  if (!gp) return false;
  if (typeof req !== 'string') return req.some((r) => checkRequirement(gp, r));
  if (req.startsWith('state.')) {
    const state = gp.$_state;
    return !!state && typeof state === 'object' && req.slice(6) in state;
  }
  if (req.endsWith('.value')) {
    const ref = gp[req.slice(0, -6)];
    return !!ref && typeof ref === 'object' && 'value' in (ref as object);
  }
  return typeof gp[req] === 'function';
}

/** Returns the requirements of a capability that are not met. */
export function missingRequirements(
  gp: RawGlobalProperties | null | undefined,
  requirements: readonly Requirement[],
): string[] {
  return requirements
    .filter((r) => !checkRequirement(gp, r))
    .map((r) => (typeof r === 'string' ? r : r.join(' | ')));
}

/** Probes every capability. A capability is supported when all its requirements are met. */
export function probe(
  gp: RawGlobalProperties | null | undefined,
  requirements: Record<Capability, readonly Requirement[]>,
): CapabilityMap {
  const result = {} as CapabilityMap;
  for (const cap of CAPABILITIES) {
    const reqs = requirements[cap];
    result[cap] = !!reqs && missingRequirements(gp, reqs).length === 0;
  }
  return result;
}
