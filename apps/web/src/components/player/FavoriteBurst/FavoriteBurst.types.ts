export interface IFavoriteBurstProps {
  /** Burst counter; bump it to remount the ring so the animation replays. */
  readonly burstKey: number;
}

/** View model for the one-shot favorite burst ring. */
export interface IFavoriteBurstView {
  /** Remount key for the ring — a fresh value replays the expand-and-fade. */
  readonly burstKey: number;
}
