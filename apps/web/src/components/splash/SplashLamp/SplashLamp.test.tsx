import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SplashLamp from './SplashLamp';

function renderLamp(disabled?: boolean): HTMLElement {
  const { container } = render(<SplashLamp disabled={disabled} />);
  const glow = container.firstElementChild;
  if (!(glow instanceof HTMLElement)) throw new Error('lamp layer missing');
  return glow;
}

describe('SplashLamp', () => {
  it('renders a decorative full-bleed glow that never takes pointer events', () => {
    const glow = renderLamp();

    expect(glow).toHaveAttribute('aria-hidden', 'true');
    expect(glow).toHaveClass('absolute', 'inset-0', 'pointer-events-none');
  });

  it('places the warm --favorite hotspot in the top-right corner', () => {
    const glow = renderLamp();

    // The lamp is the only field-level color in the composition — it must stay
    // on --favorite (warm rose) so no violet bleeds onto the canvas.
    expect(glow.style.background).toContain('at 88% 14%');
    expect(glow.style.background).toContain('var(--favorite)');
    expect(glow.style.background).not.toContain('var(--primary)');
  });

  it('breathes on a 9s loop by default', () => {
    expect(renderLamp().style.animation).toBe('shiranami-lamp-breathe 9s ease-in-out infinite');
  });

  it('drops the breathe loop when disabled', () => {
    expect(renderLamp(true).style.animation).toBe('');
  });
});
