import { measureMiniPlayer, registerMiniPlayer } from '@/lib/player-origin';

const spot = {
  art: { x: 20, y: 700, width: 44, height: 44 },
  row: { x: 10, y: 690, width: 390, height: 64 },
};

describe('mini player spot', () => {
  it('is null with no mini player on screen', async () => {
    await expect(measureMiniPlayer()).resolves.toBeNull();
  });

  it('measures the registered mini player and forgets it once gone', async () => {
    const unregister = registerMiniPlayer(async () => spot);
    await expect(measureMiniPlayer()).resolves.toEqual(spot);
    unregister();
    await expect(measureMiniPlayer()).resolves.toBeNull();
  });

  it('gives up on a slow or failed measurement and ignores an unlaid row', async () => {
    jest.useFakeTimers();
    const unregister = registerMiniPlayer(() => new Promise(() => {}));
    const pending = measureMiniPlayer(50);
    jest.advanceTimersByTime(50);
    await expect(pending).resolves.toBeNull();
    jest.useRealTimers();
    unregister();

    const failing = registerMiniPlayer(() => Promise.reject(new Error('gone')));
    await expect(measureMiniPlayer()).resolves.toBeNull();
    failing();

    const empty = registerMiniPlayer(async () => ({ ...spot, art: { ...spot.art, width: 0 } }));
    await expect(measureMiniPlayer()).resolves.toBeNull();
    empty();
  });

  it('keeps a newer registration when an older one unregisters', async () => {
    const first = registerMiniPlayer(async () => null);
    const second = registerMiniPlayer(async () => spot);
    first();
    await expect(measureMiniPlayer()).resolves.toEqual(spot);
    second();
  });
});
