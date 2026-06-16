import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';

import TrackEnrichDialogManager from './TrackEnrichDialogManager';

const TRACK = {
  id: 'track-1',
  title: 'Midnight Study Session',
  artist: 'Lofi Collective',
  album: 'Late Nights',
  duration: 184,
  filePath: '/music/midnight.mp3',
};

describe('TrackEnrichDialogManager', () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: [TRACK] });
    useMetadataEnrichStore.setState({
      isEnriching: false,
      isSingleTrackEnriching: false,
      progress: null,
      skippedIds: new Set(),
      skippedLoaded: true,
    });
  });

  it('renders no dialog at rest', () => {
    render(<TrackEnrichDialogManager />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the enrich dialog when an open-track-enrich-dialog event fires', () => {
    render(<TrackEnrichDialogManager />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(DIALOG_EVENTS.openTrackEnrich, { detail: { trackId: 'track-1' } })
      );
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Find Missing Metadata')).toBeInTheDocument();
  });
});
