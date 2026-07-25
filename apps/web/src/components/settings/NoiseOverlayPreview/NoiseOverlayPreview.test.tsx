import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import NoiseOverlayPreview from './NoiseOverlayPreview';

/** The grain layer is the only translucent full-bleed layer above the wash. */
const NOISE_LAYER = '.absolute.inset-0.opacity-35';
/** Both the wash and the grain layer share this frame. */
const FULL_BLEED_LAYER = '.absolute.inset-0';

describe('NoiseOverlayPreview', () => {
  it('labels the mock with the localized preview caption', () => {
    render(<NoiseOverlayPreview enabled />);

    expect(screen.getByRole('img', { name: 'Noise preview' })).toBeInTheDocument();
  });

  it('layers the grain texture over the gradient wash when enabled', () => {
    const { container } = render(<NoiseOverlayPreview enabled />);

    expect(container.querySelectorAll(FULL_BLEED_LAYER)).toHaveLength(2);
    expect(container.querySelector(NOISE_LAYER)).not.toBeNull();
    expect(screen.getByText('Texture enabled')).toBeInTheDocument();
  });

  it('drops the grain layer entirely when disabled', () => {
    const { container } = render(<NoiseOverlayPreview enabled={false} />);

    // Only the gradient wash remains.
    expect(container.querySelectorAll(FULL_BLEED_LAYER)).toHaveLength(1);
    expect(container.querySelector(NOISE_LAYER)).toBeNull();
    expect(screen.getByText('Texture disabled')).toBeInTheDocument();
  });

  it('keeps the gradient wash in both states', () => {
    const { container: on } = render(<NoiseOverlayPreview enabled />);
    const { container: off } = render(<NoiseOverlayPreview enabled={false} />);

    expect(on.querySelector(FULL_BLEED_LAYER)?.getAttribute('style')).toContain('radial-gradient');
    expect(off.querySelector(FULL_BLEED_LAYER)?.getAttribute('style')).toContain('radial-gradient');
  });
});
