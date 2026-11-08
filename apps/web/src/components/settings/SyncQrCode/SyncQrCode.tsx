import { cn } from '@/lib/utils';
import { useSyncQrCode } from './SyncQrCode.hooks';
import type { ISyncQrCodeProps } from './SyncQrCode.types';

/**
 * A QR code as inline SVG. Always dark modules on a white plate, whatever the
 * theme: inverted or tinted codes scan badly on many phone cameras.
 */
export default function SyncQrCode({ value, label, size = 192, className }: ISyncQrCodeProps) {
  const { modules, path } = useSyncQrCode(value);

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      className={cn('rounded-lg bg-white', className)}
      data-slot="sync-qr-code"
    >
      <path d={path} fill="#000" />
    </svg>
  );
}
