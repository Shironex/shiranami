import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SplashWordmark from './SplashWordmark';

function renderWordmark(reducedMotion: boolean): HTMLElement {
  render(<SplashWordmark reducedMotion={reducedMotion} />);
  return screen.getByLabelText('白波 Shiranami');
}

describe('SplashWordmark', () => {
  it('renders the kanji reflection with a romanized label', () => {
    const wordmark = renderWordmark(false);

    // The glyph carries the reading so the mark is not announced as raw CJK.
    expect(wordmark).toHaveTextContent('白波');
    expect(wordmark.style.transform).toBe('rotate(-2deg)');
  });

  it('keeps the reflection at glass alpha rather than a violet logo tint', () => {
    const wordmark = renderWordmark(false);

    expect(wordmark.style.color).toBe('oklch(from var(--foreground) l c h / 0.07)');
  });

  it('wipes in with the blur-to-clarity etch by default', () => {
    expect(renderWordmark(false).style.animation).toBe(
      'shiranami-wordmark-etch 600ms ease-out 220ms both'
    );
  });

  it('falls back to an opacity-only fade under reduced motion', () => {
    const wordmark = renderWordmark(true);

    expect(wordmark.style.animation).toBe('shiranami-wordmark-fade 300ms ease-out 220ms both');
    // The 220ms delay is preserved so it still lands with the rest of the scene.
    expect(wordmark.style.animation).toContain('220ms');
  });
});
