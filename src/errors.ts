import type { Capability } from './types';

/** Base class of every error thrown by bricks-builder-api. */
export class BricksApiError extends Error {
  constructor(message: string) {
    super(message);
    // Explicit names (not new.target.name) so they survive minification.
    this.name = 'BricksApiError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The Bricks builder app could not be found (not a builder page, not loaded yet, or timed out). */
export class BricksUnavailableError extends BricksApiError {
  override name = 'BricksUnavailableError';
}

/** An action that defaults to the selection was called while nothing is selected. */
export class NoSelectionError extends BricksApiError {
  override name = 'NoSelectionError';
  constructor(action: string) {
    super(`${action}: no element is selected`);
  }
}

/** The connected Bricks version does not provide what a capability needs. */
export class UnsupportedError extends BricksApiError {
  override name = 'UnsupportedError';
  readonly capability: Capability;
  constructor(capability: Capability, detail?: string) {
    super(`Capability "${capability}" is not supported by this Bricks version${detail ? `: ${detail}` : ''}`);
    this.capability = capability;
  }
}

/** No element with the given id exists in the active builder area. */
export class ElementNotFoundError extends BricksApiError {
  override name = 'ElementNotFoundError';
  readonly elementId: string;
  constructor(id: string) {
    super(`Element "${id}" not found`);
    this.elementId = id;
  }
}

/** Bricks refuses the action for this element (e.g. not cloneable / not deletable / protected). */
export class NotAllowedError extends BricksApiError {
  override name = 'NotAllowedError';
}

/** An argument is invalid (unknown element type, unknown breakpoint, ...). */
export class InvalidArgumentError extends BricksApiError {
  override name = 'InvalidArgumentError';
}

/** The system clipboard is not available (needs a secure context and clipboard permission). */
export class ClipboardUnavailableError extends BricksApiError {
  override name = 'ClipboardUnavailableError';
}

/** Waiting for Bricks to finish something (e.g. saving) took too long. */
export class TimeoutError extends BricksApiError {
  override name = 'TimeoutError';
}
