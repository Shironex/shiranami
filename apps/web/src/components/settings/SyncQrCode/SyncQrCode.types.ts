export interface ISyncQrCodeProps {
  /** What the code encodes: the `shiranami://pair?...` link. */
  readonly value: string;
  /** Accessible name; the payload itself carries a secret and is never read out. */
  readonly label: string;
  /** Rendered edge length in CSS pixels. */
  readonly size?: number;
  readonly className?: string;
}

export interface ISyncQrCodeView {
  /** Modules per side, quiet zone included: the SVG viewBox. */
  readonly modules: number;
  /** One SVG path covering every dark module. */
  readonly path: string;
}
