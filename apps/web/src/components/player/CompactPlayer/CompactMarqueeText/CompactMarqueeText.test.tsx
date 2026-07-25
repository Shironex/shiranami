import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';

import CompactMarqueeText from './CompactMarqueeText';

const LONG_TEXT = 'A considerably longer compact track title';

/**
 * jsdom reports 0 for every box metric, so the two the marquee measures are
 * stubbed on the prototype the clipped `<p>` inherits from.
 */
function stubLineMetrics(scrollWidth: number, clientWidth: number): void {
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
}

function line(container: HTMLElement): HTMLParagraphElement | null {
  return container.querySelector('p');
}

function inner(container: HTMLElement): HTMLSpanElement | null {
  return container.querySelector('span');
}

beforeEach(() => {
  useUIStore.setState({ lowPerformanceMode: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  useUIStore.setState({ lowPerformanceMode: false });
});

describe('CompactMarqueeText', () => {
  describe('when the text fits its container', () => {
    it('renders the text as a plain, unfocusable line', () => {
      stubLineMetrics(120, 120);
      const { container } = render(<CompactMarqueeText text="Drift" />);

      expect(inner(container)).toHaveTextContent('Drift');
      expect(line(container)).toHaveAttribute('tabindex', '-1');
    });

    it('adds no tooltip and no fade mask', () => {
      stubLineMetrics(120, 120);
      const { container } = render(<CompactMarqueeText text="Drift" />);

      expect(line(container)).not.toHaveAttribute('title');
      expect(line(container)?.className).not.toContain('mask-image');
    });

    it('leaves the inner span static — no marquee utilities, no shift', () => {
      stubLineMetrics(120, 120);
      const { container } = render(<CompactMarqueeText text="Drift" />);

      expect(inner(container)?.className).not.toContain('animate-marquee');
      expect(inner(container)).not.toHaveAttribute('style');
    });
  });

  describe('when the text overflows its container', () => {
    it('becomes focusable and exposes the full text as a tooltip', () => {
      stubLineMetrics(260, 120);
      const { container } = render(<CompactMarqueeText text={LONG_TEXT} />);

      expect(line(container)).toHaveAttribute('tabindex', '0');
      expect(line(container)).toHaveAttribute('title', LONG_TEXT);
    });

    it('fades the clipped right edge with the mask gradient', () => {
      stubLineMetrics(260, 120);
      const { container } = render(<CompactMarqueeText text={LONG_TEXT} />);

      expect(line(container)?.className).toContain('mask-image');
    });

    it('arms the marquee on hover/focus and shifts by the measured overflow', () => {
      stubLineMetrics(260, 120);
      const { container } = render(<CompactMarqueeText text={LONG_TEXT} />);

      const span = inner(container);
      expect(span?.className).toContain('group-hover/marquee:animate-marquee');
      expect(span?.className).toContain('group-focus-visible/marquee:animate-marquee');
      // scrollWidth - clientWidth = 140px offscreen, translated negatively.
      expect(span?.getAttribute('style')).toContain('-140px');
    });
  });

  describe('under low-performance mode', () => {
    it('keeps the overflowing line clipped, focusable and tooltipped', () => {
      useUIStore.setState({ lowPerformanceMode: true });
      stubLineMetrics(260, 120);
      const { container } = render(<CompactMarqueeText text={LONG_TEXT} />);

      expect(line(container)).toHaveAttribute('tabindex', '0');
      expect(line(container)).toHaveAttribute('title', LONG_TEXT);
      expect(line(container)?.className).toContain('mask-image');
    });

    it('drops the animation utilities and the shift variable', () => {
      useUIStore.setState({ lowPerformanceMode: true });
      stubLineMetrics(260, 120);
      const { container } = render(<CompactMarqueeText text={LONG_TEXT} />);

      expect(inner(container)?.className).not.toContain('animate-marquee');
      expect(inner(container)).not.toHaveAttribute('style');
    });
  });

  it('merges the caller className onto the clipped line', () => {
    stubLineMetrics(120, 120);
    const { container } = render(<CompactMarqueeText text="Drift" className="mt-0.5 text-xs" />);

    expect(line(container)?.className).toContain('mt-0.5');
    expect(line(container)?.className).toContain('text-xs');
    expect(line(container)?.className).toContain('overflow-hidden');
  });

  it('re-measures when the text changes', () => {
    stubLineMetrics(120, 120);
    const { container, rerender } = render(<CompactMarqueeText text="Drift" />);
    expect(line(container)).toHaveAttribute('tabindex', '-1');

    vi.restoreAllMocks();
    stubLineMetrics(300, 120);
    rerender(<CompactMarqueeText text={LONG_TEXT} />);

    expect(line(container)).toHaveAttribute('tabindex', '0');
    expect(line(container)).toHaveAttribute('title', LONG_TEXT);
  });
});
