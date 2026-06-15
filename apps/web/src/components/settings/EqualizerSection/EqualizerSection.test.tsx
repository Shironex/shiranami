import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEqStore } from '@/stores/useEqStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import EqualizerSection from './EqualizerSection';

const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

function renderSection() {
  return render(
    <TooltipProvider>
      <EqualizerSection />
    </TooltipProvider>
  );
}

function reset(): void {
  useEqStore.setState({ enabled: true, preset: 'flat', gains: FLAT, preampDb: 0 });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('EqualizerSection', () => {
  it('renders the title, enable switch, and preset tiles', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: 'Equalizer' })).toBeInTheDocument();
    expect(screen.getByText('Enable equalizer')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flat' })).toBeInTheDocument();
  });

  it('toggles the equalizer through the store setter', async () => {
    const user = userEvent.setup();
    const setEnabled = vi.fn();
    useEqStore.setState({ setEnabled });
    renderSection();

    await user.click(screen.getByRole('switch'));

    expect(setEnabled).toHaveBeenCalledWith(false);
  });

  it('applies a named preset when its tile is pressed', async () => {
    const user = userEvent.setup();
    const applyPreset = vi.fn();
    useEqStore.setState({ applyPreset });
    renderSection();

    await user.click(screen.getByRole('button', { name: 'Rock' }));

    expect(applyPreset).toHaveBeenCalledWith('rock');
  });

  it('resets the equalizer through the store', async () => {
    const user = userEvent.setup();
    const resetEq = vi.fn();
    useEqStore.setState({ reset: resetEq });
    renderSection();

    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(resetEq).toHaveBeenCalled();
  });
});
