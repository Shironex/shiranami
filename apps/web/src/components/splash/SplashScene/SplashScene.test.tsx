import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SplashScene from './SplashScene';

describe('SplashScene', () => {
  it('renders the full set of distant window lights', () => {
    const { container } = render(<SplashScene reducedMotion={false} />);

    expect(container.querySelectorAll('.splash-light')).toHaveLength(15);
  });

  it('drops the flicker animation under reduced motion', () => {
    const { container } = render(<SplashScene reducedMotion />);

    const animated = Array.from(container.querySelectorAll<HTMLElement>('.splash-light')).filter(
      light => light.style.animation !== ''
    );
    expect(animated).toHaveLength(0);
  });
});
