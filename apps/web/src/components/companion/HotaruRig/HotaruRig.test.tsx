import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HotaruRig from './HotaruRig';

function renderRig(ui: React.ReactElement) {
  return render(<svg>{ui}</svg>);
}

describe('HotaruRig', () => {
  it('renders the bell with the brand-constant foam class', () => {
    const { container } = renderRig(<HotaruRig stage={0} mode="idle" motion={false} />);
    expect(container.querySelectorAll('.companion-foam').length).toBeGreaterThan(0);
  });

  it('fills the bell with one glow-mote per stage, additively', () => {
    const { container } = renderRig(<HotaruRig stage={4} mode="idle" motion={false} />);
    const motes = container.querySelectorAll('.companion-glow');
    expect(motes).toHaveLength(5);
    // Motes 2–5 are stage-gated; the first is the hatchling's own light.
    expect(container.querySelectorAll('.companion-glow.companion-s2')).toHaveLength(1);
    expect(container.querySelectorAll('.companion-glow.companion-s5')).toHaveLength(1);
    expect(motes[0].classList.contains('companion-s2')).toBe(false);
  });

  it('gives the outer tendril pair the accent from stages III and IV', () => {
    const { container } = renderRig(<HotaruRig stage={4} mode="idle" motion={false} />);
    expect(container.querySelectorAll('.companion-tendril')).toHaveLength(5);
    const accents = container.querySelectorAll('.companion-tendril-accent');
    expect(accents).toHaveLength(2);
    expect(accents[0].classList.contains('companion-s3')).toBe(true);
    expect(accents[1].classList.contains('companion-s4')).toBe(true);
  });

  it('trails the tempo with tendrils and motes while listening', () => {
    const { container } = renderRig(<HotaruRig stage={1} mode="listening" motion />);
    // Both the tendril group and the mote group ride the counter-phase bob.
    expect(container.querySelectorAll('.companion-beat-bob')).toHaveLength(2);

    const { container: still } = renderRig(<HotaruRig stage={1} mode="listening" motion={false} />);
    expect(still.querySelectorAll('.companion-beat-bob')).toHaveLength(0);
  });

  it('keeps the face on the fixed dark ink', () => {
    const { container } = renderRig(<HotaruRig stage={2} mode="listening" motion={false} />);
    expect(container.querySelectorAll('.companion-ink').length).toBeGreaterThan(0);
  });
});
