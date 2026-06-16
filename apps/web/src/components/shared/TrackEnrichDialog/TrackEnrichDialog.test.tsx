import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrackEnrichDialog from './TrackEnrichDialog';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';

const { stableTranslation } = vi.hoisted(() => {
  const stableT = (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key;
  return { stableTranslation: { t: stableT } };
});
vi.mock('react-i18next', () => ({
  useTranslation: () => stableTranslation,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

const TRACK = {
  id: 'id-1',
  title: 'Song',
  artist: 'Unknown Artist',
  album: 'Unknown Album',
  duration: 100,
  filePath: '/a.mp3',
};

describe('TrackEnrichDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({ library: [TRACK] });
    useMetadataEnrichStore.setState({
      isEnriching: false,
      isSingleTrackEnriching: false,
      progress: null,
      skippedIds: new Set(),
      skippedLoaded: true,
    });
  });

  it('renders the searching state then the found state with diff rows', async () => {
    vi.mocked(window.electronAPI.metadata.previewEnrich).mockResolvedValueOnce({
      id: 'id-1',
      success: true,
      updatedFields: { artist: 'Real Artist', album: 'Real Album' },
      source: 'itunes',
    });

    render(<TrackEnrichDialog open={true} onOpenChange={() => {}} trackId="id-1" />);

    // searching state shows the searching key
    expect(screen.getByText('searching')).toBeInTheDocument();

    // resolves to the found state
    await waitFor(() => expect(screen.getByText('field.artist')).toBeInTheDocument());
    expect(screen.getByText('field.album')).toBeInTheDocument();
    // proposed values are rendered
    expect(screen.getByText('Real Artist')).toBeInTheDocument();
    expect(screen.getByText('Real Album')).toBeInTheDocument();
    // apply button visible
    expect(screen.getByText('apply')).toBeInTheDocument();
  });

  it('renders the no-match state when source is "none"', async () => {
    vi.mocked(window.electronAPI.metadata.previewEnrich).mockResolvedValueOnce({
      id: 'id-1',
      success: false,
      updatedFields: {},
      source: 'none',
    });

    render(<TrackEnrichDialog open={true} onOpenChange={() => {}} trackId="id-1" />);

    await waitFor(() => expect(screen.getByText('noMatchTitle')).toBeInTheDocument());
    expect(screen.getByText('retry')).toBeInTheDocument();
  });

  it('renders the busy-error state when preview rejects with metadata.enrich_busy', async () => {
    const busyErr = Object.assign(new Error('busy'), { code: 'metadata.enrich_busy' });
    vi.mocked(window.electronAPI.metadata.previewEnrich).mockRejectedValueOnce(busyErr);

    render(<TrackEnrichDialog open={true} onOpenChange={() => {}} trackId="id-1" />);

    await waitFor(() => expect(screen.getByText('errorBusy')).toBeInTheDocument());
  });

  it('renders the generic error state for other failures', async () => {
    vi.mocked(window.electronAPI.metadata.previewEnrich).mockRejectedValueOnce(
      new Error('Network exploded')
    );

    render(<TrackEnrichDialog open={true} onOpenChange={() => {}} trackId="id-1" />);

    await waitFor(() => expect(screen.getByText('errorGeneric')).toBeInTheDocument());
  });

  it('calls applySingleTrack with writeToFile:false by default and shows applied state', async () => {
    vi.mocked(window.electronAPI.metadata.previewEnrich).mockResolvedValueOnce({
      id: 'id-1',
      success: true,
      updatedFields: { artist: 'Real Artist' },
      source: 'itunes',
    });
    vi.mocked(window.electronAPI.db.tracks.getAll).mockResolvedValueOnce([
      { ...TRACK, artist: 'Real Artist' },
    ] as never);

    render(<TrackEnrichDialog open={true} onOpenChange={() => {}} trackId="id-1" />);

    await waitFor(() => expect(screen.getByText('apply')).toBeInTheDocument());
    await userEvent.click(screen.getByText('apply'));

    await waitFor(() => expect(screen.getByText('appliedTitle')).toBeInTheDocument());
    // writeToFile defaults OFF — enrichTracks should NOT have been called
    expect(window.electronAPI.metadata.enrichTracks).not.toHaveBeenCalled();
    expect(window.electronAPI.db.tracks.updateMany).toHaveBeenCalledWith([
      { id: 'id-1', data: { artist: 'Real Artist' } },
    ]);
  });
});
