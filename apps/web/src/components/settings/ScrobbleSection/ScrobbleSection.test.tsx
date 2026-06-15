import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScrobbleStatus } from '@shiranami/contracts';

import ScrobbleSection from './ScrobbleSection';

const DISCONNECTED: ScrobbleStatus = {
  enabled: false,
  lastfmConnected: false,
  lastfmUsername: null,
  listenBrainzConnected: false,
  pendingCount: 0,
};

function reset(): void {
  vi.mocked(window.electronAPI.scrobble.getStatus).mockResolvedValue(DISCONNECTED);
  vi.mocked(window.electronAPI.scrobble.lastfmBeginAuth).mockResolvedValue({
    ok: true,
    token: 'tok',
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(() => vi.clearAllMocks());

describe('ScrobbleSection', () => {
  it('renders the scrobbling card and both providers', async () => {
    render(<ScrobbleSection />);

    expect(await screen.findByRole('heading', { name: 'Scrobbling' })).toBeInTheDocument();
    expect(screen.getByText('Last.fm')).toBeInTheDocument();
    expect(screen.getByText('ListenBrainz')).toBeInTheDocument();
  });

  it('begins the Last.fm auth handshake when connect is pressed', async () => {
    const user = userEvent.setup();
    render(<ScrobbleSection />);
    await screen.findByRole('heading', { name: 'Scrobbling' });

    const lastfmConnect = screen.getAllByRole('button', { name: 'Connect' })[0];
    await user.click(lastfmConnect);

    expect(window.electronAPI.scrobble.lastfmBeginAuth).toHaveBeenCalledOnce();
  });
});
