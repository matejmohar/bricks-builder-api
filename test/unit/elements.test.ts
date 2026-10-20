import { describe, expect, it } from 'vitest';
import { createBricksBuilder } from '../../src/connect';
import { ElementNotFoundError, InvalidArgumentError, NoSelectionError, NotAllowedError } from '../../src/errors';
import { createFakeBricks, samplePage } from './fake-bricks';

function setup(opts = {}) {
  const fake = createFakeBricks(opts);
  const page = samplePage(fake);
  const bricks = createBricksBuilder(fake.gp, fake.win);
  return { fake, bricks, ...page };
}

describe('elements.get', () => {
  it('returns ElementInfo or null', () => {
    const { bricks, section, container } = setup();
    expect(bricks.elements.get(section.id)).toEqual({
      id: section.id,
      name: 'section',
      parentId: null,
      label: null,
      isNestable: true,
      childIds: [container.id],
    });
    expect(bricks.elements.get('nope')).toBeNull();
  });

  it('returns a snapshot, not the live element', () => {
    const { bricks, container } = setup();
    const info = bricks.elements.get(container.id)!;
    info.childIds.push('x');
    expect(bricks.elements.get(container.id)!.childIds).not.toContain('x');
  });
});

describe('elements.insert', () => {
  it('inserts inside a selected nestable and keeps the selection', () => {
    const { bricks, fake, container, button } = setup();
    bricks.selection.set(container.id);
    const el = bricks.elements.insert('heading');
    expect(el.name).toBe('heading');
    expect(el.parentId).toBe(container.id);
    expect(fake.byId(container.id)!.children!.at(-1)).toBe(el.id);
    expect(fake.byId(container.id)!.children!.indexOf(button.id)).toBe(1);
    expect(bricks.selection.get()?.id).toBe(container.id);
  });

  it('inserts after a selected leaf', () => {
    const { bricks, fake, heading, container } = setup();
    bricks.selection.set(heading.id);
    const el = bricks.elements.insert('button');
    expect(el.parentId).toBe(container.id);
    expect(fake.byId(container.id)!.children![1]).toBe(el.id);
  });

  it('returns the element Bricks actually inserted (Bricks re-generates the id)', () => {
    const { bricks, fake } = setup();
    const el = bricks.elements.insert('section');
    expect(fake.byId(el.id)).toBeDefined();
    expect(el.childIds).toHaveLength(1); // Bricks adds a container
  });

  it("position 'outside' after a leaf: right after the leaf's parent", () => {
    const { fake, bricks, heading, container, section } = setup();
    bricks.selection.set(heading.id);
    const el = bricks.elements.insert('text-basic', { position: 'outside' });
    expect(fake.calls).toContainEqual(['$_addNewElement', 'text-basic', { parent: section.id, index: 1 }]);
    expect(el.parentId).toBe(section.id);
    expect(fake.byId(section.id)!.children).toEqual([container.id, el.id]);
    expect(bricks.selection.get()?.id).toBe(heading.id);
  });

  it("position 'outside' with a nestable selected: right after it", () => {
    const { fake, bricks, container, section } = setup();
    const block = fake.add('block', container.id);
    fake.add('heading', block.id);
    bricks.selection.set(block.id);
    const el = bricks.elements.insert('button', { position: 'outside' });
    expect(el.parentId).toBe(container.id);
    expect(fake.byId(container.id)!.children!.slice(-2)).toEqual([block.id, el.id]);
    bricks.selection.set(section.id); // root nestable -> root level, after it
    const root = bricks.elements.insert('block', { position: 'outside' });
    expect(fake.calls).toContainEqual(['$_addNewElement', 'block', { parent: 0, index: 1 }]);
    expect(root.parentId).toBeNull();
  });

  it("position 'outside' for a root-level leaf goes after it; without selection it is 'auto'", () => {
    const { fake, bricks } = setup();
    const leaf = fake.add('heading');
    bricks.selection.set(leaf.id);
    bricks.elements.insert('button', { position: 'outside' });
    expect(fake.calls.at(-1)).toEqual(['$_addNewElement', 'button', { parent: 0, index: 3 }]);
    bricks.selection.set(null);
    bricks.elements.insert('button', { position: 'outside' });
    expect(fake.calls.at(-1)).toEqual(['$_addNewElement', 'button', 'auto']);
  });

  it("does not touch Bricks' insertAfter flag", () => {
    const { fake, bricks, heading } = setup();
    bricks.selection.set(heading.id);
    bricks.elements.insert('heading', { position: 'outside' });
    bricks.elements.insert('heading');
    expect(fake.state.insertAfter).toBe(false);
  });

  it('validates the element type and position', () => {
    const { bricks } = setup();
    expect(() => bricks.elements.insert('not-an-element')).toThrow(InvalidArgumentError);
    expect(() => bricks.elements.insert('heading', { position: 'inside' as any })).toThrow(InvalidArgumentError);
  });

  it('throws NotAllowedError when Bricks inserts nothing', () => {
    const { bricks, fake } = setup();
    fake.gp.$_addNewElement = () => undefined;
    expect(() => bricks.elements.insert('heading')).toThrow(NotAllowedError);
  });
});

describe('elements.duplicate', () => {
  it('duplicates the selection right after it, selection unchanged', () => {
    const { bricks, fake, heading, container } = setup();
    bricks.selection.set(heading.id);
    const copy = bricks.elements.duplicate();
    expect(copy.id).not.toBe(heading.id);
    expect(copy.name).toBe('heading');
    expect(copy.parentId).toBe(container.id);
    expect(fake.calls).toContainEqual(['$_cloneElement', heading.id, 0]);
    expect(fake.byId(container.id)!.children![1]).toBe(copy.id);
    expect(bricks.selection.get()?.id).toBe(heading.id);
  });

  it('duplicates by id, including root elements (index from the root list)', () => {
    const { bricks, fake, section2 } = setup();
    const copy = bricks.elements.duplicate(section2.id);
    expect(fake.calls).toContainEqual(['$_cloneElement', section2.id, 1]);
    expect(copy.parentId).toBeNull();
    expect(copy.name).toBe('section');
  });

  it('guards with $_isCloneable and errors', () => {
    const { bricks, heading } = setup();
    expect(() => bricks.elements.duplicate()).toThrow(NoSelectionError);
    expect(() => bricks.elements.duplicate('nope')).toThrow(ElementNotFoundError);
    heading.cloneable = false;
    expect(() => bricks.elements.duplicate(heading.id)).toThrow(NotAllowedError);
  });

  it('throws NotAllowedError when Bricks does not clone', () => {
    const { bricks, fake, heading } = setup();
    fake.gp.$_cloneElement = () => {};
    expect(() => bricks.elements.duplicate(heading.id)).toThrow(NotAllowedError);
  });
});

describe('elements.delete', () => {
  it('passes the element object (not the id) to Bricks', () => {
    const { bricks, fake, button } = setup();
    bricks.selection.set(button.id);
    bricks.elements.delete();
    const call = fake.calls.find((c) => c[0] === '$_deleteElement')!;
    expect(typeof call[1]).toBe('object');
    expect((call[1] as any).id).toBe(button.id);
    expect(bricks.elements.get(button.id)).toBeNull();
  });

  it('deletes by id with children', () => {
    const { bricks, section, heading } = setup();
    bricks.elements.delete(section.id);
    expect(bricks.elements.get(section.id)).toBeNull();
    expect(bricks.elements.get(heading.id)).toBeNull();
  });

  it('guards and errors', () => {
    const { bricks, fake, heading } = setup();
    expect(() => bricks.elements.delete()).toThrow(NoSelectionError);
    expect(() => bricks.elements.delete('nope')).toThrow(ElementNotFoundError);
    heading.deletable = false;
    expect(() => bricks.elements.delete(heading.id)).toThrow(NotAllowedError);
    heading.deletable = true;
    fake.gp.$_deleteElement = () => {};
    expect(() => bricks.elements.delete(heading.id)).toThrow(NotAllowedError);
  });
});

describe('elements.delete: canvas sync', () => {
  it("mirrors the delete to the canvas app as Bricks' deleteElement message", () => {
    const { fake, bricks, heading } = setup();
    bricks.elements.delete(heading.id);
    const posts = fake.calls.filter((c) => c[0] === '$_postMessage');
    expect(posts).toHaveLength(1);
    const message = posts[0]![1] as { key: string; value: { id: string; name: string }; ignoreOrigin: boolean };
    expect(message.key).toBe('deleteElement');
    expect(message.ignoreOrigin).toBe(true);
    expect(message.value).toMatchObject({ id: heading.id, name: 'heading' });
    // A plain snapshot, not the live element.
    expect(message.value).not.toBe(heading);
  });

  it('does not message the canvas when Bricks did not delete', () => {
    const { fake, bricks, heading } = setup();
    fake.gp.$_deleteElement = () => undefined;
    expect(() => bricks.elements.delete(heading.id)).toThrow();
    expect(fake.calls.some((c) => c[0] === '$_postMessage')).toBe(false);
  });
});

describe('elements.wrap', () => {
  it("wraps the selection in Bricks' default wrap element and resolves once it is selected", async () => {
    const { bricks, fake, heading, container } = setup();
    bricks.selection.set(heading.id);
    const wrapper = await bricks.elements.wrap();
    expect(fake.calls).toContainEqual(['$_wrapInNestable', null, 'block']);
    expect(wrapper.name).toBe('block');
    expect(wrapper.parentId).toBe(container.id);
    expect(wrapper.childIds).toEqual([heading.id]);
    expect(bricks.selection.get()?.id).toBe(wrapper.id);
  });

  it('uses the given tag and bricksData.builderWrapElement', async () => {
    const { bricks, fake, heading, button } = setup();
    bricks.selection.set(heading.id);
    expect((await bricks.elements.wrap('div')).name).toBe('div');
    fake.win.bricksData.builderWrapElement = 'container';
    bricks.selection.set(button.id);
    expect((await bricks.elements.wrap()).name).toBe('container');
    fake.win.bricksData.builderWrapElement = 'weird';
    bricks.selection.set(button.id);
    expect((await bricks.elements.wrap()).name).toBe('block');
  });

  it('errors', async () => {
    const { bricks, heading } = setup();
    await expect(bricks.elements.wrap()).rejects.toBeInstanceOf(NoSelectionError);
    bricks.selection.set(heading.id);
    await expect(bricks.elements.wrap('span' as any)).rejects.toBeInstanceOf(InvalidArgumentError);
    heading.protected = true;
    await expect(bricks.elements.wrap()).rejects.toBeInstanceOf(NotAllowedError);
  });
});

describe('elements.rename', () => {
  it('sets and resets the label', () => {
    const { bricks, fake, heading, button } = setup();
    bricks.selection.set(heading.id);
    expect(bricks.elements.rename('Hero title').label).toBe('Hero title');
    expect(fake.byId(heading.id)!.label).toBe('Hero title');
    expect(bricks.elements.rename('CTA', button.id).label).toBe('CTA');
    expect(bricks.elements.rename('', heading.id).label).toBeNull();
    expect('label' in fake.byId(heading.id)!).toBe(false);
    expect(bricks.elements.rename(null, button.id).label).toBeNull();
  });

  it('errors', () => {
    const { bricks } = setup();
    expect(() => bricks.elements.rename('x')).toThrow(NoSelectionError);
    expect(() => bricks.elements.rename('x', 'nope')).toThrow(ElementNotFoundError);
    expect(() => bricks.elements.rename(5 as any, 'nope')).toThrow(InvalidArgumentError);
  });
});
