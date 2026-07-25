import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CompletionFlourish from './CompletionFlourish';

describe('CompletionFlourish', () => {
  it('renders the four-note cluster at its staggered glyph sizes', () => {
    const { container } = render(<CompletionFlourish />);

    const glyphs = Array.from(container.querySelectorAll<SVGElement>('svg'));
    expect(glyphs).toHaveLength(4);
    // Sizes are per-note so the cluster reads as depth rather than a row of
    // identical glyphs.
    expect(glyphs.map(glyph => glyph.style.width)).toEqual(['15px', '18px', '13px', '16px']);
  });

  it('emits every note from the top-center of its host', () => {
    const { container } = render(<CompletionFlourish />);

    const notes = Array.from(container.querySelectorAll('span'));
    expect(notes).toHaveLength(4);
    for (const note of notes) {
      expect(note).toHaveClass('absolute', 'left-1/2', 'top-0');
    }
  });

  it('stays decorative — hidden from assistive tech and inert to pointers', () => {
    const { container } = render(<CompletionFlourish />);

    const root = container.firstElementChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveClass('pointer-events-none');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
