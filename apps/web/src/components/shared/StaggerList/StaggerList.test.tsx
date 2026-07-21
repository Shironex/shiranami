import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StaggerList from './StaggerList';

/** Point the reduced-motion media query at the given preference. */
function setReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('StaggerList', () => {
  afterEach(() => setReducedMotion(false));

  it('renders its children inside the container', () => {
    const { getByText } = render(
      <StaggerList className="space-y-2">
        <span>row</span>
      </StaggerList>
    );

    expect(getByText('row')).toBeInTheDocument();
  });

  it('forwards className to the animated container', () => {
    const { container } = render(
      <StaggerList className="space-y-2">
        <span>row</span>
      </StaggerList>
    );

    expect(container.firstElementChild?.className).toContain('space-y-2');
  });

  it('renders a plain container under reduced motion', () => {
    setReducedMotion(true);

    const { container, getByText } = render(
      <StaggerList className="space-y-3">
        <span>row</span>
      </StaggerList>
    );

    expect(getByText('row')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('space-y-3');
  });
});
