import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect } from 'storybook/test';
import { useUIStore } from '@/stores/useUIStore';

import CompactMarqueeText from './CompactMarqueeText';

const LONG_TEXT = 'Midnight Tapes (Extended Rainy Rooftop Edit)';

/** Seed the performance preference the marquee honors. */
function seedPerformance(lowPerformanceMode: boolean): void {
  useUIStore.setState({ lowPerformanceMode });
}

/**
 * Fixed-width host for the line. The width and the single-line clipping are
 * pinned inline rather than through utility classes so the component's own
 * overflow measurement is real wherever the story runs — the story test runner
 * serves stories without the app's compiled utility stylesheet.
 */
function host(width: number): CSSProperties {
  return { width, whiteSpace: 'nowrap', overflow: 'hidden' };
}

/**
 * player · CompactMarqueeText. The single-line title/artist/album text of the
 * compact player. It measures its own overflow: a line that fits renders as
 * plain, unfocusable text, while a clipped line gains a right-edge fade mask, a
 * `title` tooltip, a tab stop, and a marquee that scrolls by exactly the
 * measured `scrollWidth - clientWidth` on hover or focus. Low-performance mode
 * keeps the clipping and the tooltip but drops the animation. Each story pins
 * its host width so the measurement is real, and the play functions assert the
 * resulting contract plus the keyboard reachability of a clipped line.
 */
const meta: Meta<typeof CompactMarqueeText> = {
  title: 'player/CompactMarqueeText',
  component: CompactMarqueeText,
  parameters: {
    layout: 'centered',
    // A clipped line is a tab stop carrying its own `title`; nothing here is a
    // control needing a role or a name — axe passes clean.
    a11y: { test: 'error' },
  },
  args: { className: 'text-xs text-foreground' },
};

export default meta;

type Story = StoryObj<typeof CompactMarqueeText>;

/** Fits — short text in a wide line: no mask, no tooltip, not a tab stop. */
export const Fits: Story = {
  args: { text: 'Drift' },
  decorators: [
    Story => {
      seedPerformance(false);
      return (
        <div style={host(320)} className="rounded-lg border border-border/30 p-2">
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const span = canvas.getByText('Drift');
    const line = span.parentElement;

    await expect(line).not.toHaveAttribute('title');
    await expect(line?.className).not.toContain('mask-image');
    await expect(span.className).not.toContain('animate-marquee');

    // Nothing is clipped, so the line stays out of the tab order entirely.
    await expect(line).toHaveAttribute('tabindex', '-1');
    await userEvent.tab();
    await expect(line).not.toHaveFocus();
  },
};

/** Overflowing — the clipped line: fade mask, tooltip, tab stop, marquee shift. */
export const Overflowing: Story = {
  args: { text: LONG_TEXT },
  decorators: [
    Story => {
      seedPerformance(false);
      return (
        <div style={host(160)} className="rounded-lg border border-border/30 p-2">
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const span = canvas.getByText(LONG_TEXT);
    const line = span.parentElement;

    await expect(line).toHaveAttribute('title', LONG_TEXT);
    await expect(line?.className).toContain('mask-image');
    // The animation is armed on hover and on focus, and travels by the measured
    // offscreen distance (a negative px value).
    await expect(span.className).toContain('group-hover/marquee:animate-marquee');
    await expect(span.getAttribute('style')).toContain('--marquee-shift: -');

    // A clipped line is reachable by keyboard so the marquee is not hover-only.
    await expect(line).toHaveAttribute('tabindex', '0');
    await userEvent.tab();
    await expect(line).toHaveFocus();
  },
};

/** Low-performance mode — still clipped and tooltipped, but never animates. */
export const LowPerformance: Story = {
  args: { text: LONG_TEXT },
  decorators: [
    Story => {
      seedPerformance(true);
      return (
        <div style={host(160)} className="rounded-lg border border-border/30 p-2">
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const span = canvas.getByText(LONG_TEXT);
    const line = span.parentElement;

    // The full text stays reachable: clipped, tooltipped and focusable.
    await expect(line).toHaveAttribute('title', LONG_TEXT);
    await expect(line).toHaveAttribute('tabindex', '0');
    // The motion itself is what the preference removes.
    await expect(span.className).not.toContain('animate-marquee');
    await expect(span).not.toHaveAttribute('style');
  },
};
