/**
 * @martej/bricks-builder-api
 *
 * Unofficial, typed API for the Bricks Builder editor. Relies on undocumented
 * Bricks internals that can change in any release.
 */
export { connect, createBricksBuilder, findBuilder } from './connect';
export type { BricksBuilder, UnstableApi } from './connect';
export type { SelectionApi } from './selection';
export type { ElementsApi } from './elements';
export type { ClipboardApi } from './clipboard';
export type { HistoryApi } from './history';
export type { DocumentApi } from './document';
export type { UiApi } from './ui';
export {
  BricksApiError,
  BricksUnavailableError,
  ClipboardUnavailableError,
  ElementNotFoundError,
  InvalidArgumentError,
  NoSelectionError,
  NotAllowedError,
  TimeoutError,
  UnsupportedError,
} from './errors';
export { CAPABILITIES } from './types';
export type {
  Breakpoint,
  Capability,
  CapabilityMap,
  ConnectOptions,
  ElementId,
  ElementInfo,
  InsertOptions,
  InsertPosition,
  PanelName,
  PasteOptions,
  RawBreakpoint,
  RawBricksData,
  RawElement,
  RawGlobalProperties,
  RawRef,
  RawState,
  SaveOptions,
  SelectionListener,
  Unsubscribe,
  WrapTag,
} from './types';
export { MIN_BRICKS_VERSION, parseVersion, selectAdapter } from './versions';
export type { Driver, VersionAdapter } from './driver';
export type { Requirement } from './probe';

/** Version of this library. */
export const VERSION = '0.1.0';
