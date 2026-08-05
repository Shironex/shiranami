import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCompanionApi,
  normalizeCompanionState,
  normalizeCompanionXpEvent,
} from './companionBackend';

type WindowWithBridge = { electronAPI?: { companion?: unknown } };

function setCompanionSurface(surface: unknown): void {
  (window as WindowWithBridge).electronAPI = {
    ...(window as WindowWithBridge).electronAPI,
    companion: surface,
  } as WindowWithBridge['electronAPI'];
}

const fullSurface = () => ({
  getState: vi.fn().mockResolvedValue({ name: 'Shio', stage: 2, xp: 7200, species: 'shio' }),
  setName: vi.fn().mockResolvedValue(undefined),
  setSpecies: vi.fn().mockResolvedValue(undefined),
  onXp: vi.fn().mockReturnValue(() => {}),
});

describe('getCompanionApi', () => {
  afterEach(() => {
    setCompanionSurface(undefined);
  });

  it('returns null when the ledger namespace is absent (the fallback path)', () => {
    // The shared test setup installs the v1-shaped electronAPI, which has no
    // `companion` member — exactly the environment the fallback exists for.
    expect(getCompanionApi()).toBeNull();
  });

  it('returns null when the surface is present but incomplete', () => {
    setCompanionSurface({ getState: vi.fn() });
    expect(getCompanionApi()).toBeNull();
  });

  it('binds and normalizes a complete surface', async () => {
    const surface = fullSurface();
    setCompanionSurface(surface);
    const api = getCompanionApi();
    expect(api).not.toBeNull();

    const state = await api!.getState();
    expect(state).toEqual({ name: 'Shio', stage: 2, xp: 7200, species: 'shio' });

    const received: unknown[] = [];
    api!.onXp(e => received.push(e));
    const rawCallback = surface.onXp.mock.calls[0][0] as (raw: unknown) => void;
    rawCallback({ xpGained: 30, totalXp: 90030, level: 3, leveledUp: true });
    expect(received).toEqual([{ totalXp: 90030, stage: 3, leveledUp: true }]);
  });
});

describe('normalizers', () => {
  it('degrades unknown state shapes to the hatchling default', () => {
    expect(normalizeCompanionState(undefined)).toEqual({
      name: null,
      stage: 0,
      xp: 0,
      species: null,
    });
    expect(normalizeCompanionState({ name: '', stage: 'x' })).toEqual({
      name: null,
      stage: 0,
      xp: 0,
      species: null,
    });
  });

  it('accepts both the stage and level spellings on xp events', () => {
    expect(normalizeCompanionXpEvent({ stage: 2, totalXp: 10, leveledUp: false })).toEqual({
      totalXp: 10,
      stage: 2,
      leveledUp: false,
    });
    expect(normalizeCompanionXpEvent({ level: 4, leveledUp: true })).toEqual({
      totalXp: 0,
      stage: 4,
      leveledUp: true,
    });
  });
});
