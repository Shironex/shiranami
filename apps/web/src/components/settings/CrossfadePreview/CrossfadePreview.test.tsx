import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CrossfadePreview from './CrossfadePreview';

/** The incoming-track bar is the only sky-tinted block. */
const INCOMING_BAR = '.bg-sky-400\\/45';
/** The soft overlap glow only renders while blending. */
const BLEND_GLOW = '.blur-sm';

describe('CrossfadePreview', () => {
  it('labels both sides of the transition', () => {
    render(<CrossfadePreview enabled duration={6} />);

    expect(screen.getByText('Transition preview')).toBeInTheDocument();
    expect(screen.getByText('Current track')).toBeInTheDocument();
    expect(screen.getByText('Next track')).toBeInTheDocument();
  });

  it('overlaps the incoming track and shows the blend glow when enabled', () => {
    const { container } = render(<CrossfadePreview enabled duration={6} />);

    expect(container.querySelector(INCOMING_BAR)).toHaveStyle({ left: '42%', width: '42%' });
    expect(container.querySelector(BLEND_GLOW)).not.toBeNull();
    expect(screen.getByText('Tracks overlap smoothly')).toBeInTheDocument();
  });

  it('parks the incoming track at the boundary with no glow when disabled', () => {
    const { container } = render(<CrossfadePreview enabled={false} duration={6} />);

    expect(container.querySelector(INCOMING_BAR)).toHaveStyle({ left: '68%', width: '0.5rem' });
    expect(container.querySelector(BLEND_GLOW)).toBeNull();
    expect(screen.getByText('Next track starts after a clean cut')).toBeInTheDocument();
  });

  it('reports the overlap length from the duration prop', () => {
    render(<CrossfadePreview enabled duration={8} />);

    expect(screen.getByText('8s overlap')).toBeInTheDocument();
  });

  it('reports a zero overlap when crossfade is off, whatever the duration', () => {
    render(<CrossfadePreview enabled={false} duration={8} />);

    expect(screen.getByText('0s')).toBeInTheDocument();
    expect(screen.queryByText('8s overlap')).not.toBeInTheDocument();
  });
});
