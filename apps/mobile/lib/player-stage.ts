/**
 * Geometry of the player's middle area (between the top bar and the action
 * row) in its two states: `side`, with the small cover beside the title and
 * the card under it, and `hero`, with a big centered cover, the title under
 * it and the card folded to its tab pill. The screen animates between them,
 * so both are computed up front for the measured area.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageState {
  /** The cover, always square. */
  cover: Rect;
  /** The card, or a zero height strip at the bottom when there is none. */
  card: Rect;
}

export interface StageLayout {
  side: StageState;
  hero: StageState;
}

export const STAGE = {
  sideCover: 132,
  sideX: 24,
  sideTop: 18,
  /** Between the cover row and the card. */
  sideGap: 18,
  cardX: 16,
  /** The card folded to its header: top padding plus the tab pill row. */
  foldedCard: 52,
  heroTop: 8,
  heroMaxCover: 420,
  heroGutter: 24,
  /** Cover bottom to title top in the hero state. */
  heroTitleGap: 20,
  /** Title line plus artist line in the hero state. */
  heroTitleHeight: 56,
  /** Title block bottom to the folded card. */
  heroBelowTitle: 14,
} as const;

export function stageLayout(width: number, height: number, hasCard: boolean): StageLayout {
  const cardWidth = width - STAGE.cardX * 2;
  const sideCardTop = STAGE.sideTop + STAGE.sideCover + STAGE.sideGap;
  const side: StageState = {
    cover: { x: STAGE.sideX, y: STAGE.sideTop, width: STAGE.sideCover, height: STAGE.sideCover },
    card: {
      x: STAGE.cardX,
      y: sideCardTop,
      width: cardWidth,
      height: Math.max(0, height - sideCardTop),
    },
  };

  const folded = hasCard ? STAGE.foldedCard : 0;
  const around = STAGE.heroTop + STAGE.heroTitleGap + STAGE.heroTitleHeight + STAGE.heroBelowTitle;
  const room = height - folded - around;
  const size = Math.max(
    Math.min(STAGE.sideCover, room),
    Math.min(width - STAGE.heroGutter * 2, STAGE.heroMaxCover, room)
  );
  // Leftover height goes mostly below, so the cover sits a little high.
  const slack = Math.max(0, room - size);
  const hero: StageState = {
    cover: { x: (width - size) / 2, y: STAGE.heroTop + slack * 0.4, width: size, height: size },
    card: { x: STAGE.cardX, y: height - folded, width: cardWidth, height: folded },
  };

  return { side, hero };
}

/** Linear blend of two rects, `t` from 0 (`a`) to 1 (`b`). */
export function mixRect(a: Rect, b: Rect, t: number): Rect {
  'worklet';
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
  };
}

/**
 * Transforms that make a view laid out at `width` by `height` (top left at
 * 0, 0, with `transformOrigin: 'left top'`) cover `rect`. Moving a view with
 * transforms instead of its size and position skips layout on every frame,
 * and its contents are not redrawn at each new size.
 */
export function rectTransform(rect: Rect, width: number, height: number) {
  'worklet';
  return [
    { translateX: rect.x },
    { translateY: rect.y },
    { scaleX: width > 0 ? rect.width / width : 1 },
    { scaleY: height > 0 ? rect.height / height : 1 },
  ];
}

/** The player card's saved state; see `PlayerCardMode` in the settings. */
export type CardMode = 'auto' | 'open' | 'folded';

/**
 * Whether the card shows folded (big cover). Radio has no card. Until the
 * user picks, a song with lyrics opens on them and one without shows the
 * big cover.
 */
export function cardFolded(mode: CardMode, live: boolean, hasLyrics: boolean): boolean {
  if (live) return true;
  if (mode === 'auto') return !hasLyrics;
  return mode === 'folded';
}

/**
 * What a press on a card tab does: on a folded card it opens on that tab, on
 * the open tab it folds the card, on another tab it switches. `mode` is set
 * when the press changes the open or folded state, which is then saved.
 */
export function pressCardTab<T extends string>(
  folded: boolean,
  current: T,
  pressed: T
): { tab: T; mode?: Exclude<CardMode, 'auto'> } {
  if (folded) return { tab: pressed, mode: 'open' };
  if (pressed === current) return { tab: current, mode: 'folded' };
  return { tab: pressed };
}
