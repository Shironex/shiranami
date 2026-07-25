import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useInterfaceStore, INTERFACE_DEFAULTS } from '@/stores/useInterfaceStore';

import OverviewLayoutPreview from './OverviewLayoutPreview';

/** Every collapsible widget block shares this frame; the greeting hero does not. */
const BLOCK = '.overflow-hidden.rounded-lg';

function resetInterface(): void {
  useInterfaceStore.setState({ ...INTERFACE_DEFAULTS });
}

beforeEach(resetInterface);
afterEach(resetInterface);

describe('OverviewLayoutPreview', () => {
  it('labels the mock with the localized preview caption', () => {
    render(<OverviewLayoutPreview />);

    expect(screen.getByRole('img', { name: 'Overview preview' })).toBeInTheDocument();
  });

  it('renders all seven widget blocks expanded with the shipping defaults', () => {
    const { container } = render(<OverviewLayoutPreview />);

    const blocks = container.querySelectorAll(BLOCK);
    expect(blocks).toHaveLength(7);
    for (const block of blocks) {
      expect(block).toHaveClass('opacity-100');
    }
  });

  it('renders each widget mock at its designed tile/row count', () => {
    const { container } = render(<OverviewLayoutPreview />);

    const blocks = container.querySelectorAll(BLOCK);
    // stats, topWeek, clock, topAlbums, mixes, recommendations, recentlyAdded.
    expect(blocks[0].firstElementChild?.children).toHaveLength(4);
    expect(blocks[1].firstElementChild?.children).toHaveLength(3);
    expect(blocks[2].firstElementChild?.children).toHaveLength(7);
    expect(blocks[3].firstElementChild?.children).toHaveLength(3);
    expect(blocks[4].firstElementChild?.children).toHaveLength(4);
    expect(blocks[5].firstElementChild?.children).toHaveLength(5);
    expect(blocks[6].firstElementChild?.children).toHaveLength(2);
  });

  it('folds a widget block away when its toggle is off', () => {
    useInterfaceStore.setState({ overviewStats: false });
    const { container } = render(<OverviewLayoutPreview />);

    const stats = container.querySelectorAll(BLOCK)[0];
    expect(stats).toHaveClass('max-h-0', 'opacity-0');
    expect(stats).not.toHaveClass('max-h-8');
  });

  it('drops the clock/albums column when both of its widgets are off', () => {
    useInterfaceStore.setState({ overviewClock: false, overviewTopAlbums: false });
    const { container } = render(<OverviewLayoutPreview />);

    // The column is unmounted rather than collapsed, so two blocks disappear.
    expect(container.querySelectorAll(BLOCK)).toHaveLength(5);
  });

  it('drops the whole week grid when every widget in it is off', () => {
    useInterfaceStore.setState({
      overviewTopWeek: false,
      overviewClock: false,
      overviewTopAlbums: false,
    });
    const { container } = render(<OverviewLayoutPreview />);

    expect(container.querySelectorAll(BLOCK)).toHaveLength(4);
  });

  it('spotlights only the block matching the hovered settings row', () => {
    const { container } = render(<OverviewLayoutPreview highlightedKey="overviewMixes" />);

    const highlighted = container.querySelectorAll('.ring-1');
    expect(highlighted).toHaveLength(1);
    expect(container.querySelectorAll(BLOCK)[4]).toHaveClass('ring-1', 'ring-primary/40');
  });

  it('does not spotlight a hidden block', () => {
    useInterfaceStore.setState({ overviewMixes: false });
    const { container } = render(<OverviewLayoutPreview highlightedKey="overviewMixes" />);

    expect(container.querySelectorAll('.ring-1')).toHaveLength(0);
  });

  it('spotlights nothing when no settings row is hovered', () => {
    const { container } = render(<OverviewLayoutPreview />);

    expect(container.querySelectorAll('.ring-1')).toHaveLength(0);
  });
});
