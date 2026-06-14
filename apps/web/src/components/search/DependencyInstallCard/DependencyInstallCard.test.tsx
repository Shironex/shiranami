import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Ensure i18n is initialised before the component import.
import '@/lib/i18n';

import DependencyInstallCard from './DependencyInstallCard';
import type { DependencyInstallStatus } from './DependencyInstallCard.types';

function renderCard(
  props: Partial<{
    ffmpegInstalled: boolean | undefined;
    installStatus: DependencyInstallStatus;
    installError: string | null;
    isInstallInProgress: boolean;
    installProgress: number;
    installLabel: string;
    onInstall: () => void;
  }> = {}
) {
  const defaults = {
    ffmpegInstalled: false as boolean | undefined,
    installStatus: 'idle' as DependencyInstallStatus,
    installError: null as string | null,
    isInstallInProgress: false,
    installProgress: 0,
    installLabel: '',
    onInstall: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  return { ...render(<DependencyInstallCard {...merged} />), props: merged };
}

describe('DependencyInstallCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows install button when status is idle', () => {
    renderCard();
    expect(screen.getByText('Install Missing Tools')).toBeInTheDocument();
  });

  it('shows description mentioning both tools when ffmpeg is not installed', () => {
    renderCard({ ffmpegInstalled: false });
    expect(screen.getByText(/yt-dlp and ffmpeg/)).toBeInTheDocument();
  });

  it('shows description for yt-dlp only when ffmpeg is already installed', () => {
    renderCard({ ffmpegInstalled: undefined });
    expect(screen.getByText(/Install yt-dlp so Shiranami/)).toBeInTheDocument();
  });

  it('triggers onInstall when install button is clicked', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    renderCard({ onInstall });
    await user.click(screen.getByText('Install Missing Tools'));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it('shows progress bar when installing', () => {
    renderCard({
      installStatus: 'downloading',
      isInstallInProgress: true,
      installProgress: 55,
      installLabel: 'Downloading yt-dlp',
    });
    expect(screen.queryByText('Install Missing Tools')).not.toBeInTheDocument();
    expect(screen.getByText(/Downloading yt-dlp.*55%/)).toBeInTheDocument();
  });

  it('shows progress bar when isInstallInProgress even if status is idle', () => {
    renderCard({
      installStatus: 'idle',
      isInstallInProgress: true,
      installProgress: 30,
      installLabel: 'Preparing',
    });
    expect(screen.getByText(/Preparing.*30%/)).toBeInTheDocument();
  });

  it('shows success state when install is done', () => {
    renderCard({ installStatus: 'done' });
    expect(screen.getByText('Search tools installed')).toBeInTheDocument();
    expect(screen.queryByText('Install Missing Tools')).not.toBeInTheDocument();
  });

  it('shows error message when install fails', () => {
    renderCard({
      installStatus: 'error',
      installError: 'Network timeout',
    });
    expect(screen.getByText('Install Missing Tools')).toBeInTheDocument();
    expect(screen.getByText('Network timeout')).toBeInTheDocument();
  });
});
