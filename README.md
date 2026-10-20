# bricks-builder-api

An unofficial, typed JavaScript/TypeScript API for the [Bricks Builder](https://bricksbuilder.io/) (WordPress) editor.

Bricks has no public JavaScript API for its builder. This library wraps the builder's internal Vue
app behind a small, typed, tested surface — select elements, insert, duplicate, delete, wrap,
rename, copy/paste, undo/redo, save, and a few UI toggles — so browser extensions, userscripts,
keyboard-shortcut tools and builder add-ons don't each have to reverse-engineer Bricks.

> **Unofficial — relies on undocumented Bricks internals that can change in any release.**
> This project is not affiliated with or endorsed by Bricks. Every capability is probed at runtime
> and verified against real Bricks releases by an end-to-end suite (see
> [COMPATIBILITY.md](./COMPATIBILITY.md)), but a Bricks update can break things at any time.

- Zero runtime dependencies, ~6 kB gzipped
- ESM + TypeScript declarations, and an IIFE build for `<script>` tags / userscripts
- Capability probes: `bricks.supports('elements.wrap')` instead of version sniffing
- Typed errors (`NoSelectionError`, `UnsupportedError`, …)
- Never monkey-patches Bricks functions and never writes the element tree directly: every action
  goes through the same Bricks functions the builder UI uses, so it lands in Bricks' undo history
  and unsaved-changes tracking like a user action

## Install

```sh
npm install @martej/bricks-builder-api
```

Or load the IIFE build from jsDelivr (exposes the global `BricksBuilderAPI`):

```html
<script src="https://cdn.jsdelivr.net/npm/@martej/bricks-builder-api@0.1.0/dist/bricks-builder-api.iife.js"></script>
```

The code must run in the builder page (`/?bricks=run`) — for example from a browser extension
content script injected into the page context, a userscript, or a script enqueued in the builder by
a WordPress plugin. Running it inside the canvas iframe also works: it finds the builder through
`window.top`.

## Usage

```ts
import { connect, NoSelectionError } from '@martej/bricks-builder-api';

const bricks = await connect(); // waits for the builder app (default timeout 10 s)

console.log(bricks.version); // '2.4.3'

// React to selection changes (canvas clicks, Structure panel, API calls)
const off = bricks.selection.onChange((next, prev) => {
  console.log('selected', next?.name, next?.id, 'was', prev?.id);
});

// Keyboard helper: Alt+D duplicates, Alt+Arrow keys walk the tree
window.addEventListener('keydown', (e) => {
  if (!e.altKey || bricks.ui.isTyping()) return;
  try {
    if (e.key === 'd') bricks.elements.duplicate();
    if (e.key === 'ArrowUp') bricks.selection.parent();
    if (e.key === 'ArrowDown') bricks.selection.firstChild();
    if (e.key === 'ArrowRight') bricks.selection.next();
    if (e.key === 'ArrowLeft') bricks.selection.previous();
  } catch (err) {
    if (!(err instanceof NoSelectionError)) throw err;
  }
});

// Build something
const section = bricks.elements.insert('section'); // Bricks adds a container inside
bricks.selection.set(section.childIds[0]!);
const heading = bricks.elements.insert('heading');
bricks.elements.rename('Hero title', heading.id);
await bricks.document.save();
```

With the IIFE build:

```js
const bricks = await BricksBuilderAPI.connect();
bricks.ui.openCommandPalette();
```

Note: key events inside the canvas iframe are not delivered to listeners on the builder window.
If you add shortcuts, listen on the canvas document too
(`document.querySelector('#bricks-builder-iframe').contentDocument`).

## API reference

### `connect(options?): Promise<BricksBuilder>`

Waits for the Bricks builder app and returns the API. Throws `BricksUnavailableError` if it does not
appear within the timeout (e.g. not a builder page).

| Option | Default | |
| --- | --- | --- |
| `timeout` | `10000` | ms to wait for the builder |
| `window` | global `window` | window hosting the builder |
| `interval` | `50` | polling interval in ms |
| `waitForCanvas` | `true` | also wait until the canvas iframe has loaded |

Also exported: `createBricksBuilder(globalProperties, window)` (no waiting) and `findBuilder(window)`.

### `BricksBuilder`

| Member | |
| --- | --- |
| `version: string \| null` | Bricks version (`window.bricksData.version`) |
| `adapterVersion: string` | adapter in use, e.g. `'2.4'` |
| `isKnownVersion: boolean` | `false` when no adapter exists for this Bricks major.minor (the latest adapter is used and only probes decide) |
| `supports(capability): boolean` | whether a capability is available |
| `capabilities(): Record<Capability, boolean>` | all capabilities |
| `selection`, `elements`, `clipboard`, `history`, `document`, `ui` | see below |
| `unstable.globalProperties`, `unstable.state` | escape hatch, see below |

### Types

```ts
interface ElementInfo {
  id: string;
  name: string;            // element type: 'section', 'heading', …
  parentId: string | null; // null at root level
  label: string | null;    // custom Structure-panel label
  isNestable: boolean;
  childIds: string[];
}
```

`ElementInfo` objects are plain snapshots; changing them does nothing.

### `bricks.selection`

| Method | Returns | |
| --- | --- | --- |
| `get()` | `ElementInfo \| null` | the selected element. Synchronous, reflects `set()` immediately |
| `set(id \| null)` | `ElementInfo \| null` | select an element (clears a multi-selection), or clear with `null`. `ElementNotFoundError` for unknown ids |
| `onChange((next, prev) => void)` | `() => void` | called on every selection change, from any source (canvas, Structure panel, API, deletes). Runs asynchronously on the next macrotask with the then-current selection, so transient changes collapse into one call. Returns an unsubscribe function |
| `parent()` | `ElementInfo \| null` | select the parent; `null` (unchanged) at root level |
| `firstChild()` | `ElementInfo \| null` | select the first child; `null` (unchanged) for leaves / empty nestables |
| `next()` / `previous()` | `ElementInfo \| null` | select the next/previous sibling (root-level elements are siblings too); `null` (unchanged) at the ends |

The navigation methods throw `NoSelectionError` when nothing is selected.

### `bricks.elements`

| Method | Returns | |
| --- | --- | --- |
| `get(id)` | `ElementInfo \| null` | element in the active area (page content, or header/footer template) |
| `insert(name, { position? })` | `ElementInfo` | insert a new element, like clicking it in the Elements panel. The selection does not change. `InvalidArgumentError` for unknown element types |
| `duplicate(id?)` | `ElementInfo` | duplicate (with children) right after the original; the selection stays on the original |
| `delete(id?)` | `void` | delete with children. Bricks then selects another element a tick later (the next sibling in 2.4.3); in between, `selection.get()` returns `null` |
| `wrap(tag?)` | `Promise<ElementInfo>` | wrap the selection in `'div' \| 'block' \| 'container' \| 'section'` (default: Bricks' "wrap element" setting, usually `'block'`). Resolves with the wrapper once Bricks has selected it |
| `rename(label, id?)` | `ElementInfo` | set the Structure-panel label; `''` or `null` resets it |

`id` defaults to the selection; when it is omitted and nothing is selected, a `NoSelectionError` is
thrown.

Renaming the *selected* element: Bricks 2.4 caches the title of the active Structure-panel item, so
the panel shows the new label once the selection moves (the label itself is set, saved and undoable
immediately). This is the same code path the panel's own rename input uses. Elements Bricks marks as not cloneable/deletable (or protected) throw `NotAllowedError`.

`insert` positions:

- `'auto'` (default) — Bricks' default: inside the selected element if it is nestable (as last
  child), otherwise right after it; with no selection at the end of the page. A `section` always
  goes to the root level and gets a `container` child, as in the builder.
- `'outside'` — one level up, like Bricks' "insert after" mode (holding the modifier key in the
  Elements panel): directly after the selected element if it is nestable, otherwise directly after
  the selected element's parent. A root-level leaf gets the new element right after itself; with
  no selection it behaves like `'auto'`. (Bricks' own "insert after" flag computes the index within
  that level imprecisely in 2.4, so the library passes an explicit parent/index to
  `$_addNewElement` instead.)

### `bricks.clipboard`

Uses the system clipboard exactly like Ctrl/Cmd+C / Ctrl/Cmd+V in the builder. Requires a secure
context (HTTPS or localhost) and clipboard permission, otherwise throws `ClipboardUnavailableError`.

| Method | Returns | |
| --- | --- | --- |
| `copy()` | `Promise<void>` | copy the selection (with children) as Bricks JSON. `NoSelectionError` without a selection |
| `paste({ timeout? })` | `Promise<ElementInfo[]>` | paste after the selection; resolves with the pasted top-level elements, or `[]` if nothing was pasted within `timeout` (default 3000 ms), e.g. when the clipboard holds no Bricks data |

### `bricks.history`

| Method | Returns | |
| --- | --- | --- |
| `undo()` / `redo()` | `boolean` | `false` (and nothing happens) when not possible or while Bricks is still applying a step |
| `canUndo()` / `canRedo()` | `boolean` | same rules as Bricks' toolbar buttons |

Bricks records history with a debounced watcher: an action becomes one history entry roughly
600 ms after it happened. Calling `undo()` immediately after an action undoes the *previous* entry.

### `bricks.document`

| Method | Returns | |
| --- | --- | --- |
| `save({ timeout? })` | `Promise<void>` | save (like Ctrl/Cmd+S); resolves when Bricks is done (default timeout 15 s, `TimeoutError`) |
| `hasUnsavedChanges()` | `boolean` | |

### `bricks.ui`

| Method | Returns | |
| --- | --- | --- |
| `isTyping()` | `boolean` | keyboard focus is in an input/textarea/contenteditable in the builder or the canvas iframe, or Bricks is inline-editing text. Use it before handling shortcuts. Note: Bricks focuses the Elements panel search box when the builder loads, so this is `true` until focus moves |
| `isCommandPaletteOpen()` / `openCommandPalette()` / `closeCommandPalette()` | | Bricks' command palette |
| `showPanel(panel)` | `void` | `'structure' \| 'element' \| 'elements'` |
| `breakpoints()` | `Breakpoint[]` | `{ key, label, width, base, active }` for each non-paused breakpoint |
| `setBreakpoint(key)` | `void` | switch the canvas breakpoint; `InvalidArgumentError` for unknown keys |
| `toggleClasses(force?)` | `boolean` | toggle the selected element's class input (like Enter in the builder); returns the new state. Showing it needs a selection |
| `startRename(id?, { timeout? })` | `Promise<boolean>` | open Bricks' own rename field for the element in the Structure panel (like double-clicking it there), focused with the label selected; selects the element first when `id` is given. `false` when the Structure panel does not show the element (closed panel, collapsed parent). Bricks stores the label as the user types |

### Capabilities

`selection.get`, `selection.set`, `selection.onChange`, `selection.navigate`, `elements.get`,
`elements.insert`, `elements.duplicate`, `elements.delete`, `elements.wrap`, `elements.rename`,
`clipboard.copy`, `clipboard.paste`, `history.undo`, `history.redo`, `document.save`,
`document.unsavedChanges`, `ui.isTyping`, `ui.commandPalette`, `ui.showPanel`, `ui.breakpoints`,
`ui.toggleClasses`, `ui.rename`.

At connect time each capability's required Bricks internals are probed. Calling a method whose
capability is missing throws `UnsupportedError` (with `.capability`).

### Errors

All errors extend `BricksApiError`:

| Error | When |
| --- | --- |
| `BricksUnavailableError` | `connect()` found no builder |
| `NoSelectionError` | an action defaulting to the selection was called with nothing selected |
| `UnsupportedError` | the capability is not available in this Bricks version (`.capability`) |
| `ElementNotFoundError` | unknown element id (`.elementId`) |
| `NotAllowedError` | Bricks refused (not cloneable/deletable, protected, missing permission) |
| `InvalidArgumentError` | unknown element type, panel, breakpoint, wrap tag, … |
| `ClipboardUnavailableError` | no secure context / clipboard |
| `TimeoutError` | saving did not finish in time |

### `bricks.unstable`

`bricks.unstable.globalProperties` is Bricks' Vue `globalProperties` object and
`bricks.unstable.state` its reactive store (`$_state`). They are provided so you are not blocked
when this library lacks something, but they are raw Bricks internals: undocumented, untyped beyond
the basics, and not covered by this package's semver. If you need something from there regularly,
please open an issue.

## How it works

The builder is a Vue 3 app mounted on `.brx-body`; its `config.globalProperties` holds the store
(`$_state`) and the functions the builder UI calls (`$_addNewElement`, `$_cloneElement`,
`$_deleteElement`, `$_wrapInNestable`, `$_goto`, `$_savePostAsync`, …). Each supported Bricks
`major.minor` has an adapter in `src/versions/` that maps capabilities to the internals they need
and implements them; `connect()` picks the adapter by `bricksData.version` (falling back to the
latest adapter for unknown versions) and probes every capability.

Bricks runs a second, synced Vue app inside the canvas iframe, and `$_state.messageOrigin` records
which of the two the user last interacted with. The builder window's history watcher and its sync to
the canvas only act on changes made while it is `'main'`. Since the library always acts through the
builder window's app, every call that changes builder state first sets it to `'main'` (as Bricks'
own builder-window mouse and focus handlers do). Without that, a change made right after a click in
the canvas would neither show up in the canvas nor be undoable. For the same reason it lifts Bricks'
400 ms typing throttle on that sync (`sendPostMessage`), which a key press in a canvas inline editor
starts.

## Supported versions

- Minimum: **Bricks 2.4**.
- Policy: the **latest two Bricks minor releases** are supported and tested (currently 2.4 only,
  since 2.4 is the first supported release). Older releases may keep working but are not tested.
- Newer, unknown releases use the latest adapter; capabilities whose internals are missing report
  `supports() === false` instead of failing in odd ways.
- The tested matrix is in [COMPATIBILITY.md](./COMPATIBILITY.md).

## Running the tests

```sh
npm install
npm run typecheck
npm test            # unit tests (Vitest) against a fake Bricks globalProperties
npm run build       # dist/index.js, dist/index.d.ts, dist/bricks-builder-api.iife.js
npm run test:e2e    # builds, then runs Playwright against a real Bricks builder
npm run compat      # renders compat/matrix.json to COMPATIBILITY.md
```

The e2e suite needs a WordPress site with Bricks (licence active) where pages can be edited with
Bricks, plus WP-CLI on the same machine (tests create a fresh page per test with WP-CLI and delete
it afterwards). Configuration via environment variables:

| Variable | Default |
| --- | --- |
| `BRICKS_URL` | `http://localhost:8080` |
| `BRICKS_USER` / `BRICKS_PASSWORD` | `admin` / `admin` |
| `WP_PATH` | `/home/user/wp-lab/site` |
| `WP_CLI` | `/home/user/wp-lab/wp-cli.phar` (run with `php`) |

Playwright runs Chromium headless with `clipboard-read`/`clipboard-write` permissions; the suite
runs serially (PHP's built-in server handles one request at a time). `test/e2e/compat.spec.ts`
writes the result for the connected Bricks version into `compat/matrix.json`.

## Contributing

Issues and pull requests are welcome.

- **Bug reports must include the failing matrix entry**: run `npm run test:e2e` against your Bricks
  version and paste the relevant line(s) of `compat/matrix.json` (capability → `{ "<version>": "fail" }`)
  plus the Bricks version, browser, and what you called.
- Supporting a new Bricks release usually means adding `src/versions/<major.minor>.ts` (copy the
  latest adapter, adjust what changed), registering it in `src/versions/index.ts`, and adding the
  e2e/compat results.
- Keep the rules: no runtime dependencies, no monkey-patching Bricks, no direct writes to the
  element tree (`$_state.content`), typed errors for every failure mode.
- `npm run typecheck && npm test` must pass; include e2e results for behaviour changes.

## License

[MIT](./LICENSE) © 2026 Martej
