export class IpcError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Structural check for IpcError on the renderer side.
 * Electron strips the prototype across IPC; instanceof won't work renderer-side.
 */
export function isIpcError(e: unknown): e is { code: string; message: string; details?: unknown } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    typeof (e as Record<string, unknown>).code === 'string'
  );
}

/**
 * Wire format for an IpcError carried across `ipcMain.handle` → renderer.
 *
 * Electron's `invoke` only serializes a rejected error's `name`/`message`; the
 * `code`/`details` fields of an `IpcError` are dropped. To preserve the
 * structured contract we encode `{ code, message, details }` as JSON behind a
 * sentinel and stuff it into the Error message on the main side, then the
 * preload `invoke` wrapper detects the sentinel and rehydrates a proper error.
 *
 * The sentinel survives Electron's `Error invoking remote method '<ch>': <name>:`
 * prefix because the decoder searches for the marker anywhere in the string.
 */
export const IPC_ERROR_SENTINEL = '__IPC_ERROR__';

interface IpcErrorWire {
  code: string;
  message: string;
  details?: unknown;
}

/** Encode an IpcError's structured payload into a sentinel-prefixed string. */
export function encodeIpcError(error: IpcError): string {
  const wire: IpcErrorWire = { code: error.code, message: error.message };
  if (error.details !== undefined) wire.details = error.details;
  return `${IPC_ERROR_SENTINEL}${JSON.stringify(wire)}`;
}

/**
 * Decode a sentinel-prefixed transport message back into its structured parts.
 * Accepts the raw rejection message — including any Electron `Error invoking
 * remote method …:` prefix — and returns null when no sentinel is present.
 */
export function decodeIpcError(
  rawMessage: string | null | undefined
): { code: string; message: string; details?: unknown } | null {
  if (!rawMessage) return null;
  const marker = rawMessage.indexOf(IPC_ERROR_SENTINEL);
  if (marker === -1) return null;
  const json = rawMessage.slice(marker + IPC_ERROR_SENTINEL.length);
  try {
    const parsed = JSON.parse(json) as IpcErrorWire;
    if (typeof parsed.code !== 'string' || typeof parsed.message !== 'string') return null;
    return { code: parsed.code, message: parsed.message, details: parsed.details };
  } catch {
    return null;
  }
}

// Error-code constants now live in @shiranami/contracts so the renderer can
// reference the same literals; re-exported here for the existing main-process
// import sites (share/playlist/shell handlers).
export {
  SHARE_ERROR_CODES,
  PLAYLIST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from '@shiranami/contracts';
