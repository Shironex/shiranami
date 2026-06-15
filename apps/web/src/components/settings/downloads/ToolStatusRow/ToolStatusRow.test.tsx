import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ToolStatusRow from './ToolStatusRow';

describe('ToolStatusRow', () => {
  it('shows the installed title and an up-to-date status when installed', () => {
    render(
      <ToolStatusRow
        installed
        installedTitle="yt-dlp installed"
        notInstalledTitle="yt-dlp not installed"
        updateAvailable={false}
      />
    );

    expect(screen.getByText('yt-dlp installed')).toBeInTheDocument();
  });

  it('shows the not-installed title and trailing content when missing', () => {
    render(
      <ToolStatusRow
        installed={false}
        installedTitle="ffmpeg installed"
        notInstalledTitle="ffmpeg not installed"
        updateAvailable={false}
        notInstalledRight="Recommended"
      />
    );

    expect(screen.getByText('ffmpeg not installed')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });
});
