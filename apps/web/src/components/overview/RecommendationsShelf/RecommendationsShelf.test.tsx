import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoverShelf, LibraryRecommendation, LibraryShelf } from '@shiranami/contracts';

import RecommendationsShelf from './RecommendationsShelf';

const onPlay = vi.fn();
const refresh = vi.fn();

type Recs = {
  library: LibraryShelf;
  discover: DiscoverShelf;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: typeof refresh;
  hasAny: boolean;
};

let recs: Recs;

function makeRecs(overrides: Partial<Recs> = {}): Recs {
  const library: LibraryShelf = {
    kind: 'library',
    items: [],
    generatedAt: null,
    stale: false,
  };
  const discover: DiscoverShelf = {
    kind: 'discover',
    items: [],
    generatedAt: null,
    stale: false,
  };
  const base: Recs = {
    library,
    discover,
    isLoading: false,
    isRefreshing: false,
    refresh,
    hasAny: false,
  };
  return { ...base, ...overrides };
}

vi.mock('@/hooks/queries/useRecommendations', () => ({
  useRecommendations: () => recs,
}));

vi.mock('@/hooks/useDiscoverDownload', () => ({
  useDiscoverDownload: () => ({ download: vi.fn(), statuses: {} }),
}));

vi.mock('@/hooks/useAudioPreview', () => ({
  useAudioPreview: () => ({
    previewLoadingId: null,
    isPreviewPlaying: () => false,
    handlePreview: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSearchDependencies', () => ({
  useSearchDependencies: () => ({
    dependencyState: 'ready',
    dependenciesSnapshot: { ytdlpInstalled: true, ffmpegInstalled: true },
    dependencyInstallStatus: 'idle',
    dependencyInstallError: null,
    isDependencyInstallInProgress: false,
    dependencyInstallProgress: 0,
    dependencyInstallLabel: '',
    handleInstallDependencies: vi.fn(),
  }),
}));

function libItem(overrides: Partial<LibraryRecommendation> = {}): LibraryRecommendation {
  return {
    trackId: 'lt1',
    title: 'Drift',
    artist: 'Idealism',
    album: 'Tapes',
    albumArt: null,
    ...overrides,
  };
}

describe('RecommendationsShelf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recs = makeRecs();
  });
  afterEach(() => {
    recs = makeRecs();
  });

  it('hides entirely on first run (no library)', () => {
    const { container } = render(<RecommendationsShelf onPlay={onPlay} hasLibrary={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('hides while the recommendations query is still loading', () => {
    recs = makeRecs({ isLoading: true });
    const { container } = render(<RecommendationsShelf onPlay={onPlay} hasLibrary />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the quiet both-empty state when the library exists but has no picks', () => {
    render(<RecommendationsShelf onPlay={onPlay} hasLibrary />);

    expect(screen.getByText('Recommended for you')).toBeInTheDocument();
    expect(screen.getByText('No picks just yet')).toBeInTheDocument();
  });

  it('renders library rows and plays a track on click', async () => {
    recs = makeRecs({
      hasAny: true,
      library: {
        kind: 'library',
        items: [libItem({ trackId: 'lt1', title: 'Drift' })],
        generatedAt: null,
        stale: false,
      },
    });
    render(<RecommendationsShelf onPlay={onPlay} hasLibrary />);

    expect(screen.getByText('From your library')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Play Drift' }));
    expect(onPlay).toHaveBeenCalledWith('lt1');
  });
});
