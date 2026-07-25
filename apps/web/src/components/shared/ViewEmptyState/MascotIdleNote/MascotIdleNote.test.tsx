import { render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MascotIdleNote from './MascotIdleNote';
import {
  GAP_SPREAD_S,
  INITIAL_DELAY_SPREAD_S,
  MIN_GAP_S,
  MIN_INITIAL_DELAY_S,
  useMascotIdleNote,
} from './MascotIdleNote.hooks';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const matchMedia = window.matchMedia as unknown as ReturnType<typeof vi.fn>;

/**
 * Force `prefers-reduced-motion` for the rest of the test. `useReducedMotion`
 * reads `matchMedia` twice — once for its initial state and again inside an
 * effect — so the mock has to answer every call. Reset in `afterEach`.
 */
function setPrefersReducedMotion(reduced: boolean): void {
  matchMedia.mockImplementation((query: string) => ({
    matches: reduced && query === REDUCED_MOTION_QUERY,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  setPrefersReducedMotion(false);
});

describe('MascotIdleNote', () => {
  it('renders the note as inert decoration inside the mascot frame', () => {
    const { container } = render(<MascotIdleNote />);

    const note = container.querySelector('span[aria-hidden="true"]');
    expect(note).not.toBeNull();
    // Purely decorative: no pointer target, no layout impact, absolutely placed.
    expect(note).toHaveClass('pointer-events-none', 'absolute');
    expect(note?.querySelector('svg')).not.toBeNull();
    // ...and it stays out of the accessibility tree, contributing no text.
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders nothing under prefers-reduced-motion', () => {
    setPrefersReducedMotion(true);

    const { container } = render(<MascotIdleNote />);

    expect(container).toBeEmptyDOMElement();
  });

  it('randomizes the cadence within the documented windows', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const { result } = renderHook(() => useMascotIdleNote());

    expect(result.current.isVisible).toBe(true);
    expect(result.current.initialDelay).toBe(MIN_INITIAL_DELAY_S + 0.5 * INITIAL_DELAY_SPREAD_S);
    expect(result.current.gap).toBe(MIN_GAP_S + 0.5 * GAP_SPREAD_S);
  });

  it('picks the cadence once per mount rather than per render', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);

    const { result, rerender } = renderHook(() => useMascotIdleNote());
    const firstDelay = result.current.initialDelay;
    const firstGap = result.current.gap;
    expect(firstDelay).toBe(MIN_INITIAL_DELAY_S);
    expect(firstGap).toBe(MIN_GAP_S);

    random.mockReturnValue(1);
    rerender();

    // A re-render must not restart the note on a new schedule.
    expect(result.current.initialDelay).toBe(firstDelay);
    expect(result.current.gap).toBe(firstGap);
  });
});
