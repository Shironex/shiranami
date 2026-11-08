import { useMemo } from 'react';
import { encode } from 'uqr';
import type { ISyncQrCodeView } from './SyncQrCode.types';

/** Quiet zone in modules. The spec asks for four; phone scanners need it on dark UIs. */
const QUIET_ZONE = 4;

/**
 * Encode `value` and flatten the matrix into a single path, one `h1v1h-1z`
 * square per dark module. A single path keeps the DOM small (a version 6 code
 * is ~1,600 modules) and renders without seams between neighbours.
 */
export function buildQrPath(value: string): ISyncQrCodeView {
  // M recovers 15% damage: enough for a glare spot without growing the code.
  const qr = encode(value, { ecc: 'M', border: QUIET_ZONE });
  const segments: string[] = [];
  qr.data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) segments.push(`M${x} ${y}h1v1h-1z`);
    });
  });
  return { modules: qr.size, path: segments.join('') };
}

export function useSyncQrCode(value: string): ISyncQrCodeView {
  return useMemo(() => buildQrPath(value), [value]);
}
