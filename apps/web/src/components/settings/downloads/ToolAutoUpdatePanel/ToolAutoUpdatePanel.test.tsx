import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ToolAutoUpdatePanel from './ToolAutoUpdatePanel';

const record = {
  ytdlp: {
    lastCheckedAt: Date.UTC(2026, 8, 28, 12, 0),
    lastUpdatedAt: Date.UTC(2026, 8, 28, 12, 0),
    lastUpdatedVersion: '2026.09.20',
    consecutiveFailures: 0,
  },
  ffmpeg: { consecutiveFailures: 0 },
};

describe('ToolAutoUpdatePanel', () => {
  it('is off by default and turns on through the switch', async () => {
    const user = userEvent.setup();
    const onEnabledChange = vi.fn();
    render(
      <ToolAutoUpdatePanel
        enabled={false}
        disabled={false}
        onEnabledChange={onEnabledChange}
        record={record}
        ffmpegIncluded
      />
    );

    const toggle = screen.getByRole('switch', { name: /up to date automatically/i });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText(/Updated automatically to/)).not.toBeInTheDocument();

    await user.click(toggle);
    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it('shows what was installed and when each tool was last checked', () => {
    render(
      <ToolAutoUpdatePanel
        enabled
        disabled={false}
        onEnabledChange={() => {}}
        record={record}
        ffmpegIncluded
      />
    );

    expect(screen.getByRole('switch', { name: /up to date automatically/i })).toBeChecked();
    expect(screen.getByText(/Updated automatically to 2026\.09\.20/)).toBeInTheDocument();
    expect(screen.getAllByText(/Last checked/)).toHaveLength(1);
    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
  });

  it('keeps the switch disabled until the backend answers', () => {
    render(
      <ToolAutoUpdatePanel
        enabled={false}
        disabled
        onEnabledChange={() => {}}
        record={null}
        ffmpegIncluded
      />
    );

    expect(screen.getByRole('switch', { name: /up to date automatically/i })).toBeDisabled();
  });

  it('leaves ffmpeg out where it is not updated automatically (macOS)', () => {
    render(
      <ToolAutoUpdatePanel
        enabled
        disabled={false}
        onEnabledChange={() => {}}
        record={record}
        ffmpegIncluded={false}
      />
    );

    expect(screen.getByText('yt-dlp')).toBeInTheDocument();
    expect(screen.queryByText('ffmpeg')).not.toBeInTheDocument();
    expect(screen.queryByText('Not checked yet')).not.toBeInTheDocument();
  });
});
