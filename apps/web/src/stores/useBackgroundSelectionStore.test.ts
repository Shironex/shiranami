import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOM_LIGHT_STOP_SETTINGS } from './useUIStore';
import {
  BACKGROUND_SCHEDULE_SLOTS,
  useBackgroundSelectionStore,
} from './useBackgroundSelectionStore';

const STORE_KEY = 'shiranami.background-selection';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

beforeEach(() => {
  localStorage.clear();
  useBackgroundSelectionStore.setState({
    mode: 'single',
    rotationInterval: 'daily',
    schedule: {},
  });
});

describe('useBackgroundSelectionStore', () => {
  it('exposes the room-light stops (minus auto) as its schedule slots', () => {
    expect(BACKGROUND_SCHEDULE_SLOTS).toEqual(ROOM_LIGHT_STOP_SETTINGS.filter(s => s !== 'auto'));
  });

  it('persists mode, interval and schedule — but never the launch nonce', () => {
    const store = useBackgroundSelectionStore.getState();
    store.setMode('rotation');
    store.setRotationInterval('hourly');
    store.setScheduleSlot('night', '3');

    const persisted = readPersisted();
    expect(persisted.mode).toBe('rotation');
    expect(persisted.rotationInterval).toBe('hourly');
    expect(persisted.schedule).toEqual({ night: '3' });
    // A fresh draw per launch is the feature; persisting it would defeat it.
    expect(persisted.launchNonce).toBeUndefined();
  });

  it('clears a schedule slot back to the active pick with null', () => {
    const store = useBackgroundSelectionStore.getState();
    store.setScheduleSlot('dawn', '2');
    store.setScheduleSlot('dawn', null);

    expect(useBackgroundSelectionStore.getState().schedule).toEqual({});
  });

  it('prunes schedule references to deleted entries and keeps live ones', () => {
    const store = useBackgroundSelectionStore.getState();
    store.setScheduleSlot('dawn', '1');
    store.setScheduleSlot('night', '2');

    useBackgroundSelectionStore.getState().pruneScheduleTo(['2']);

    expect(useBackgroundSelectionStore.getState().schedule).toEqual({ night: '2' });
  });

  it('coerces persisted garbage back to safe defaults', async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: {
          mode: 'chaos',
          rotationInterval: 'weekly',
          schedule: { night: 42, midnight: '3', day: '2' },
        },
        version: 1,
      })
    );
    vi.resetModules();
    const { useBackgroundSelectionStore: fresh } = await import('./useBackgroundSelectionStore');

    expect(fresh.getState().mode).toBe('single');
    expect(fresh.getState().rotationInterval).toBe('daily');
    // Unknown slots and non-string ids are dropped; the valid pair survives.
    expect(fresh.getState().schedule).toEqual({ day: '2' });
  });
});
