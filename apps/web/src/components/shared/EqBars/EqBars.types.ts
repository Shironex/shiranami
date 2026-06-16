export interface IEqBarsProps {
  readonly size?: 'sm' | 'default';
  readonly className?: string;
}

export interface IEqBarsView {
  /** Whether the small variant is active — drives gap/height/width classes. */
  readonly sm: boolean;
}
