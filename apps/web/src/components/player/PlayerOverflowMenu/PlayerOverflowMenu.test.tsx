import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useUIStore } from '@/stores/useUIStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import PlayerOverflowMenu from './PlayerOverflowMenu';

// The EQ + sleep-timer siblings pull in their own popovers and audio wiring,
// out of scope for the overflow menu's own structure. Stub them with markers.
vi.mock('../SleepTimer', () => ({ SleepTimer: () => <div data-testid="sleep-timer" /> }));
vi.mock('../EqualizerPanel', () => ({ EqualizerPanel: () => <div data-testid="eq-panel" /> }));

function renderMenu() {
  return render(
    <TooltipProvider>
      <PlayerOverflowMenu />
    </TooltipProvider>
  );
}

function reset(): void {
  useInterfaceStore.setState({
    playerSleepTimer: true,
    playerEqualizer: true,
    playerCompactButton: true,
    playerVisualizerButton: true,
  });
  useUIStore.setState({ showVisualizer: false });
}

beforeEach(reset);
afterEach(reset);

describe('PlayerOverflowMenu', () => {
  it('reveals the secondary controls when the trigger is opened', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'More' }));

    expect(screen.getByTestId('sleep-timer')).toBeInTheDocument();
    expect(screen.getByTestId('eq-panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compact mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle visualizer' })).toBeInTheDocument();
  });

  it('enters compact mode when the compact entry is pressed', async () => {
    const user = userEvent.setup();
    const setCompactMode = vi.fn(() => Promise.resolve());
    useCompactStore.setState({ setCompactMode });
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('button', { name: 'Compact mode' }));

    expect(setCompactMode).toHaveBeenCalledWith(true);
  });

  it('toggles the visualizer when the visualizer entry is pressed', async () => {
    const user = userEvent.setup();
    const toggleVisualizer = vi.fn();
    useUIStore.setState({ toggleVisualizer });
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('button', { name: 'Toggle visualizer' }));

    expect(toggleVisualizer).toHaveBeenCalledOnce();
  });

  it('hides the compact entry when its element toggle is off', async () => {
    const user = userEvent.setup();
    useInterfaceStore.setState({ playerCompactButton: false });
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'More' }));

    expect(screen.queryByRole('button', { name: 'Compact mode' })).not.toBeInTheDocument();
  });
});
