import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OnboardingKanji from './OnboardingKanji';

describe('OnboardingKanji', () => {
  it('paints the glyph as CSS generated content, not a text node', () => {
    const { container } = render(<OnboardingKanji glyph="蔵" />);

    const watermark = container.firstElementChild;
    expect(watermark).toHaveAttribute('data-kanji', '蔵');
    // `content: attr(data-kanji)` keeps the glyph out of the DOM text, so it is
    // never announced and never measured for color contrast.
    expect(watermark).toBeEmptyDOMElement();
    expect(screen.queryByText('蔵')).not.toBeInTheDocument();
  });

  it('renders a multi-character glyph unchanged', () => {
    const { container } = render(<OnboardingKanji glyph="白波" />);

    expect(container.firstElementChild).toHaveAttribute('data-kanji', '白波');
  });

  it('stays decorative — aria-hidden, unselectable, inert to pointers', () => {
    const { container } = render(<OnboardingKanji glyph="夜" />);

    const watermark = container.firstElementChild;
    expect(watermark).toHaveAttribute('aria-hidden', 'true');
    expect(watermark).toHaveClass('pointer-events-none', 'select-none');
  });
});
