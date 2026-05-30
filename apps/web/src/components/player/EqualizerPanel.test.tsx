import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EqualizerPanel } from './EqualizerPanel';

const mockState = vi.hoisted(() => ({
  enabled: false,
  preset: 'flat' as
    | 'flat'
    | 'rock'
    | 'pop'
    | 'jazz'
    | 'classical'
    | 'electronic'
    | 'dance'
    | 'hiphop'
    | 'acoustic'
    | 'vocal'
    | 'bassboost'
    | 'trebleboost'
    | 'loudness'
    | 'custom',
  gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  preampDb: 0,
  customPresets: [] as { id: string; name: string; gains: number[] }[],
  activeCustomId: null as string | null,
  setEnabled: vi.fn(),
  setBandGain: vi.fn(),
  setPreampDb: vi.fn(),
  applyPreset: vi.fn(),
  applyCustomPreset: vi.fn(),
  saveCustomPreset: vi.fn(),
  renameCustomPreset: vi.fn(),
  deleteCustomPreset: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/stores/useEqStore', async () => {
  const actual = await vi.importActual<typeof import('@/stores/useEqStore')>('@/stores/useEqStore');
  return {
    ...actual,
    useEqStore: <T,>(selector: (s: typeof mockState) => T) => selector(mockState),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'freq' in opts) return `${key}:${opts.freq}`;
      if (opts && 'gain' in opts) return `${key}:${opts.gain}`;
      if (ns) return `${ns}:${key}`;
      return key;
    },
  }),
}));

function renderPanel() {
  return render(
    <TooltipProvider>
      <EqualizerPanel />
    </TooltipProvider>
  );
}

describe('EqualizerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.enabled = false;
    mockState.preset = 'flat';
    mockState.gains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    mockState.preampDb = 0;
    mockState.customPresets = [];
    mockState.activeCustomId = null;
    mockState.setEnabled.mockReset();
    mockState.setBandGain.mockReset();
    mockState.setPreampDb.mockReset();
    mockState.applyPreset.mockReset();
    mockState.reset.mockReset();
  });

  it('renders the trigger button with the equalizer aria label', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'player:eqTooltip' })).toBeInTheDocument();
  });

  it('does not show the active indicator when disabled or on flat preset', () => {
    renderPanel();
    const button = screen.getByRole('button', { name: 'player:eqTooltip' });
    expect(button.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('shows the active indicator dot when enabled and using a non-flat preset', () => {
    mockState.enabled = true;
    mockState.preset = 'rock';
    renderPanel();
    const button = screen.getByRole('button', { name: 'player:eqTooltip' });
    expect(button.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('opens the popover on click and exposes the enable switch + reset', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'player:eqTooltip' }));

    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByText('equalizer:reset')).toBeInTheDocument();
  });

  it('calls setEnabled when the enable switch is toggled', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'player:eqTooltip' }));

    await user.click(screen.getByRole('switch'));
    expect(mockState.setEnabled).toHaveBeenCalledWith(true);
  });

  it('calls reset when the reset button is clicked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'player:eqTooltip' }));

    await user.click(screen.getByText('equalizer:reset'));
    expect(mockState.reset).toHaveBeenCalledOnce();
  });

  it('shows the preset label from the store in the Select trigger', async () => {
    mockState.preset = 'rock';
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'player:eqTooltip' }));

    // The rendered Select trigger should contain the rock preset label.
    const combobox = screen.getByRole('combobox');
    expect(combobox.textContent).toContain('equalizer:preset.rock');
  });

  it('shows the custom label when the preset is "custom"', async () => {
    mockState.preset = 'custom';
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'player:eqTooltip' }));

    const combobox = screen.getByRole('combobox');
    expect(combobox.textContent).toContain('equalizer:customPreset');
  });

  it('renders one slider per band plus the preamp slider', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'player:eqTooltip' }));

    // 10 bands + 1 preamp = 11 sliders.
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThanOrEqual(11);
  });
});
