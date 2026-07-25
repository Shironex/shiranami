import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DownloadsSectionSkeleton from './DownloadsSectionSkeleton';

// Status row (3) + binary path (2) + version pair (4) + hint (1).
const BARS_PER_TOOL_CARD = 10;
// Label/badge (2) + path (1) + hint (1) + the two buttons (2).
const BARS_IN_LOCATION_PANEL = 6;
// yt-dlp and ffmpeg.
const TOOL_CARDS = 2;

describe('DownloadsSectionSkeleton', () => {
  it('renders a placeholder card for each download tool plus the location panel', () => {
    const { container } = render(<DownloadsSectionSkeleton />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      TOOL_CARDS * BARS_PER_TOOL_CARD + BARS_IN_LOCATION_PANEL
    );
  });

  it('separates the ffmpeg card from the location panel with the section divider', () => {
    const { container } = render(<DownloadsSectionSkeleton />);

    expect(container.querySelectorAll('.border-t')).toHaveLength(1);
  });

  it('renders the location panel button placeholders at their real height', () => {
    const { container } = render(<DownloadsSectionSkeleton />);

    expect(container.querySelectorAll('.h-8')).toHaveLength(2);
  });

  it('pulses every placeholder so the card reads as loading', () => {
    const { container } = render(<DownloadsSectionSkeleton />);

    for (const placeholder of container.querySelectorAll('[data-slot="skeleton"]')) {
      expect(placeholder.className).toContain('animate-pulse');
    }
  });

  it('exposes no text or controls while the tool status is being checked', () => {
    const { container } = render(<DownloadsSectionSkeleton />);

    expect(container.textContent).toBe('');
    expect(container.querySelector('button')).toBeNull();
  });
});
