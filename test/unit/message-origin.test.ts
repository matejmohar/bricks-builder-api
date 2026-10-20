import { describe, expect, it } from 'vitest';
import { createBricksBuilder } from '../../src/connect';
import { createFakeBricks, samplePage, tick } from './fake-bricks';

/**
 * Bricks only records history for, and syncs to the canvas, changes made while
 * `$_state.messageOrigin` is 'main'. After a click in the canvas it is 'iframe', so every
 * library call that changes builder state has to claim the builder window first. A key press
 * in a canvas inline editor also sets `sendPostMessage` to false for 400 ms, which blocks the
 * sync of the change; the library turns it back on.
 */
function setup() {
  const fake = createFakeBricks();
  const page = samplePage(fake);
  const bricks = createBricksBuilder(fake.gp, fake.win);
  const fromCanvas = () => {
    fake.state.messageOrigin = 'iframe';
    fake.state.sendPostMessage = false; // a key press in a canvas inline editor
  };
  return { fake, bricks, fromCanvas, ...page };
}

describe("messageOrigin: actions claim the builder window ('main')", () => {
  const cases: Array<[string, (t: ReturnType<typeof setup>) => unknown]> = [
    ['selection.set', (t) => t.bricks.selection.set(t.heading.id)],
    ['selection.next', (t) => t.bricks.selection.next()],
    ['elements.insert', (t) => t.bricks.elements.insert('heading')],
    ["elements.insert 'outside'", (t) => t.bricks.elements.insert('heading', { position: 'outside' })],
    ['elements.duplicate', (t) => t.bricks.elements.duplicate()],
    ['elements.delete', (t) => t.bricks.elements.delete()],
    ['elements.wrap', (t) => t.bricks.elements.wrap()],
    ['elements.rename', (t) => t.bricks.elements.rename('Title')],
    ['clipboard.copy', (t) => t.bricks.clipboard.copy()],
    ['clipboard.paste', (t) => t.bricks.clipboard.paste({ timeout: 20 })],
    ['document.save', (t) => t.bricks.document.save({ timeout: 200 })],
    ['ui.openCommandPalette', (t) => t.bricks.ui.openCommandPalette()],
    ['ui.showPanel', (t) => t.bricks.ui.showPanel('structure')],
    ['ui.setBreakpoint', (t) => t.bricks.ui.setBreakpoint('tablet_portrait')],
    ['ui.toggleClasses', (t) => t.bricks.ui.toggleClasses(true)],
  ];

  it.each(cases)('%s', async (_name, act) => {
    const t = setup();
    t.bricks.selection.set(t.heading.id);
    t.fromCanvas();
    await act(t);
    expect(t.fake.state.messageOrigin).toBe('main');
    expect(t.fake.state.sendPostMessage).toBe(true);
  });

  it('undo / redo', async () => {
    const t = setup();
    t.bricks.selection.set(t.heading.id);
    t.bricks.elements.duplicate();
    await tick(10);
    t.fake.state.history = [{}, {}];
    t.fake.state.historyIndex = 1;
    t.fromCanvas();
    expect(t.bricks.history.undo()).toBe(true);
    expect(t.fake.state.messageOrigin).toBe('main');
    t.fromCanvas();
    expect(t.bricks.history.redo()).toBe(true);
    expect(t.fake.state.messageOrigin).toBe('main');
  });

  it('read-only calls leave the origin alone', () => {
    const t = setup();
    t.bricks.selection.set(t.heading.id);
    t.fromCanvas();
    t.bricks.selection.get();
    t.bricks.elements.get(t.heading.id);
    t.bricks.history.canUndo();
    t.bricks.document.hasUnsavedChanges();
    t.bricks.ui.isTyping();
    t.bricks.ui.breakpoints();
    expect(t.fake.state.messageOrigin).toBe('iframe');
    expect(t.fake.state.sendPostMessage).toBe(false);
  });

  it('does not add the keys to a state that has none (older/newer Bricks)', () => {
    const t = setup();
    delete t.fake.state.messageOrigin;
    delete t.fake.state.sendPostMessage;
    t.bricks.selection.set(t.heading.id);
    expect('messageOrigin' in t.fake.state).toBe(false);
    expect('sendPostMessage' in t.fake.state).toBe(false);
  });
});
