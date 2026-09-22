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

  it('stamps data-outfit and mounts exactly one accessory layer when dressed', () => {
    const { container } = render(
      <Companion species="shio" stage={2} mode="listening" motion={false} outfit="scarf" />
    );
    expect(container.querySelector('svg')).toHaveAttribute('data-outfit', 'scarf');
    expect(container.querySelectorAll('.companion-outfit')).toHaveLength(1);
    expect(container.querySelector('.companion-o-scarf')).not.toBeNull();
  });

  it('renders bare (no data-outfit, no accessory nodes) when outfit is null or omitted', () => {
    const { container: omitted } = render(
      <Companion species="shio" stage={2} mode="listening" motion={false} />
    );
    expect(omitted.querySelector('svg')).not.toHaveAttribute('data-outfit');
    expect(omitted.querySelector('.companion-outfit')).toBeNull();

    const { container: explicit } = render(
      <Companion species="hotaru" stage={2} mode="listening" motion={false} outfit={null} />
    );
    expect(explicit.querySelector('svg')).not.toHaveAttribute('data-outfit');
    expect(explicit.querySelector('.companion-outfit')).toBeNull();
  });

  it('renders outfit=null byte-identical to the outfit-less sprite', () => {
    // The only per-render variance is the useId mask id — normalize it away.
    const normalize = (html: string) => html.replace(/_r_[a-z0-9]+_/g, '_id_');
    const { container: bare } = render(
      <Companion species="shio" stage={3} mode="idle" motion={false} />
    );
    const { container: nullOutfit } = render(
      <Companion species="shio" stage={3} mode="idle" motion={false} outfit={null} />
    );
    expect(normalize(nullOutfit.innerHTML)).toBe(normalize(bare.innerHTML));
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

  it('stamps data-accessories and layers every worn keepsake', () => {
    const { container } = render(
      <Companion
        species="shio"
        stage={4}
        mode="listening"
        motion={false}
        accessories={['beret', 'satchel']}
      />
    );
    expect(container.querySelector('svg')).toHaveAttribute('data-accessories', 'beret satchel');
    expect(container.querySelectorAll('.companion-acc')).toHaveLength(2);
    expect(container.querySelector('.companion-a-beret')).not.toBeNull();
    expect(container.querySelector('.companion-a-satchel')).not.toBeNull();
  });

  it('renders bare (no data-accessories, no keepsake nodes) when none are worn', () => {
    const { container } = render(
      <Companion species="hotaru" stage={4} mode="listening" motion={false} accessories={[]} />
    );
    expect(container.querySelector('svg')).not.toHaveAttribute('data-accessories');
    expect(container.querySelector('.companion-acc')).toBeNull();
  });
});
