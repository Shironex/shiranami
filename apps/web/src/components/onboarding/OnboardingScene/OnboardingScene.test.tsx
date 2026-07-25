import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OnboardingScene from './OnboardingScene';

describe('OnboardingScene', () => {
  it('stacks the three splash layers it composes', () => {
    const { container } = render(<OnboardingScene reducedMotion={false} />);

    // Night scene (window lights), clinging droplets + streaks, and wet glass.
    expect(container.querySelectorAll('.splash-light')).toHaveLength(15);
    expect(container.querySelectorAll('.splash-streak')).toHaveLength(5);
    expect(container.querySelector('.splash-glass-blur')).not.toBeNull();
  });

  it('omits the splash-only rain and steam layers', () => {
    const { container } = render(<OnboardingScene reducedMotion={false} />);

    // The wizard is a long-lived overlay, so the rAF rain canvas and the steam
    // paths that the 2.5s splash affords are left out.
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('.splash-steam')).toBeNull();
  });

  it('animates the window lights when motion is allowed', () => {
    const { container } = render(<OnboardingScene reducedMotion={false} />);

    const animated = Array.from(container.querySelectorAll<HTMLElement>('.splash-light')).filter(
      light => light.style.animation !== ''
    );
    expect(animated).toHaveLength(15);
  });

  it('freezes the window lights when reduced motion is requested', () => {
    const { container } = render(<OnboardingScene reducedMotion />);

    const animated = Array.from(container.querySelectorAll<HTMLElement>('.splash-light')).filter(
      light => light.style.animation !== ''
    );
    expect(animated).toHaveLength(0);
  });

  it('hides the whole backdrop from assistive tech', () => {
    const { container } = render(<OnboardingScene reducedMotion={false} />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
