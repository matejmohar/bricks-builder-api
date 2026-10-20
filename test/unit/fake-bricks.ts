/**
 * A small fake of Bricks 2.4's builder globalProperties, mirroring the
 * behaviour verified against Bricks 2.4.3 (see README "How it works").
 */
import type { RawElement, RawGlobalProperties } from '../../src/types';

const NESTABLE = new Set(['section', 'container', 'block', 'div']);
const KNOWN = new Set(['section', 'container', 'block', 'div', 'heading', 'text-basic', 'button', 'image']);

export interface FakeElementNode {
  tagName: string;
  id?: string;
  isContentEditable?: boolean;
  closest?: (sel: string) => unknown;
}

export interface FakeOptions {
  version?: string | undefined;
  omit?: string[];
  secureContext?: boolean;
  clipboard?: boolean;
  /** Mount the app on [data-v-app] instead of .brx-body */
  dataVApp?: boolean;
  iframeLoaded?: boolean;
}

export interface FakeBricks {
  gp: RawGlobalProperties & Record<string, any>;
  state: Record<string, any>;
  win: Window & Record<string, any>;
  calls: Array<[string, ...unknown[]]>;
  clipboardText: { value: string };
  /** Add an element directly (bypasses history), returns it */
  add(name: string, parent?: string, label?: string): RawElement;
  byId(id: string): RawElement | undefined;
  setActiveDomElement(el: FakeElementNode | null): void;
  iframeDoc: { activeElement: FakeElementNode | null };
  iframe: FakeElementNode;
  /** Element ids the fake Structure panel does not show (collapsed parent). */
  hiddenInStructure: Set<string>;
  /** The fake rename input (rendered while renameMode is on, for the active element). */
  renameInput: FakeElementNode & { focus(): void; select(): void; selected: boolean; forId: string | null };
}

let counter = 0;
const genId = (): string => `id${(++counter).toString(36).padStart(4, '0')}`;

export const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createFakeBricks(options: FakeOptions = {}): FakeBricks {
  const calls: Array<[string, ...unknown[]]> = [];
  const watchers: Array<{ getter: () => unknown; cb: (n: unknown, o: unknown) => void; last: unknown }> = [];
  let flushScheduled = false;
  const flush = (): void => {
    flushScheduled = false;
    for (const w of watchers.slice()) {
      const v = w.getter();
      if (v !== w.last) {
        const old = w.last;
        w.last = v;
        w.cb(v, old);
      }
    }
  };
  const raw: Record<string, any> = {
    activeId: undefined,
    content: [] as RawElement[],
    header: [],
    footer: [],
    selectedElements: [],
    insertAfter: false,
    history: [],
    historyIndex: 0,
    historyInProgress: false,
    unsavedChanges: [],
    isSaving: false,
    isInlineEditing: false,
    messageOrigin: 'main',
    iframeLoaded: options.iframeLoaded ?? true,
    showCommandPalette: false,
    showElementClasses: false,
    renameMode: false,
    breakpoints: [
      { base: true, key: 'desktop', label: 'Desktop', width: 1279 },
      { key: 'tablet_portrait', label: 'Tablet portrait', width: 991 },
      { key: 'paused_one', label: 'Paused', width: 800, paused: true },
      { key: 'mobile_portrait', label: 'Mobile portrait', width: '478' },
    ],
    breakpointActive: 'desktop',
    activePanel: 'elements',
  };
  const state = new Proxy(raw, {
    set(target, key, value) {
      target[key as string] = value;
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
      }
      return true;
    },
  });

  const content = (): RawElement[] => state.content as RawElement[];
  const byId = (id: string): RawElement | undefined => content().find((e) => e.id === id);
  const parentOf = (el: RawElement): RawElement | undefined => (el.parent ? byId(String(el.parent)) : undefined);
  const roots = (): RawElement[] => content().filter((e) => !e.parent || e.parent === '0');
  const siblingsOf = (el: RawElement): string[] => parentOf(el)?.children ?? roots().map((e) => e.id);

  /** Inserts into the flat array + parent's children (root order = array order). */
  const place = (el: RawElement, parentId: string | 0, index: number): void => {
    el.parent = parentId;
    if (parentId) {
      const p = byId(parentId)!;
      p.children = p.children ?? [];
      p.children.splice(index, 0, el.id);
      content().push(el);
    } else {
      const r = roots();
      const anchor = r[index];
      const at = anchor ? content().indexOf(anchor) : content().length;
      content().splice(at, 0, el);
    }
    state.unsavedChanges = [...state.unsavedChanges, el.id];
  };

  const removeTree = (el: RawElement): void => {
    for (const c of el.children ?? []) {
      const child = byId(c);
      if (child) removeTree(child);
    }
    const p = parentOf(el);
    if (p?.children) p.children.splice(p.children.indexOf(el.id), 1);
    content().splice(content().indexOf(el), 1);
  };

  const copyTree = (el: RawElement, parentId: string | 0, index: number): RawElement => {
    const clone: RawElement = { ...el, id: genId(), children: [], settings: { ...(el.settings ?? {}) } };
    place(clone, parentId, index);
    (el.children ?? []).forEach((c, i) => {
      const child = byId(c);
      if (child) copyTree(child, clone.id, i);
    });
    return clone;
  };

  const activeElement = (): RawElement | undefined =>
    state.activeId ? byId(String(state.activeId)) : undefined;

  const clipboardText = { value: '' };

  const gp: Record<string, any> = {
    $_state: state,
    $_activeElement: {
      get value() {
        return activeElement() ?? {};
      },
    },
    $_dynamicElements: {
      get value() {
        return content();
      },
    },
    $_rootElements: {
      get value() {
        return roots();
      },
    },
    $_watch(getter: () => unknown, cb: (n: unknown, o: unknown) => void) {
      const w = { getter, cb, last: getter() };
      watchers.push(w);
      return () => {
        const i = watchers.indexOf(w);
        if (i !== -1) watchers.splice(i, 1);
      };
    },
    $_getDynamicElementById: (id: string) => byId(id),
    $_isNestable: (el: RawElement) => NESTABLE.has(el?.name),
    $_getElementConfig: (name: string) => (KNOWN.has(name) ? { name, label: name } : { label: name }),
    $_createElement: ({ name }: { name: string }) => ({ id: genId(), name, parent: 0, children: [], settings: {} }),
    $_addNewElement({
      element,
      parent: explicitParent,
      index: explicitIndex,
      isDropTarget,
    }: {
      element: RawElement;
      parent?: string | 0;
      index?: number;
      isDropTarget?: boolean;
    }) {
      calls.push(['$_addNewElement', element.name, isDropTarget ? { parent: explicitParent, index: explicitIndex } : 'auto']);
      // Like Bricks: re-creates the element with a fresh id.
      const el: RawElement = { ...element, id: genId(), children: [] };
      const d = activeElement();
      let parent: string | 0 = 0;
      let index = roots().length;
      if (isDropTarget) {
        parent = el.name === 'section' ? 0 : (explicitParent ?? 0);
        index = explicitIndex ?? 0;
      } else if (el.name === 'section') {
        parent = 0;
      } else if (d) {
        if (NESTABLE.has(d.name)) {
          parent = d.id;
          index = d.children?.length ?? 0;
        } else {
          parent = d.parent ? String(d.parent) : 0;
          index = siblingsOf(d).indexOf(d.id) + 1;
        }
      }
      if (state.insertAfter && !isDropTarget) {
        const p = parent ? byId(parent) : undefined;
        if (p) parent = p.parent ? String(p.parent) : 0;
        if (!parent && d) index = roots().findIndex((e) => e.id === d.id) + 1;
      }
      place(el, parent, index);
      if (el.name === 'section') {
        const container: RawElement = { id: genId(), name: 'container', parent: el.id, children: [], settings: {} };
        place(container, el.id, 0);
      }
      return el;
    },
    $_isCloneable: (el: RawElement) => el.cloneable !== false,
    $_cloneElement({ element, index }: { element: RawElement; index: number }) {
      calls.push(['$_cloneElement', element.id, index]);
      copyTree(element, element.parent ? String(element.parent) : 0, index + 1);
    },
    $_isDeletable: (el: RawElement) => el.deletable !== false,
    $_postMessage(message: unknown) {
      calls.push(['$_postMessage', message]);
    },
    $_deleteElement(el: unknown) {
      calls.push(['$_deleteElement', el]);
      if (!el || typeof el !== 'object') return; // ids are silently ignored, like Bricks
      const e = el as RawElement;
      removeTree(e);
      state.activeId = e.parent || null;
    },
    $_wrapInNestable(e: unknown, tag: string) {
      calls.push(['$_wrapInNestable', e, tag]);
      const el = activeElement();
      if (!el || el.protected) return;
      const parentId = el.parent ? String(el.parent) : 0;
      const index = siblingsOf(el).indexOf(el.id);
      const wrapper: RawElement = { id: genId(), name: tag, parent: parentId, children: [], settings: {} };
      removeFromParent(el);
      place(wrapper, parentId, index);
      el.parent = wrapper.id;
      wrapper.children!.push(el.id);
      if (!parentId) {
        content().splice(content().indexOf(el), 1);
        content().push(el);
      }
      setTimeout(() => {
        state.activeId = wrapper.id;
      }, 0);
    },
    $_copyElements() {
      calls.push(['$_copyElements']);
      const el = activeElement();
      if (el) clipboardText.value = JSON.stringify({ source: 'bricksCopiedElements', content: [el] });
    },
    $_pasteElements() {
      calls.push(['$_pasteElements']);
      Promise.resolve().then(() => {
        let data: any;
        try {
          data = JSON.parse(clipboardText.value);
        } catch {
          return;
        }
        if (data?.source !== 'bricksCopiedElements') return;
        const src = data.content[0] as RawElement;
        const d = activeElement();
        const parent = d ? (d.parent ? String(d.parent) : 0) : 0;
        const index = d ? siblingsOf(d).indexOf(d.id) + 1 : roots().length;
        const pasted: RawElement = { ...src, id: genId(), children: [] };
        place(pasted, parent, index);
        const child: RawElement = { id: genId(), name: 'heading', parent: pasted.id, children: [], settings: {} };
        if (NESTABLE.has(pasted.name)) place(child, pasted.id, 0);
      });
    },
    $_goto(direction: string) {
      calls.push(['$_goto', direction]);
      state.historyIndex += direction === 'undo' ? -1 : 1;
    },
    $_savePostAsync() {
      calls.push(['$_savePostAsync']);
      state.isSaving = true;
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          state.unsavedChanges = [];
          state.isSaving = false;
          resolve();
        }, 5),
      );
    },
    $_savePost() {
      calls.push(['$_savePost']);
      state.isSaving = true;
      setTimeout(() => {
        state.unsavedChanges = [];
        state.isSaving = false;
      }, 5);
    },
    $_isEditable(el: FakeElementNode) {
      if (el.closest?.('.structure-item')) return false;
      if (el.id === 'bricks-panel-search') return false;
      if (el.isContentEditable) return true;
      const t = el.tagName.toLowerCase();
      return t === 'input' || t === 'textarea';
    },
    $_showPanel({ panel }: { panel: string }) {
      calls.push(['$_showPanel', panel]);
      state.activePanel = panel;
    },
  };

  function removeFromParent(el: RawElement): void {
    const p = parentOf(el);
    if (p?.children) p.children.splice(p.children.indexOf(el.id), 1);
  }

  for (const key of options.omit ?? []) delete gp[key];

  const iframeDoc = { activeElement: { tagName: 'BODY' } as FakeElementNode | null };
  const iframe: FakeElementNode & { contentDocument: typeof iframeDoc } = {
    tagName: 'IFRAME',
    id: 'bricks-builder-iframe',
    contentDocument: iframeDoc,
  };
  const host = { __vue_app__: { config: { globalProperties: gp } } };
  const hiddenInStructure = new Set<string>();
  const renameInput = {
    tagName: 'INPUT',
    selected: false,
    forId: null as string | null,
    focus() {
      doc.activeElement = renameInput;
    },
    select() {
      renameInput.selected = true;
    },
    closest: (sel: string) => (sel === '.structure-item' ? {} : null),
  };
  const doc = {
    activeElement: { tagName: 'BODY' } as FakeElementNode | null,
    querySelector(sel: string) {
      if (sel === '.brx-body') return options.dataVApp ? { tagName: 'BODY' } : host;
      if (sel === '#bricks-builder-iframe') return iframe;
      // Like Bricks: the Structure panel shows an input for the active element in rename mode.
      const m = /^#bricks-structure li\[data-id="([\w-]+)"\] > \.structure-item \.title input$/.exec(sel);
      if (m && raw.renameMode && String(raw.activeId) === m[1] && !hiddenInStructure.has(m[1]!)) {
        renameInput.forId = m[1]!;
        return renameInput;
      }
      return null;
    },
    querySelectorAll(sel: string) {
      return sel === '[data-v-app]' && options.dataVApp ? [{}, host] : [];
    },
  };
  const win: Record<string, any> = {
    document: doc,
    bricksData: { version: 'version' in options ? options.version : '2.4.3', builderWrapElement: 'block' },
    navigator: options.clipboard === false ? {} : { clipboard: {} },
    isSecureContext: options.secureContext ?? true,
  };
  win.top = win;

  return {
    gp: gp as FakeBricks['gp'],
    state,
    win: win as FakeBricks['win'],
    calls,
    clipboardText,
    add(name, parent, label) {
      const el: RawElement = { id: genId(), name, parent: parent ?? 0, children: [], settings: {} };
      if (label) el.label = label;
      if (parent) {
        const p = byId(parent)!;
        p.children!.push(el.id);
      }
      raw.content.push(el);
      return el;
    },
    byId,
    setActiveDomElement(el) {
      doc.activeElement = el;
    },
    iframeDoc,
    iframe,
    hiddenInStructure,
    renameInput,
  };
}

/** A typical page: section > container > [heading, button], plus a second root section. */
export function samplePage(fake: FakeBricks) {
  const section = fake.add('section');
  const container = fake.add('container', section.id);
  const heading = fake.add('heading', container.id);
  const button = fake.add('button', container.id);
  const section2 = fake.add('section');
  return { section, container, heading, button, section2 };
}
