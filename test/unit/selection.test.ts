import { describe, expect, it, vi } from 'vitest';
import { createBricksBuilder } from '../../src/connect';
import { ElementNotFoundError, NoSelectionError } from '../../src/errors';
import { createFakeBricks, samplePage, tick } from './fake-bricks';

function setup() {
  const fake = createFakeBricks();
  const page = samplePage(fake);
  const bricks = createBricksBuilder(fake.gp, fake.win);
  return { fake, bricks, ...page };
}

describe('selection', () => {
  it('get() returns null without selection and ElementInfo with one', () => {
    const { bricks, fake, heading, container } = setup();
    expect(bricks.selection.get()).toBeNull();
    fake.state.activeId = heading.id;
    expect(bricks.selection.get()).toEqual({
      id: heading.id,
      name: 'heading',
      parentId: container.id,
      label: null,
      isNestable: false,
      childIds: [],
    });
  });

  it('treats 0 / false / stale ids as no selection', () => {
    const { bricks, fake } = setup();
    fake.state.activeId = 0;
    expect(bricks.selection.get()).toBeNull();
    fake.state.activeId = false;
    expect(bricks.selection.get()).toBeNull();
    fake.state.activeId = 'deleted';
    expect(bricks.selection.get()).toBeNull();
  });

  it('works without $_activeElement (state.activeId fallback)', () => {
    const fake = createFakeBricks({ omit: ['$_activeElement'] });
    const { heading } = samplePage(fake);
    const bricks = createBricksBuilder(fake.gp, fake.win);
    fake.state.activeId = heading.id;
    expect(bricks.selection.get()?.id).toBe(heading.id);
  });

  it('set() selects synchronously, clears multi-selection and validates ids', () => {
    const { bricks, fake, section, heading } = setup();
    fake.state.selectedElements = [heading, section];
    const info = bricks.selection.set(section.id);
    expect(info?.id).toBe(section.id);
    expect(info?.isNestable).toBe(true);
    expect(info?.parentId).toBeNull();
    expect(fake.state.activeId).toBe(section.id);
    expect(fake.state.selectedElements).toEqual([]);
    expect(bricks.selection.get()?.id).toBe(section.id);
    expect(() => bricks.selection.set('nope')).toThrow(ElementNotFoundError);
    expect(bricks.selection.set(null)).toBeNull();
    expect(fake.state.activeId).toBeNull();
    expect(bricks.selection.get()).toBeNull();
  });

  it('onChange() reports next and prev, and unsubscribes', async () => {
    const { bricks, fake, heading, button } = setup();
    const seen: Array<[string | null, string | null]> = [];
    const off = bricks.selection.onChange((next, prev) => seen.push([next?.id ?? null, prev?.id ?? null]));
    bricks.selection.set(heading.id);
    await tick();
    fake.state.activeId = button.id; // e.g. a canvas click
    await tick();
    bricks.selection.set(null);
    await tick();
    expect(seen).toEqual([
      [heading.id, null],
      [button.id, heading.id],
      [null, button.id],
    ]);
    off();
    bricks.selection.set(heading.id);
    await tick();
    expect(seen).toHaveLength(3);
  });

  it('onChange() keeps the previous ElementInfo after the element is deleted', async () => {
    const { bricks, button, container } = setup();
    bricks.selection.set(button.id);
    const seen: any[] = [];
    bricks.selection.onChange((next, prev) => seen.push([next?.id, prev?.name]));
    bricks.elements.delete();
    await tick();
    expect(seen).toEqual([[container.id, 'button']]);
  });

  it('onChange() isolates listener errors', async () => {
    const { bricks, heading } = setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    bricks.selection.onChange(() => {
      throw new Error('boom');
    });
    bricks.selection.onChange(good);
    bricks.selection.set(heading.id);
    await tick();
    expect(good).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('parent() / firstChild() navigate the tree', () => {
    const { bricks, section, container, heading } = setup();
    bricks.selection.set(heading.id);
    expect(bricks.selection.parent()?.id).toBe(container.id);
    expect(bricks.selection.parent()?.id).toBe(section.id);
    expect(bricks.selection.parent()).toBeNull(); // root: unchanged
    expect(bricks.selection.get()?.id).toBe(section.id);
    expect(bricks.selection.firstChild()?.id).toBe(container.id);
    expect(bricks.selection.firstChild()?.id).toBe(heading.id);
    expect(bricks.selection.firstChild()).toBeNull(); // leaf: unchanged
    expect(bricks.selection.get()?.id).toBe(heading.id);
  });

  it('next() / previous() move between siblings, including root level', () => {
    const { bricks, heading, button, section, section2 } = setup();
    bricks.selection.set(heading.id);
    expect(bricks.selection.previous()).toBeNull();
    expect(bricks.selection.next()?.id).toBe(button.id);
    expect(bricks.selection.next()).toBeNull();
    expect(bricks.selection.get()?.id).toBe(button.id);
    expect(bricks.selection.previous()?.id).toBe(heading.id);
    bricks.selection.set(section.id);
    expect(bricks.selection.next()?.id).toBe(section2.id);
    expect(bricks.selection.next()).toBeNull();
    expect(bricks.selection.previous()?.id).toBe(section.id);
  });

  it('skips child ids that do not resolve', () => {
    const { bricks, fake, container, button } = setup();
    container.children!.unshift('ghost');
    bricks.selection.set(container.id);
    expect(bricks.selection.firstChild()?.id).not.toBe('ghost');
    bricks.selection.set(button.id);
    fake.byId(container.id)!.children = ['ghost2', ...fake.byId(container.id)!.children!.filter((c) => c !== 'ghost')];
    // previous of heading resolves past the ghost to nothing
    expect(bricks.selection.previous()?.name).toBe('heading');
    expect(bricks.selection.previous()).toBeNull();
  });

  it('navigation throws NoSelectionError without a selection', () => {
    const { bricks } = setup();
    expect(() => bricks.selection.parent()).toThrow(NoSelectionError);
    expect(() => bricks.selection.firstChild()).toThrow(NoSelectionError);
    expect(() => bricks.selection.next()).toThrow(NoSelectionError);
    expect(() => bricks.selection.previous()).toThrow(NoSelectionError);
  });
});
