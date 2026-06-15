import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SplashGlass from './SplashGlass';

describe('SplashGlass', () => {
  it('renders decorative glass texture marked aria-hidden', () => {
    const { container } = render(<SplashGlass />);

    const root = container.firstElementChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.splash-glass-blur')).not.toBeNull();
  });
});
