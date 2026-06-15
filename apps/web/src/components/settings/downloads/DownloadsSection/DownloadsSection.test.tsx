import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DownloadsSection from './DownloadsSection';

type DownloadsSettings = ReturnType<
  typeof import('@/components/settings/downloads/useDownloadsSettings').useDownloadsSettings
>;

const settings = vi.hoisted(() => ({ value: {} as DownloadsSettings }));

vi.mock('@/components/settings/downloads/useDownloadsSettings', () => ({
  useDownloadsSettings: () => settings.value,
}));

function makeSettings(overrides: Partial<DownloadsSettings> = {}): DownloadsSettings {
  return {
    isCheckingDownloadTools: false,
    isRefreshing: false,
    hasMissingDownloadTools: false,
    dependenciesInstalling: false,
    dependencyInstallProgress: 0,
    dependencyInstallLabel: '',
    handleInstallMissingTools: vi.fn(),
    handleRefresh: vi.fn(),
    ytdlpInstalled: true,
    ytdlpVersion: '2024.03.10',
    ytdlpLatestVersion: undefined,
    ytdlpUpdateAvailable: false,
    ytdlpPath: '/usr/local/bin/yt-dlp',
    ytdlpInstalling: false,
    ytdlpInstallProgress: 0,
    handleInstallYtDlp: vi.fn(),
    ffmpegInstalled: true,
    ffmpegVersion: '6.1',
    ffmpegLatestVersion: undefined,
    ffmpegUpdateAvailable: false,
    ffmpegInstalling: false,
    ffmpegInstallProgress: 0,
    handleInstallFfmpeg: vi.fn(),
    downloadLocation: '/Users/me/Music/Downloads',
    downloadLocationDefaultPath: '/Users/me/Music/Downloads',
    downloadLocationIsDefault: true,
    downloadLocationUpdating: false,
    handleChangeDownloadLocation: vi.fn(),
    handleResetDownloadLocation: vi.fn(),
    ...overrides,
  } as DownloadsSettings;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('DownloadsSection', () => {
  it('renders the binary path and version once tools are checked', () => {
    settings.value = makeSettings();
    render(<DownloadsSection />);

    expect(screen.getByText('/usr/local/bin/yt-dlp')).toBeInTheDocument();
    expect(screen.getByText('v2024.03.10')).toBeInTheDocument();
  });

  it('shows the skeleton while still checking', () => {
    settings.value = makeSettings({ isCheckingDownloadTools: true });
    const { container } = render(<DownloadsSection />);

    expect(screen.queryByText('/usr/local/bin/yt-dlp')).not.toBeInTheDocument();
    expect(container.firstChild).toBeTruthy();
  });
});
