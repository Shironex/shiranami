import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DownloadsSection from './DownloadsSection';

type DownloadsSettings = ReturnType<
  typeof import('@/components/settings/downloads/useDownloadsSettings').useDownloadsSettings
>;

const settings = vi.hoisted(() => ({ value: {} as DownloadsSettings }));

vi.mock('@/components/settings/downloads/useDownloadsSettings', () => ({
  useDownloadsSettings: () => settings.value,
}));

const autoUpdate = vi.hoisted(() => ({ setEnabled: vi.fn(), ytdlpInstalling: false }));

vi.mock('@/components/settings/downloads/useToolAutoUpdate', () => ({
  useToolAutoUpdate: () => ({
    enabled: false,
    disabled: false,
    record: null,
    ffmpegIncluded: true,
    ytdlpInstalling: autoUpdate.ytdlpInstalling,
    ffmpegInstalling: false,
    setEnabled: autoUpdate.setEnabled,
  }),
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

  it('offers the automatic-update opt-in beside the tool rows', async () => {
    const user = userEvent.setup();
    settings.value = makeSettings();
    render(<DownloadsSection />);

    const toggle = screen.getByRole('switch', { name: /up to date automatically/i });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(autoUpdate.setEnabled).toHaveBeenCalledWith(true);
  });

  it('makes way for a note while another install of yt-dlp runs', () => {
    autoUpdate.ytdlpInstalling = true;
    settings.value = makeSettings({
      ytdlpLatestVersion: '2026.09.20',
      ytdlpUpdateAvailable: true,
    });
    render(<DownloadsSection />);

    expect(screen.queryByRole('button', { name: /Update yt-dlp/ })).not.toBeInTheDocument();
    expect(screen.getByText(/An update is in progress/)).toBeInTheDocument();
    autoUpdate.ytdlpInstalling = false;
  });
});
