import { beforeEach, describe, expect, it } from 'vitest';
import {
  useSanctuaryStore,
  SANCTUARY_AUTO_ENTER_DEFAULT_MINUTES,
  SANCTUARY_AUTO_ENTER_MIN_MINUTES,
  SANCTUARY_AUTO_ENTER_MAX_MINUTES,
} from './useSanctuaryStore';

const STORE_KEY = 'shiranami.sanctuary-store';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

beforeEach(() => {
  localStorage.clear();
  useSanctuaryStore.setState({
    sanctuaryVariant: 'cover',
    sanctuaryClockFace: 'minimal',
    sanctuaryClockFormat: 'system',
    sanctuaryClockSeconds: false,
    sanctuaryAutoEnter: false,
    sanctuaryAutoEnterMinutes: SANCTUARY_AUTO_ENTER_DEFAULT_MINUTES,
    sanctuaryActive: false,
    sanctuaryAutoEntered: false,
  });
});

describe('useSanctuaryStore', () => {
  it('enters and exits, tracking the auto-entered flag', () => {
    useSanctuaryStore.getState().enterSanctuary();
    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(true);
    expect(useSanctuaryStore.getState().sanctuaryAutoEntered).toBe(false);

    useSanctuaryStore.getState().exitSanctuary();
    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(false);

    useSanctuaryStore.getState().enterSanctuary({ auto: true });
    expect(useSanctuaryStore.getState().sanctuaryAutoEntered).toBe(true);
  });

  it('entering twice is a no-op that keeps the first entry mode', () => {
    useSanctuaryStore.getState().enterSanctuary();
    useSanctuaryStore.getState().enterSanctuary({ auto: true });
    expect(useSanctuaryStore.getState().sanctuaryAutoEntered).toBe(false);
  });

  it('toggle flips activity', () => {
    useSanctuaryStore.getState().toggleSanctuary();
    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(true);
    useSanctuaryStore.getState().toggleSanctuary();
    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(false);
  });

  it('never persists the runtime activity flags', () => {
    useSanctuaryStore.getState().enterSanctuary({ auto: true });
    useSanctuaryStore.getState().setSanctuaryAutoEnter(true);

    const persisted = readPersisted();
    expect(persisted.sanctuaryAutoEnter).toBe(true);
    expect(persisted.sanctuaryActive).toBeUndefined();
    expect(persisted.sanctuaryAutoEntered).toBeUndefined();
  });

  it('clamps the auto-enter minutes into range and rounds them', () => {
    const s = useSanctuaryStore.getState();
    s.setSanctuaryAutoEnterMinutes(0);
    expect(useSanctuaryStore.getState().sanctuaryAutoEnterMinutes).toBe(
      SANCTUARY_AUTO_ENTER_MIN_MINUTES
    );
    s.setSanctuaryAutoEnterMinutes(999);
    expect(useSanctuaryStore.getState().sanctuaryAutoEnterMinutes).toBe(
      SANCTUARY_AUTO_ENTER_MAX_MINUTES
    );
    s.setSanctuaryAutoEnterMinutes(7.4);
    expect(useSanctuaryStore.getState().sanctuaryAutoEnterMinutes).toBe(7);
    s.setSanctuaryAutoEnterMinutes(Number.NaN);
    expect(useSanctuaryStore.getState().sanctuaryAutoEnterMinutes).toBe(
      SANCTUARY_AUTO_ENTER_DEFAULT_MINUTES
    );
  });

  it('accepts and persists the vinyl variant', () => {
    useSanctuaryStore.getState().setSanctuaryVariant('vinyl');
    expect(useSanctuaryStore.getState().sanctuaryVariant).toBe('vinyl');
    expect(readPersisted().sanctuaryVariant).toBe('vinyl');
  });

  it('coerces a malformed variant back to the default', () => {
    useSanctuaryStore.getState().setSanctuaryVariant('spiral' as never);
    expect(useSanctuaryStore.getState().sanctuaryVariant).toBe('cover');
  });

  it('persists the clock face, hour format and seconds preferences', () => {
    const s = useSanctuaryStore.getState();
    s.setSanctuaryClockFace('serif');
    s.setSanctuaryClockFormat('24h');
    s.setSanctuaryClockSeconds(true);

    const persisted = readPersisted();
    expect(persisted.sanctuaryClockFace).toBe('serif');
    expect(persisted.sanctuaryClockFormat).toBe('24h');
    expect(persisted.sanctuaryClockSeconds).toBe(true);
  });

  it('coerces malformed clock preferences back to their defaults', () => {
    const s = useSanctuaryStore.getState();
    s.setSanctuaryClockFace('gothic' as never);
    s.setSanctuaryClockFormat('26h' as never);
    expect(useSanctuaryStore.getState().sanctuaryClockFace).toBe('minimal');
    expect(useSanctuaryStore.getState().sanctuaryClockFormat).toBe('system');
  });
});
