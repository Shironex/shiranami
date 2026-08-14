import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';

import VinylPreview from './VinylPreview';

/** The dimmable wrapper around the live record miniature. */
const DISC_WRAP = '.size-\\[104px\\]';

function reset(): void {
  useUIStore.setState({
    vinylLabelSource: 'artwork',
    vinylRingStyle: 'glow',
    lowPerformanceMode: false,
  });
}

beforeEach(reset);
afterEach(reset);

describe('VinylPreview', () => {
  it('labels the mock with the localized preview caption', () => {
    render(<VinylPreview enabled />);

    expect(screen.getByRole('img', { name: 'Vinyl preview' })).toBeInTheDocument();
  });

  it('renders the live record miniature at full strength when enabled', () => {
    const { container } = render(<VinylPreview enabled />);

    expect(container.querySelector('[data-slot="vinyl-record"]')).toBeInTheDocument();
    expect(container.querySelector(DISC_WRAP)).toHaveClass('opacity-100');
  });

  it('dims the record when the display is disabled', () => {
    const { container } = render(<VinylPreview enabled={false} />);

    const wrap = container.querySelector(DISC_WRAP);
    expect(wrap).toHaveClass('opacity-25');
    expect(wrap).not.toHaveClass('opacity-100');
  });
});
