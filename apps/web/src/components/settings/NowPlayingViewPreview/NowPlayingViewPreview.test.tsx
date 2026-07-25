import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import NowPlayingViewPreview from './NowPlayingViewPreview';

/** The tinted gradient wash behind the mock. */
const WASH = '.absolute.inset-0';
/** The expand affordance in the mock's top-right corner. */
const EXPAND_BADGE = '.size-8.rounded-lg';

describe('NowPlayingViewPreview', () => {
  it('labels the mock with the localized preview caption', () => {
    render(<NowPlayingViewPreview enabled />);

    expect(screen.getByRole('img', { name: 'Now Playing preview' })).toBeInTheDocument();
  });

  it('shows the gradient wash at full strength when the view is enabled', () => {
    const { container } = render(<NowPlayingViewPreview enabled />);

    expect(container.querySelector(WASH)).toHaveClass('opacity-100');
  });

  it('dims the gradient wash when the view is disabled', () => {
    const { container } = render(<NowPlayingViewPreview enabled={false} />);

    const wash = container.querySelector(WASH);
    expect(wash).toHaveClass('opacity-25');
    expect(wash).not.toHaveClass('opacity-100');
  });

  it('tints the expand affordance primary only while the view is enabled', () => {
    const { container: on } = render(<NowPlayingViewPreview enabled />);
    const { container: off } = render(<NowPlayingViewPreview enabled={false} />);

    expect(on.querySelector(EXPAND_BADGE)).toHaveClass('bg-primary/20', 'text-primary');
    expect(off.querySelector(EXPAND_BADGE)).toHaveClass('bg-muted/20', 'text-muted-foreground/50');
  });
});
