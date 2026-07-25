/** One rising wisp of steam — a stroke-dash path on its own staggered loop. */
export interface ISplashSteamWisp {
  /** SVG path in the 60x110 viewBox above the cup. */
  readonly d: string;
  /** Depth cue — the two flanking wisps sit behind the centre one. */
  readonly opacity?: number;
  /** Inline stroke-dash loop, `undefined` under reduced motion. */
  readonly animation: string | undefined;
}

export interface ISplashSteamProps {
  /** When true the stroke-dash loop is dropped from every wisp. */
  readonly reducedMotion: boolean;
}

export interface ISplashSteamView {
  /** Cool vapor highlight derived from `--foreground`, shared by all wisps. */
  readonly strokeColor: string;
  /** The three wisps, front to back, with their loops already resolved. */
  readonly wisps: readonly ISplashSteamWisp[];
}
