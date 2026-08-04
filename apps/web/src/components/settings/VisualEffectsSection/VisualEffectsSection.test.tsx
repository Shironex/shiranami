import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';

import VisualEffectsSection from './VisualEffectsSection';

function reset(): void {
  useUIStore.setState({
    nowPlayingViewEnabled: true,
    libraryHeroCardEnabled: true,
    lowPerformanceMode: false,
    noiseOverlayEnabled: false,
    tempoBreathingEnabled: true,
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('VisualEffectsSection', () => {
  it('renders the effect toggle rows', () => {
    render(<VisualEffectsSection />);

    expect(screen.getByText('Now Playing view')).toBeInTheDocument();
    expect(screen.getByText('Low performance mode')).toBeInTheDocument();
    expect(screen.getByText('Noise texture')).toBeInTheDocument();
    expect(screen.getByText('Tempo breathing')).toBeInTheDocument();
  });

  it('toggles tempo breathing through the store setter', async () => {
    const user = userEvent.setup();
    const setTempoBreathingEnabled = vi.fn();
    useUIStore.setState({ setTempoBreathingEnabled });
    render(<VisualEffectsSection />);

    await user.click(screen.getByRole('switch', { name: 'Tempo breathing' }));

    expect(setTempoBreathingEnabled).toHaveBeenCalledWith(false);
  });

  it('toggles low performance mode through the store setter', async () => {
    const user = userEvent.setup();
    const setLowPerformanceMode = vi.fn();
    useUIStore.setState({ setLowPerformanceMode });
    render(<VisualEffectsSection />);

    await user.click(screen.getByRole('switch', { name: 'Low performance mode' }));

    expect(setLowPerformanceMode).toHaveBeenCalledWith(true);
  });
});
