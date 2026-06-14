import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SplashDroplets from './SplashDroplets';

describe('SplashDroplets', () => {
  it('renders the full set of static droplets and running streaks', () => {
    const { container } = render(<SplashDroplets />);

    expect(container.querySelectorAll('ellipse')).toHaveLength(34);
    expect(container.querySelectorAll('.splash-streak')).toHaveLength(5);
  });
});
