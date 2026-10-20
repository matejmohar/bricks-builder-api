import { describe, expect, it } from 'vitest';
import { checkRequirement, missingRequirements, probe } from '../../src/probe';
import { CAPABILITIES } from '../../src/types';
import { requirements } from '../../src/versions/2.4';
import { createFakeBricks } from './fake-bricks';

describe('probe', () => {
  const gp = { $_state: { activeId: undefined, history: [] }, $_fn: () => 1, $_ref: { value: [] }, $_notFn: 3 } as any;

  it('checks functions, refs and state keys', () => {
    expect(checkRequirement(gp, '$_fn')).toBe(true);
    expect(checkRequirement(gp, '$_notFn')).toBe(false);
    expect(checkRequirement(gp, '$_missing')).toBe(false);
    expect(checkRequirement(gp, '$_ref.value')).toBe(true);
    expect(checkRequirement(gp, '$_fn.value')).toBe(false);
    expect(checkRequirement(gp, 'state.activeId')).toBe(true); // present even when undefined
    expect(checkRequirement(gp, 'state.history')).toBe(true);
    expect(checkRequirement(gp, 'state.nope')).toBe(false);
  });

  it('treats arrays as any-of', () => {
    expect(checkRequirement(gp, ['$_missing', '$_fn'])).toBe(true);
    expect(checkRequirement(gp, ['$_missing', 'state.nope'])).toBe(false);
  });

  it('handles a missing globalProperties object', () => {
    expect(checkRequirement(null, '$_fn')).toBe(false);
    expect(probe(undefined, requirements)['selection.get']).toBe(false);
  });

  it('lists missing requirements', () => {
    expect(missingRequirements(gp, ['$_fn', '$_a', ['$_b', '$_c']])).toEqual(['$_a', '$_b | $_c']);
  });

  it('every capability is supported by a complete Bricks 2.4 fake', () => {
    const fake = createFakeBricks();
    const caps = probe(fake.gp, requirements);
    expect(Object.keys(caps).sort()).toEqual([...CAPABILITIES].sort());
    for (const cap of CAPABILITIES) expect(caps[cap], cap).toBe(true);
  });

  it('a missing function disables only the capabilities that need it', () => {
    const fake = createFakeBricks({ omit: ['$_cloneElement', '$_pasteElements'] });
    const caps = probe(fake.gp, requirements);
    expect(caps['elements.duplicate']).toBe(false);
    expect(caps['clipboard.paste']).toBe(false);
    expect(caps['elements.delete']).toBe(true);
    expect(caps['clipboard.copy']).toBe(true);
  });

  it('uses alternatives (save works with only $_savePost)', () => {
    const fake = createFakeBricks({ omit: ['$_savePostAsync'] });
    expect(probe(fake.gp, requirements)['document.save']).toBe(true);
    const none = createFakeBricks({ omit: ['$_savePostAsync', '$_savePost'] });
    expect(probe(none.gp, requirements)['document.save']).toBe(false);
  });

  it('a capability without requirements entry is unsupported', () => {
    const partial = { ...requirements } as any;
    delete partial['ui.showPanel'];
    expect(probe(createFakeBricks().gp, partial)['ui.showPanel']).toBe(false);
  });
});
