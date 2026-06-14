import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SmartMixResult } from '@shiranami/contracts';
import type { Track } from '@/stores/types';

import SmartMixesShelf from './SmartMixesShelf';

const setQueue = vi.fn();
let mixes: SmartMixResult[] | null = null;
const library: Track[] = [
  {
    id: 't1',
    title: 'Drift',
    artist: 'Idealism',
    album: 'Tapes',
    duration: 200,
    filePath: '/a.mp3',
  },
];

vi.mock('@/hooks/queries/useSmartMixes', () => ({
  useSmartMixes: () => ({ data: mixes }),
}));

vi.mock('@/hooks/useMergedLibrary', () => ({
  useMergedLibrary: () => library,
}));

vi.mock('@/stores/usePlaybackStore', () => ({
  usePlaybackStore: <T,>(selector: (s: { setQueue: typeof setQueue }) => T) =>
    selector({ setQueue }),
}));

function makeMix(overrides: Partial<SmartMixResult> = {}): SmartMixResult {
  return {
    id: 'focus',
    kind: 'focus',
    titleKey: 'smart.focus',
    descKey: 'smart.focusDesc',
    trackIds: ['t1'],
    ...overrides,
  };
}

describe('SmartMixesShelf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mixes = null;
  });
  afterEach(() => {
    mixes = null;
  });

  it('renders nothing when no mixes qualify', () => {
    mixes = [];
    const { container } = render(<SmartMixesShelf />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when generation failed (null)', () => {
    mixes = null;
    const { container } = render(<SmartMixesShelf />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a chip per mix and plays it on click', async () => {
    mixes = [makeMix({ id: 'focus', trackIds: ['t1'] })];
    render(<SmartMixesShelf />);

    expect(screen.getByText('For you right now')).toBeInTheDocument();
    const chip = screen.getByRole('button');
    await userEvent.click(chip);
    expect(setQueue).toHaveBeenCalledWith(library, 0);
  });
});
