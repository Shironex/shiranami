import {
  STAGE,
  cardFolded,
  mixRect,
  pressCardTab,
  rectTransform,
  stageLayout,
  tabForSong,
} from '@/lib/player-stage';

// The middle of a Galaxy S25 Ultra player (412 x 892 dp screen).
const W = 412;
const H = 520;

describe('player stage', () => {
  it('puts the small cover top left and gives the card the rest', () => {
    const { side } = stageLayout(W, H, true);
    expect(side.cover).toEqual({ x: 24, y: 18, width: 132, height: 132 });
    expect(side.card.y).toBe(18 + 132 + 18);
    expect(side.card.y + side.card.height).toBe(H);
    expect(side.card.width).toBe(W - 32);
  });

  it('grows a centered square cover that leaves room for the title and the pill', () => {
    const { hero } = stageLayout(W, H, true);
    const { cover, card } = hero;
    expect(cover.width).toBe(cover.height);
    expect(cover.x + cover.width / 2).toBeCloseTo(W / 2);
    expect(cover.width).toBeGreaterThan(STAGE.sideCover);
    const titleBottom = cover.y + cover.height + STAGE.heroTitleGap + STAGE.heroTitleHeight;
    expect(titleBottom + STAGE.heroBelowTitle).toBeLessThanOrEqual(card.y + 0.001);
    expect(card.height).toBe(STAGE.foldedCard);
    expect(card.y + card.height).toBe(H);
  });

  it('caps the cover by the width and by the largest size', () => {
    expect(stageLayout(360, 900, true).hero.cover.width).toBe(360 - 48);
    expect(stageLayout(900, 1400, true).hero.cover.width).toBe(STAGE.heroMaxCover);
  });

  it('uses the whole height when there is no card (radio)', () => {
    const withCard = stageLayout(W, 420, true).hero;
    const radio = stageLayout(W, 420, false).hero;
    expect(radio.card.height).toBe(0);
    expect(radio.cover.width).toBeGreaterThan(withCard.cover.width);
  });

  it('never shrinks the hero cover below the side cover unless the room is gone', () => {
    expect(stageLayout(W, 282, true).hero.cover.width).toBe(STAGE.sideCover);
    expect(stageLayout(W, 200, true).hero.cover.width).toBeLessThan(STAGE.sideCover);
  });

  it('blends rects', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 10, y: 20, width: 30, height: 30 };
    expect(mixRect(a, b, 0.5)).toEqual({ x: 5, y: 10, width: 20, height: 20 });
    expect(mixRect(a, b, 0)).toEqual(a);
  });
});

describe('rect transform', () => {
  it('scales and moves a full size view onto the rect', () => {
    expect(rectTransform({ x: 16, y: 700, width: 360, height: 64 }, 400, 800)).toEqual([
      { translateX: 16 },
      { translateY: 700 },
      { scaleX: 0.9 },
      { scaleY: 0.08 },
    ]);
  });

  it('is the identity for the full rect', () => {
    expect(rectTransform({ x: 0, y: 0, width: 400, height: 800 }, 400, 800)).toEqual([
      { translateX: 0 },
      { translateY: 0 },
      { scaleX: 1 },
      { scaleY: 1 },
    ]);
  });

  it('does not divide by a zero size before layout', () => {
    expect(rectTransform({ x: 0, y: 0, width: 10, height: 10 }, 0, 0)[2]).toEqual({ scaleX: 1 });
  });
});

describe('card fold', () => {
  it('opens on lyrics and folds without them until the user picks', () => {
    expect(cardFolded('auto', false, true)).toBe(false);
    expect(cardFolded('auto', false, false)).toBe(true);
  });

  it('keeps the picked state whatever the song has', () => {
    expect(cardFolded('folded', false, true)).toBe(true);
    expect(cardFolded('open', false, false)).toBe(false);
  });

  it('always shows radio with the big cover', () => {
    expect(cardFolded('open', true, true)).toBe(true);
  });

  it('folds on the open tab, switches on another, opens a folded card on any tab', () => {
    expect(pressCardTab(false, 'lyrics', 'lyrics')).toEqual({ tab: 'lyrics', mode: 'folded' });
    expect(pressCardTab(false, 'lyrics', 'upNext')).toEqual({ tab: 'upNext' });
    expect(pressCardTab(true, 'lyrics', 'similar')).toEqual({ tab: 'similar', mode: 'open' });
    expect(pressCardTab(true, 'lyrics', 'lyrics')).toEqual({ tab: 'lyrics', mode: 'open' });
  });
});

describe('tab for a new song', () => {
  it('waits while the lyrics load', () => {
    expect(tabForSong('upNext', false, false, 'loading')).toBeNull();
    expect(tabForSong('lyrics', true, false, 'loading')).toBeNull();
  });

  it('opens a song with lyrics on Lyrics until the user picks a tab', () => {
    expect(tabForSong('upNext', false, false, 'some')).toBe('lyrics');
    expect(tabForSong('lyrics', false, false, 'some')).toBeNull();
  });

  it('keeps a picked tab on a new song with lyrics', () => {
    expect(tabForSong('upNext', true, false, 'some')).toBeNull();
    expect(tabForSong('similar', true, false, 'some')).toBeNull();
  });

  it('leaves Lyrics for Up next when the new song has none', () => {
    expect(tabForSong('lyrics', true, false, 'none')).toBe('upNext');
    expect(tabForSong('lyrics', false, false, 'none')).toBe('upNext');
    expect(tabForSong('similar', true, false, 'none')).toBeNull();
  });

  it('leaves the tab alone for radio, which has no card', () => {
    expect(tabForSong('lyrics', true, true, 'none')).toBeNull();
  });
});
