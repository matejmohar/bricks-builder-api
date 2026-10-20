# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (the `unstable` escape hatch is excluded from semver).

## [Unreleased]

### Fixed

- Actions called after the user clicked in the canvas (selection, insert, duplicate, delete, wrap,
  rename, paste, undo/redo, save and the UI toggles) were applied to the builder's data but not
  rendered in the canvas, and were missing from Bricks' undo history and unsaved changes. Bricks
  only records and syncs changes whose `$_state.messageOrigin` is the builder window; the 2.4
  adapter now claims it before every state change.
- Changes made within 400 ms of a key press in a canvas inline editor (Bricks' typing throttle,
  `$_state.sendPostMessage = false`) never reached the canvas. The adapter re-enables the sync
  before changing anything, as Bricks does when an element is selected.

## [0.1.0] - 2026-10-20

First release. Supports Bricks 2.4 (verified on 2.4.3).

### Added

- `connect()` waits for the Bricks builder app (also from inside the canvas iframe) and throws
  `BricksUnavailableError` on timeout.
- Version adapters (`src/versions/2.4.ts`) selected by Bricks `major.minor`, with runtime
  capability probes: `supports()`, `capabilities()`, `UnsupportedError`.
- `selection`: `get`, `set`, `onChange`, `parent`, `firstChild`, `next`, `previous`.
- `elements`: `get`, `insert` (`'auto'` / `'outside'`), `duplicate`, `delete`, `wrap`, `rename`.
- `clipboard`: `copy`, `paste` (system clipboard, Bricks JSON).
- `history`: `undo`, `redo`, `canUndo`, `canRedo`.
- `document`: `save`, `hasUnsavedChanges`.
- `ui`: `isTyping`, command palette, `showPanel`, `breakpoints`, `setBreakpoint`, `toggleClasses`.
- `unstable.globalProperties` / `unstable.state` escape hatch.
- Typed errors: `NoSelectionError`, `ElementNotFoundError`, `NotAllowedError`,
  `InvalidArgumentError`, `ClipboardUnavailableError`, `TimeoutError`.
- ESM build with TypeScript declarations and an IIFE build (`BricksBuilderAPI` global).
- Unit tests (Vitest), e2e tests (Playwright) against a real Bricks builder, and a generated
  compatibility matrix (`compat/matrix.json`, `COMPATIBILITY.md`).

[0.1.0]: https://www.npmjs.com/package/@martej/bricks-builder-api/v/0.1.0
