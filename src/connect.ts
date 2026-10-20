import { createClipboard, type ClipboardApi } from './clipboard';
import { createContext } from './context';
import { sleep } from './context';
import { createDocument, type DocumentApi } from './document';
import { createElements, type ElementsApi } from './elements';
import { BricksUnavailableError } from './errors';
import { createHistory, type HistoryApi } from './history';
import { probe } from './probe';
import { createSelection, type SelectionApi } from './selection';
import type { Capability, CapabilityMap, ConnectOptions, RawBricksData, RawGlobalProperties, RawState } from './types';
import { CAPABILITIES } from './types';
import { createUi, type UiApi } from './ui';
import { selectAdapter } from './versions';

export interface UnstableApi {
  /**
   * Bricks' Vue `globalProperties` (`$_state`, `$_addNewElement`, ...).
   * Escape hatch: undocumented, can change in any Bricks release.
   */
  readonly globalProperties: RawGlobalProperties;
  /** Bricks' reactive builder store (`globalProperties.$_state`). Same caveats. */
  readonly state: RawState;
}

export interface BricksBuilder {
  /** Bricks version reported by the builder (`window.bricksData.version`), or null. */
  readonly version: string | null;
  /** Adapter used for this version, e.g. `'2.4'`. */
  readonly adapterVersion: string;
  /**
   * True when this library has an adapter written for this exact Bricks
   * major.minor. When false, the latest adapter is used and only the probes
   * decide which capabilities are available.
   */
  readonly isKnownVersion: boolean;
  /** Whether a capability is available in the connected builder. */
  supports(capability: Capability): boolean;
  /** Every capability and whether it is available. */
  capabilities(): CapabilityMap;
  readonly selection: SelectionApi;
  readonly elements: ElementsApi;
  readonly clipboard: ClipboardApi;
  readonly history: HistoryApi;
  readonly document: DocumentApi;
  readonly ui: UiApi;
  /** Documented escape hatch to Bricks internals. Not covered by semver. */
  readonly unstable: UnstableApi;
}

interface VueHost extends Element {
  __vue_app__?: { config?: { globalProperties?: RawGlobalProperties } };
}

function globalPropertiesOf(el: Element | null): RawGlobalProperties | null {
  const gp = (el as VueHost | null)?.__vue_app__?.config?.globalProperties;
  return gp && typeof gp === 'object' && gp.$_state && typeof gp.$_state === 'object' ? gp : null;
}

function findIn(doc: Document): RawGlobalProperties | null {
  const fromBody = globalPropertiesOf(doc.querySelector('.brx-body'));
  if (fromBody) return fromBody;
  for (const el of Array.from(doc.querySelectorAll('[data-v-app]'))) {
    const gp = globalPropertiesOf(el);
    if (gp) return gp;
  }
  return null;
}

/**
 * Finds Bricks' globalProperties in `win`, or (when running inside the canvas
 * iframe) in the same-origin top window. Returns the hosting window too.
 */
export function findBuilder(win: Window): { gp: RawGlobalProperties; win: Window } | null {
  const candidates: Window[] = [win];
  try {
    if (win.top && win.top !== win) candidates.push(win.top);
  } catch {
    /* cross-origin top */
  }
  for (const w of candidates) {
    try {
      if (!w.document) continue;
      const gp = findIn(w.document);
      if (gp) return { gp, win: w };
    } catch {
      /* cross-origin or detached */
    }
  }
  return null;
}

/** Builds the API around already-found globalProperties (no waiting). */
export function createBricksBuilder(gp: RawGlobalProperties, win: Window): BricksBuilder {
  const bricksData = (win as unknown as { bricksData?: RawBricksData }).bricksData;
  const version = typeof bricksData?.version === 'string' ? bricksData.version : null;
  const { adapter, exact } = selectAdapter(version);
  const caps = probe(gp, adapter.requirements);
  const driver = adapter.createDriver(gp, win);
  const ctx = createContext(gp, win, driver, caps);

  return {
    version,
    adapterVersion: adapter.version,
    isKnownVersion: exact,
    supports: (capability) => (CAPABILITIES as readonly string[]).includes(capability) && caps[capability] === true,
    capabilities: () => ({ ...caps }),
    selection: createSelection(ctx),
    elements: createElements(ctx),
    clipboard: createClipboard(ctx),
    history: createHistory(ctx),
    document: createDocument(ctx),
    ui: createUi(ctx),
    unstable: {
      get globalProperties() {
        return gp;
      },
      get state() {
        return gp.$_state;
      },
    },
  };
}

/**
 * Waits for the Bricks builder app and returns the API.
 * Throws BricksUnavailableError when it does not appear within `timeout`.
 */
export async function connect(options: ConnectOptions = {}): Promise<BricksBuilder> {
  const timeout = options.timeout ?? 10000;
  const interval = options.interval ?? 50;
  const waitForCanvas = options.waitForCanvas ?? true;
  const win = options.window ?? (typeof window !== 'undefined' ? window : undefined);
  if (!win) throw new BricksUnavailableError('No window available: pass { window } or run in the builder page');

  const deadline = Date.now() + timeout;
  let lastReason = 'Bricks builder app not found (is this a Bricks builder page, ?bricks=run?)';
  for (;;) {
    const found = findBuilder(win);
    if (found) {
      const state = found.gp.$_state;
      const canvasReady = !waitForCanvas || !('iframeLoaded' in state) || !!state.iframeLoaded;
      if (canvasReady) return createBricksBuilder(found.gp, found.win);
      lastReason = 'Bricks builder found, but the canvas did not finish loading';
    }
    if (Date.now() >= deadline) throw new BricksUnavailableError(`${lastReason} (waited ${timeout} ms)`);
    await sleep(interval);
  }
}
