import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ShioRig from './ShioRig';

function renderRig(ui: React.ReactElement) {
  return render(<svg>{ui}</svg>);
}

describe('ShioRig', () => {
  it('renders the foam body with the brand-constant foam class', () => {
    const { container } = renderRig(<ShioRig stage={0} mode="idle" motion={false} />);
    expect(container.querySelectorAll('.companion-foam').length).toBeGreaterThan(4);
  });

  it('keeps the face on the fixed dark ink, never the theme ink', () => {
    const { container } = renderRig(<ShioRig stage={2} mode="listening" motion={false} />);
    expect(container.querySelectorAll('.companion-ink').length).toBeGreaterThan(0);
    // Ink is a class resolved to the fixed oklch in CSS — no inline fills.
    for (const eye of container.querySelectorAll('.companion-ink')) {
      expect(eye.getAttribute('fill')).toBeNull();
    }
  });

  it('marks growth as additive stage layers', () => {
    const { container } = renderRig(<ShioRig stage={4} mode="idle" motion={false} />);
    // Stub tail is hatchling-only; the crest replaces it from stage II.
    expect(container.querySelector('.companion-s1-only')).not.toBeNull();
    expect(container.querySelector('.companion-crest.companion-s2')).not.toBeNull();
    // Headphones at IV, crescent halo at V — both present in the one rig.
    expect(container.querySelectorAll('.companion-s4').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.companion-s5').length).toBeGreaterThan(0);
  });

  it('rides the beat only while listening or grooving with motion allowed', () => {
    const { container: listening } = renderRig(<ShioRig stage={1} mode="listening" motion />);
    expect(listening.querySelector('.companion-beat-bob')).not.toBeNull();

    const { container: grooving } = renderRig(<ShioRig stage={1} mode="grooving" motion />);
    expect(grooving.querySelector('.companion-beat-bob-fast')).not.toBeNull();

    const { container: still } = renderRig(<ShioRig stage={1} mode="listening" motion={false} />);
    expect(still.querySelector('.companion-beat-bob')).toBeNull();
    expect(still.querySelector('.companion-beat-bob-fast')).toBeNull();
  });

  it('gives the hatchling bigger eyes', () => {
    const { container } = renderRig(<ShioRig stage={0} mode="idle" motion={false} />);
    const eye = container.querySelector('.companion-f-open .companion-ink');
    expect(eye?.getAttribute('ry')).toBe('3.8');
  });

  it('mounts only the worn accessory layer, and none when bare', () => {
    const { container: bare } = renderRig(<ShioRig stage={2} mode="idle" motion={false} />);
    expect(bare.querySelector('.companion-outfit')).toBeNull();

    const { container: dressed } = renderRig(
      <ShioRig stage={2} mode="idle" motion={false} outfit="umbrella" />
    );
    expect(dressed.querySelectorAll('.companion-outfit')).toHaveLength(1);
    expect(dressed.querySelector('.companion-o-umbrella')).not.toBeNull();
    expect(dressed.querySelector('.companion-o-scarf')).toBeNull();
  });

  it('pulses the lantern glow only when motion is allowed', () => {
    const { container: moving } = renderRig(
      <ShioRig stage={2} mode="idle" motion outfit="lantern" />
    );
    expect(moving.querySelector('.companion-o-lantern')).toHaveClass('companion-lantern-glow');

    const { container: still } = renderRig(
      <ShioRig stage={2} mode="idle" motion={false} outfit="lantern" />
    );
    expect(still.querySelector('.companion-o-lantern')).not.toHaveClass('companion-lantern-glow');
  });
});
