import { describe, expect, it } from 'vitest';
import { createBricksBuilder } from '../../src/connect';
import { createFakeBricks } from './fake-bricks';

function setup(length: number, index: number, inProgress: unknown = false) {
  const fake = createFakeBricks();
  fake.state.history = Array.from({ length }, (_, i) => ({ _label: `entry ${i}` }));
  fake.state.historyIndex = index;
  fake.state.historyInProgress = inProgress;
  return { fake, bricks: createBricksBuilder(fake.gp, fake.win) };
}

describe('history', () => {
  it.each([
    // length, index, inProgress, canUndo, canRedo
    [0, 0, false, false, false],
    [1, 0, false, false, false],
    [2, 1, false, true, false],
    [2, 0, false, false, true],
    [3, 1, false, true, true],
    [3, 2, false, true, false],
    [3, 1, 1792481200350, false, false], // Bricks stores a timestamp while applying a step
  ])('length=%i index=%i inProgress=%s -> canUndo=%s canRedo=%s', (length, index, inProgress, canUndo, canRedo) => {
    const { bricks } = setup(length, index, inProgress);
    expect(bricks.history.canUndo()).toBe(canUndo);
    expect(bricks.history.canRedo()).toBe(canRedo);
  });

  it('undo()/redo() call $_goto only when possible', () => {
    const { bricks, fake } = setup(3, 1);
    expect(bricks.history.undo()).toBe(true);
    expect(fake.calls).toContainEqual(['$_goto', 'undo']);
    expect(fake.state.historyIndex).toBe(0);
    expect(bricks.history.undo()).toBe(false);
    expect(bricks.history.redo()).toBe(true);
    expect(bricks.history.redo()).toBe(true);
    expect(bricks.history.redo()).toBe(false);
    expect(fake.calls.filter((c) => c[0] === '$_goto')).toEqual([
      ['$_goto', 'undo'],
      ['$_goto', 'redo'],
      ['$_goto', 'redo'],
    ]);
  });

  it('does nothing while a history step is in progress', () => {
    const { bricks, fake } = setup(3, 1, true);
    expect(bricks.history.undo()).toBe(false);
    expect(bricks.history.redo()).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });
});
