import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DEFAULT_AMBIENT_LEVELS, useAmbientStore } from '@/stores/useAmbientStore';
import { useWeatherStore } from '@/stores/useWeatherStore';
import AmbienceMixer from './AmbienceMixer';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'layer' in opts) return `${String(opts.layer)} volume`;
      if (opts && 'value' in opts) return `${String(opts.value)}%`;
      return key;
    },
  }),
}));

function renderMixer(inline = false) {
  return render(
    <TooltipProvider>
      <AmbienceMixer inline={inline} />
    </TooltipProvider>
  );
}

describe('AmbienceMixer', () => {
  beforeEach(() => {
    localStorage.clear();
    useAmbientStore.setState({
      enabled: false,
      levels: { ...DEFAULT_AMBIENT_LEVELS },
      keepWhenPaused: false,
      followWeather: false,
    });
    useWeatherStore.setState({ enabled: false });
  });

  it('opens a mixer popover from a named player-bar button', async () => {
    const user = userEvent.setup();
    renderMixer();

    await user.click(screen.getByRole('button', { name: 'trigger' }));

    expect(await screen.findByRole('switch', { name: 'enable' })).toBeInTheDocument();
    for (const layer of ['rain', 'vinyl', 'noise', 'fire', 'cafe']) {
      expect(screen.getByRole('slider', { name: `layers.${layer} volume` })).toBeInTheDocument();
    }
  });

  it('switches ambience on from the master switch', async () => {
    const user = userEvent.setup();
    renderMixer(true);

    await user.click(screen.getByRole('switch', { name: 'enable' }));

    expect(useAmbientStore.getState().enabled).toBe(true);
  });

  it('moves a layer with the keyboard', async () => {
    const user = userEvent.setup();
    renderMixer(true);
    const fire = screen.getByRole('slider', { name: 'layers.fire volume' });

    fire.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');

    expect(useAmbientStore.getState().levels.fire).toBeCloseTo(0.02);
  });

  it('shows each layer level as a percentage', () => {
    useAmbientStore.setState({ levels: { ...DEFAULT_AMBIENT_LEVELS, vinyl: 0.37 } });
    renderMixer(true);

    expect(screen.getByText('37%')).toBeInTheDocument();
  });

  it('toggles keeping ambience over a pause', async () => {
    const user = userEvent.setup();
    renderMixer(true);

    await user.click(screen.getByRole('switch', { name: 'keepWhenPaused' }));

    expect(useAmbientStore.getState().keepWhenPaused).toBe(true);
  });

  it('only offers following the weather while weather is on', async () => {
    const user = userEvent.setup();
    const { rerender } = renderMixer(true);
    const follow = screen.getByRole('switch', { name: 'followWeather' });
    expect(follow).toBeDisabled();
    expect(screen.getByText('followWeatherOff')).toBeInTheDocument();

    useWeatherStore.setState({ enabled: true });
    rerender(
      <TooltipProvider>
        <AmbienceMixer inline />
      </TooltipProvider>
    );
    await user.click(screen.getByRole('switch', { name: 'followWeather' }));

    expect(useAmbientStore.getState().followWeather).toBe(true);
  });

  it('resets the mix', async () => {
    const user = userEvent.setup();
    useAmbientStore.setState({ levels: { ...DEFAULT_AMBIENT_LEVELS, fire: 0.8, rain: 0 } });
    renderMixer(true);

    await user.click(screen.getByRole('button', { name: 'reset' }));

    expect(useAmbientStore.getState().levels).toEqual(DEFAULT_AMBIENT_LEVELS);
  });

  it('renders inline without the popover trigger', () => {
    renderMixer(true);

    expect(screen.queryByRole('button', { name: 'trigger' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'enable' })).toBeInTheDocument();
  });
});
