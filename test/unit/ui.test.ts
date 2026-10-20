import { describe, expect, it } from 'vitest';
import { createBricksBuilder } from '../../src/connect';
import { InvalidArgumentError, NoSelectionError } from '../../src/errors';
import { createFakeBricks, samplePage } from './fake-bricks';

function setup(opts = {}) {
  const fake = createFakeBricks(opts);
  const page = samplePage(fake);
  return { fake, bricks: createBricksBuilder(fake.gp, fake.win), ...page };
}

describe('ui.isTyping', () => {
  it('is false when focus is on a non-editable element', () => {
    const { bricks } = setup();
    expect(bricks.ui.isTyping()).toBe(false);
  });

  it('is true for inputs, textareas and contenteditable in the builder', () => {
    const { bricks, fake } = setup();
    fake.setActiveDomElement({ tagName: 'INPUT' });
    expect(bricks.ui.isTyping()).toBe(true);
    fake.setActiveDomElement({ tagName: 'TEXTAREA' });
    expect(bricks.ui.isTyping()).toBe(true);
    fake.setActiveDomElement({ tagName: 'DIV', isContentEditable: true });
    expect(bricks.ui.isTyping()).toBe(true);
    fake.setActiveDomElement({ tagName: 'INPUT', closest: (s) => (s === '.structure-item' ? {} : null) });
    expect(bricks.ui.isTyping()).toBe(false); // Structure panel rename handled by Bricks
    fake.setActiveDomElement(null);
    expect(bricks.ui.isTyping()).toBe(false);
  });

  it('looks inside the canvas iframe when it has focus', () => {
    const { bricks, fake } = setup();
    fake.setActiveDomElement(fake.iframe);
    expect(bricks.ui.isTyping()).toBe(false);
    fake.iframeDoc.activeElement = { tagName: 'DIV', isContentEditable: true };
    expect(bricks.ui.isTyping()).toBe(true);
    // an input in the canvas does not count while focus is in the builder panels
    fake.setActiveDomElement({ tagName: 'BUTTON' });
    expect(bricks.ui.isTyping()).toBe(false);
  });

  it('is true while Bricks is inline editing', () => {
    const { bricks, fake } = setup();
    fake.state.isInlineEditing = true;
    expect(bricks.ui.isTyping()).toBe(true);
  });

  it('falls back to built-in rules without $_isEditable', () => {
    const { bricks, fake } = setup({ omit: ['$_isEditable'] });
    fake.setActiveDomElement({ tagName: 'INPUT' });
    expect(bricks.ui.isTyping()).toBe(true);
    fake.setActiveDomElement({ tagName: 'INPUT', id: 'bricks-panel-search' });
    expect(bricks.ui.isTyping()).toBe(false);
  });

  it('treats a throwing $_isEditable as not typing', () => {
    const { bricks, fake } = setup();
    fake.gp.$_isEditable = () => {
      throw new Error('x');
    };
    fake.setActiveDomElement({ tagName: 'INPUT' });
    expect(bricks.ui.isTyping()).toBe(false);
  });
});

describe('ui panels and palette', () => {
  it('opens and closes the command palette', () => {
    const { bricks, fake } = setup();
    expect(bricks.ui.isCommandPaletteOpen()).toBe(false);
    bricks.ui.openCommandPalette();
    expect(fake.state.showCommandPalette).toBe(true);
    expect(bricks.ui.isCommandPaletteOpen()).toBe(true);
    bricks.ui.closeCommandPalette();
    expect(bricks.ui.isCommandPaletteOpen()).toBe(false);
  });

  it('shows panels through $_showPanel', () => {
    const { bricks, fake } = setup();
    bricks.ui.showPanel('structure');
    expect(fake.calls).toContainEqual(['$_showPanel', 'structure']);
    expect(fake.state.activePanel).toBe('structure');
    expect(() => bricks.ui.showPanel('settings' as any)).toThrow(InvalidArgumentError);
  });
});

describe('ui breakpoints', () => {
  it('lists non-paused breakpoints with the active one marked', () => {
    const { bricks } = setup();
    expect(bricks.ui.breakpoints()).toEqual([
      { key: 'desktop', label: 'Desktop', width: 1279, base: true, active: true },
      { key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false, active: false },
      { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false, active: false },
    ]);
  });

  it('switches breakpoints by key', () => {
    const { bricks, fake } = setup();
    bricks.ui.setBreakpoint('mobile_portrait');
    expect(fake.state.breakpointActive).toBe('mobile_portrait');
    expect(bricks.ui.breakpoints().find((b) => b.active)?.key).toBe('mobile_portrait');
    expect(() => bricks.ui.setBreakpoint('watch')).toThrow(InvalidArgumentError);
    expect(() => bricks.ui.setBreakpoint('paused_one')).toThrow(InvalidArgumentError);
  });

  it('handles missing label/width', () => {
    const { bricks, fake } = setup();
    fake.state.breakpoints = [{ key: 'x' }];
    expect(bricks.ui.breakpoints()).toEqual([{ key: 'x', label: 'x', width: null, base: false, active: false }]);
  });
});

describe('ui.toggleClasses', () => {
  it('toggles the class input for the selection', () => {
    const { bricks, fake, heading } = setup();
    expect(() => bricks.ui.toggleClasses()).toThrow(NoSelectionError);
    bricks.selection.set(heading.id);
    expect(bricks.ui.toggleClasses()).toBe(true);
    expect(fake.state.showElementClasses).toBe(true);
    expect(bricks.ui.toggleClasses()).toBe(false);
    expect(bricks.ui.toggleClasses(true)).toBe(true);
    expect(bricks.ui.toggleClasses(true)).toBe(true);
    bricks.selection.set(null);
    expect(bricks.ui.toggleClasses(false)).toBe(false); // hiding works without selection
  });
});
