import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Companion from './Companion';

describe('Companion', () => {
  it('stamps the data attributes the companion CSS keys off', () => {
    const { container } = render(
      <Companion species="shio" stage={2} mode="listening" motion={false} />
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('data-species', 'shio');
    expect(svg).toHaveAttribute('data-stage', '2');
    expect(svg).toHaveAttribute('data-state', 'listening');
    expect(svg).toHaveAttribute('data-face', 'half');
  });

  it('is invisible to assistive tech — pure decoration', () => {
    const { container } = render(
      <Companion species="hotaru" stage={0} mode="idle" motion={false} />
    );
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the chosen species rig', () => {
    const { container: shio } = render(
      <Companion species="shio" stage={0} mode="idle" motion={false} />
    );
    expect(shio.querySelector('[data-slot="shio-rig"]')).not.toBeNull();

    const { container: hotaru } = render(
      <Companion species="hotaru" stage={0} mode="idle" motion={false} />
    );
    expect(hotaru.querySelector('[data-slot="hotaru-rig"]')).not.toBeNull();
  });

  it('closes the eyes for the sleep family, opens them idle', () => {
    const { container: asleep } = render(
      <Companion species="shio" stage={1} mode="sleeping" motion={false} />
    );
    expect(asleep.querySelector('svg')).toHaveAttribute('data-face', 'closed');

    const { container: idle } = render(
      <Companion species="shio" stage={1} mode="idle" motion={false} />
    );
    expect(idle.querySelector('svg')).toHaveAttribute('data-face', 'open');
  });

  it('honors a face override (drag = wide eyes)', () => {
    const { container } = render(
      <Companion species="shio" stage={1} mode="listening" motion={false} faceOverride="open" />
    );
    expect(container.querySelector('svg')).toHaveAttribute('data-face', 'open');
  });

  it('applies loop classes only when motion is allowed (static first frame otherwise)', () => {
    const { container: moving } = render(
      <Companion species="shio" stage={1} mode="listening" motion />
    );
    expect(moving.querySelector('.companion-rig')).toHaveClass('companion-sway');

    const { container: still } = render(
      <Companion species="shio" stage={1} mode="listening" motion={false} />
    );
    expect(still.querySelector('.companion-rig')).not.toHaveClass('companion-sway');
  });

  it('survives an overlay without WAAPI support (jsdom) — the driver clears it', () => {
    const { container } = render(
      <Companion
        species="shio"
        stage={1}
        mode="listening"
        motion
        overlay="levelup"
        overlaySeq={1}
      />
    );
    expect(container.querySelectorAll('.companion-lvbub')).toHaveLength(5);
  });

  it('exposes peek as custom properties on the sprite root', () => {
    const { container } = render(
      <Companion species="shio" stage={1} mode="listening" motion peekOffset={{ x: 2, y: -1 }} />
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.style.getPropertyValue('--companion-peek-x')).toBe('2px');
    expect(svg.style.getPropertyValue('--companion-peek-y')).toBe('-1px');
    expect(svg.style.getPropertyValue('--companion-lean')).toBe('2deg');
  });
});
