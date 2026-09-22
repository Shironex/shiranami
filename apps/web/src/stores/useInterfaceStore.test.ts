import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_OVERVIEW_ORDER } from '@/lib/overview-sections';
import { useInterfaceStore, INTERFACE_DEFAULTS } from './useInterfaceStore';

const STORE_KEY = 'shiranami.interface-store';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

beforeEach(() => {
  localStorage.clear();
  useInterfaceStore.setState({ ...INTERFACE_DEFAULTS });
});

describe('useInterfaceStore', () => {
  it('ships every section in the default order', () => {
    expect(useInterfaceStore.getState().overviewOrder).toEqual(DEFAULT_OVERVIEW_ORDER);
  });

  it('moves a section when reordered and persists the new order', () => {
    useInterfaceStore.getState().reorderOverviewSection('mixes', 'recap');

    const order = useInterfaceStore.getState().overviewOrder;
    expect(order[0]).toBe('mixes');
    expect(new Set(order).size).toBe(DEFAULT_OVERVIEW_ORDER.length);
    expect(readPersisted().overviewOrder).toEqual(order);
  });

  it('ignores a reorder onto an unknown target', () => {
    const before = useInterfaceStore.getState().overviewOrder;
    useInterfaceStore.getState().reorderOverviewSection('mixes', 'mixes');
    expect(useInterfaceStore.getState().overviewOrder).toEqual(before);
  });

  it('restores the default order on reset', () => {
    useInterfaceStore.getState().reorderOverviewSection('recentlyAdded', 'recap');
    useInterfaceStore.getState().resetInterface();
    expect(useInterfaceStore.getState().overviewOrder).toEqual(DEFAULT_OVERVIEW_ORDER);
  });

  it('persists widget visibility alongside the order', () => {
    useInterfaceStore.getState().setVisible('overviewMixes', false);
    const persisted = readPersisted();
    expect(persisted.overviewMixes).toBe(false);
    expect(persisted.overviewOrder).toEqual(DEFAULT_OVERVIEW_ORDER);
  });
});
