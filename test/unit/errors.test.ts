import { describe, expect, it } from 'vitest';
import {
  BricksApiError,
  BricksUnavailableError,
  ClipboardUnavailableError,
  ElementNotFoundError,
  InvalidArgumentError,
  NoSelectionError,
  NotAllowedError,
  TimeoutError,
  UnsupportedError,
} from '../../src/errors';

describe('errors', () => {
  it('all errors extend BricksApiError and Error with explicit names', () => {
    const cases: Array<[Error, string]> = [
      [new BricksApiError('x'), 'BricksApiError'],
      [new BricksUnavailableError('x'), 'BricksUnavailableError'],
      [new NoSelectionError('elements.delete'), 'NoSelectionError'],
      [new UnsupportedError('elements.wrap'), 'UnsupportedError'],
      [new ElementNotFoundError('abc'), 'ElementNotFoundError'],
      [new NotAllowedError('x'), 'NotAllowedError'],
      [new InvalidArgumentError('x'), 'InvalidArgumentError'],
      [new ClipboardUnavailableError('x'), 'ClipboardUnavailableError'],
      [new TimeoutError('x'), 'TimeoutError'],
    ];
    for (const [err, name] of cases) {
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(BricksApiError);
      expect(err.name).toBe(name);
    }
  });

  it('carries details', () => {
    const u = new UnsupportedError('elements.duplicate', 'missing $_cloneElement');
    expect(u.capability).toBe('elements.duplicate');
    expect(u.message).toContain('elements.duplicate');
    expect(u.message).toContain('missing $_cloneElement');
    expect(new ElementNotFoundError('abc').elementId).toBe('abc');
    expect(new NoSelectionError('selection.next').message).toBe('selection.next: no element is selected');
    expect(new UnsupportedError('elements.wrap')).toBeInstanceOf(UnsupportedError);
    expect(new NoSelectionError('x')).not.toBeInstanceOf(UnsupportedError);
  });
});
