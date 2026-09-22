import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';
import { useWindDownStore } from '@/stores/useWindDownStore';

import WindDownOverlay from './WindDownOverlay';
import { WIND_DOWN_MAX_DIM, getDimProgress } from './WindDownOverlay.hooks';

const decorativeMotion = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/useDecorativeMotion', () => ({
  useDecorativeMotion: () => decorativeMotion.value,
}));

function resetStores() {
  useSleepTimerStore.setState({ endTime: null, duration: null, remaining: 0, windDown: false });
  useWindDownStore.setState({
    lastCompletion: null,
    noteAcknowledged: false,
    closingLineUntil: null,
  });
}

describe('WindDownOverlay', () => {
  beforeEach(() => {
    decorativeMotion.value = true;
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('renders nothing while no wind-down is active', () => {
    const { container } = render(<WindDownOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing during a plain (non-wind-down) sleep timer', () => {
    useSleepTimerStore.setState({
      endTime: Date.now() + 60_000,
      duration: 1,
      remaining: 60,
      windDown: false,
    });

    const { container } = render(<WindDownOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dims inside the final window: veil is aria-hidden and never swallows clicks', () => {
    useSleepTimerStore.setState({
      endTime: Date.now() + 300_000,
      duration: 15,
      remaining: 300,
      windDown: true,
    });

    const { container } = render(<WindDownOverlay />);

    const layer = container.firstElementChild as HTMLElement;
    expect(layer).toHaveClass('pointer-events-none');

    const veil = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(veil).not.toBeNull();
    // 300s left of a 600s window → halfway through the ramp.
    expect(Number(veil.style.opacity)).toBeCloseTo(0.5 * WIND_DOWN_MAX_DIM, 5);
    // Nothing interactive or named reaches the a11y tree while dimming.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays invisible before the final window begins', () => {
    useSleepTimerStore.setState({
      endTime: Date.now() + 14 * 60_000,
      duration: 15,
      remaining: 14 * 60,
      windDown: true,
    });

    const { container } = render(<WindDownOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the closing line as a polite status while it lingers', () => {
    useWindDownStore.setState({ closingLineUntil: Date.now() + 8_000 });

    render(<WindDownOverlay />);

    const line = screen.getByRole('status');
    expect(line).toHaveTextContent(/sleep well/i);
  });

  it('applies the end-state dim without transitions under reduced motion', () => {
    decorativeMotion.value = false;
    useSleepTimerStore.setState({
      endTime: Date.now() + 60_000,
      duration: 15,
      remaining: 60,
      windDown: true,
    });

    const { container } = render(<WindDownOverlay />);

    const veil = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(veil.className).not.toMatch(/transition-opacity/);
    expect(Number(veil.style.opacity)).toBeGreaterThan(0);
  });
});

describe('getDimProgress', () => {
  it('is 0 before the final window and ramps linearly inside it', () => {
    expect(getDimProgress(601, 15, true)).toBe(0);
    expect(getDimProgress(600, 15, true)).toBe(0);
    expect(getDimProgress(450, 15, true)).toBeCloseTo(0.25, 5);
    expect(getDimProgress(0, 15, true)).toBe(1);
  });

  it('holds at 1 through the expiry fade (timer no longer running)', () => {
    expect(getDimProgress(0, null, false)).toBe(1);
  });

  it('scales the window down for timers shorter than the dim window', () => {
    // A 5-minute wind-down ramps over its whole length.
    expect(getDimProgress(300, 5, true)).toBe(0);
    expect(getDimProgress(150, 5, true)).toBeCloseTo(0.5, 5);
  });
});
